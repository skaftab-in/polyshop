# PolyShop on Kubernetes (local vCluster)

Deploying the PolyShop polyglot microservices store on a local Kubernetes
cluster, built in phases so each concept lands before the next one stacks on it.

This branch targets a **local vCluster** with the **nginx ingress controller**.
A later branch will swap the controller for the **AWS Load Balancer Controller**
and run the same app tier on **EKS**. The application manifests barely change
between the two. Only the ingress plumbing and image registry do.

## Architecture

```
Browser
  |
  v
Ingress (nginx)          /      -> frontend (React, nginx)
                         /api   -> gateway  (Node/Express)
                                     |
                     +---------------+---------------+
                     v                               v
              catalog (Java/Spring)           insights (FastAPI/Python)
                     |                               |
                     v                               v
                 Postgres                          Redis
```

Frontend, gateway, catalog, and insights are **stateless**, so they run as
Deployments. Postgres and Redis are **stateful**, so they run as StatefulSets
with their own persistent storage. That single distinction drives almost every
design choice below, including which things the HPA is allowed to scale.

## Services

| Service  | Language           | Port | Data     | Workload    |
|----------|--------------------|------|----------|-------------|
| frontend | React + Vite       | 80   | none     | Deployment  |
| gateway  | Node + Express     | 3000 | none     | Deployment  |
| catalog  | Java + Spring Boot | 8080 | Postgres | Deployment  |
| insights | Python + FastAPI   | 8000 | Redis    | Deployment  |
| postgres | postgres:16        | 5432 | PVC      | StatefulSet |
| redis    | redis:7            | 6379 | PVC      | StatefulSet |

## Repository layout

The `k8s/` directory is numbered by apply order. Dependencies flow downward, so
applying in numeric order resolves them without any extra orchestration.

```
k8s/
  00-namespace/
    namespace.yaml
  10-datastores/
    postgres-secret.yaml
    postgres-configmap.yaml
    postgres-service.yaml         # headless
    postgres-statefulset.yaml
    redis-service.yaml            # headless
    redis-statefulset.yaml
  20-app/
    catalog-deployment.yaml
    catalog-service.yaml
    insights-deployment.yaml
    insights-service.yaml
    gateway-deployment.yaml
    gateway-service.yaml
    frontend-deployment.yaml
    frontend-service.yaml
  30-ingress/
    ingress.yaml
  40-autoscaling/
    catalog-hpa.yaml
    gateway-hpa.yaml
```

One resource concern per file, grouped by service. This maps to how you operate
a cluster: apply in order, change one thing, review one thing. It is also the
shape reviewers expect in a pull request. Once every field here is understood,
the natural next step is Kustomize, with a `base/` plus `overlays/`, to remove
the copy-paste between environments. Learn the primitives first.

## Prerequisites

- A local Kubernetes cluster. This guide uses vCluster on Docker.
- `kubectl` pointed at that cluster.
- `helm` for installing the ingress controller and metrics-server chart.
- `docker` and a Docker Hub account for the service images.

### Creating the cluster

LoadBalancer type services need elevated privileges on vCluster. Without them
the ingress controller sits at `<pending>` for its external IP forever, because
nothing is provisioning the load balancer.

```bash
vcluster use driver docker
sudo vcluster create polyshop
```

The `sudo` is what enables LoadBalancer support. If you create without it, the
create log prints a warning that load balancer services are not supported, and
you either recreate with `sudo` or reach the controller through port-forward
instead.

## Building the images

Kubernetes pulls images, it never builds them. Build locally, tag with the
registry path and a real version, push, then reference that path in the
Deployments. Never use `:latest` in a manifest. A concrete version tells you
exactly what is running and avoids stale cached images on redeploy.

```bash
docker login

docker build -t skaftab/polyshop-catalog:0.1.0  ./catalog
docker build -t skaftab/polyshop-insights:0.1.0 ./insights
docker build -t skaftab/polyshop-gateway:0.1.0  ./gateway
docker build -t skaftab/polyshop-frontend:0.1.0 ./frontend

docker push skaftab/polyshop-catalog:0.1.0
docker push skaftab/polyshop-insights:0.1.0
docker push skaftab/polyshop-gateway:0.1.0
docker push skaftab/polyshop-frontend:0.1.0
```

Apple Silicon note: `docker build` produces arm64 by default, which is fine for
a local arm64 cluster. EKS nodes are usually amd64, so for the EKS branch you
rebuild with `docker buildx build --platform linux/amd64` or the images fail
there with an exec format error.

## Deploy in phases

```bash
# Phase 0: the namespace boundary
kubectl apply -f k8s/00-namespace/namespace.yaml
kubectl config set-context --current --namespace=polyshop

# Phase 10: datastores (stateful, must be up before the app tier)
kubectl apply -f k8s/10-datastores/

# Phase 20: app tier (stateless services)
kubectl apply -f k8s/20-app/

# check all six pods reach 1/1 Running
kubectl get pods
```

### Phase 30: ingress

The ingress controller is separate software from the Ingress object. The object
is just routing rules. The controller is the running pod that reads them and
accepts traffic. No controller means the Ingress does nothing, with no error.

```bash
helm upgrade --install ingress-nginx ingress-nginx \
  --repo https://kubernetes.github.io/ingress-nginx \
  --namespace ingress-nginx --create-namespace

# wait for an EXTERNAL-IP (needs the sudo-created cluster)
kubectl get svc -n ingress-nginx ingress-nginx-controller -w

kubectl apply -f k8s/30-ingress/
kubectl get ingress
```

The Ingress does path routing: `/api` goes to the gateway, everything else goes
to the frontend. Verify against the external IP:

```bash
curl http://<EXTERNAL-IP>/api/products   # product JSON, routed to gateway
# open http://<EXTERNAL-IP> in a browser  # UI, routed to frontend
```

### Phase 40: autoscaling

The HPA needs metrics-server to read CPU. It is not installed by default, and
without it the HPA shows `<unknown>` and never scales.

```bash
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml

# local clusters use self-signed kubelet certs, so skip verification (local only)
kubectl patch deployment metrics-server -n kube-system --type=json \
  -p='[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}]'

# confirm it serves real numbers BEFORE creating the HPA
kubectl top pods

kubectl apply -f k8s/40-autoscaling/
kubectl get hpa
```

A healthy `get hpa` shows a real percentage in TARGETS, like `12%/60%`. Both
catalog and gateway jump to 2 replicas because of the `minReplicas: 2` floor.
`<unknown>/60%` means metrics-server is not delivering yet, so fix that first.

## Config parity with docker-compose

The Kubernetes env vars mirror `docker-compose.yml` on purpose. Compose is the
known-good local reference, so matching its variable names avoids pods that
start green then fail on the first request.

| Service  | Env vars                                            | Source in k8s                     |
|----------|-----------------------------------------------------|-----------------------------------|
| catalog  | DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD     | literals + postgres ConfigMap/Secret |
| insights | REDIS_HOST, REDIS_PORT                              | literals                          |
| gateway  | PORT, CATALOG_URL, INSIGHTS_URL                     | literals (Service names)          |
| frontend | GATEWAY_HOST                                        | literal, substituted into nginx   |

catalog pulls its DB name, user, and password from the same ConfigMap and Secret
that Postgres itself uses. One source of truth, no drift, and the password is
never written in the Deployment file.

## Things that bit us, and why they were fine

**Redis showed `0/1 Running` at first.** `Running` is the process state,
`0/1` is readiness. The pod was up but its readiness probe had not passed yet.
It flipped to `1/1` on its own once the probe cleared. Not a failure, just
startup timing.

**catalog restarted once on a fresh cluster.** On a clean start, catalog and
Postgres come up together. catalog tried to reach the database before it
finished initializing, exited, and Kubernetes restarted it a second later once
Postgres was ready. A single restart at startup is the self-healing behavior
working. A climbing restart count is a real problem. One restart is not.

**External IP stuck at `<pending>`.** The vCluster was created without `sudo`,
so LoadBalancer services were disabled. The create log said so explicitly, and
`kubectl describe svc` showed empty events. Recreating with `sudo` fixed it.

**`wget` not found in the gateway container.** The gateway image is slim and
ships no `wget`. Slim and distroless images drop extra binaries to shrink size
and attack surface. Debug from a fuller image or use `kubectl debug` with an
ephemeral container.

## Probes

Backends use `tcpSocket` probes, which only check the port is listening.
Frontend uses `httpGet /` because nginx is guaranteed to answer it. When each
service exposes a real health route (Spring Boot `/actuator/health`, a FastAPI
health path), upgrading the backends to `httpGet` is a genuine improvement over
the safe TCP default.

## Teardown

```bash
kubectl delete namespace polyshop        # removes the whole app in one shot
helm uninstall ingress-nginx -n ingress-nginx
```

Deleting the namespace removes every PolyShop object inside it, including the
PVCs, so the datastore data is gone too. The ingress controller and
metrics-server live outside the namespace and are removed separately.

## Next: the EKS branch

The application manifests carry over unchanged. What changes:

- Images move from Docker Hub to ECR, and nodes authenticate through their IAM
  role rather than a pull secret.
- The nginx controller is replaced by the AWS Load Balancer Controller, which
  provisions a real ALB. The `<pending>` external IP problem disappears.
- The Ingress gains a `host:` and controller-specific annotations for the ALB.
- Datastores move out of the cluster to RDS and ElastiCache in real production,
  leaving only the stateless tier in Kubernetes.