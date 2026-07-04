# Kubernetes manifests

Applied in order during the deployment phases:

- `00-namespace.yaml`  — the polyshop namespace
- `10-postgres.yaml`   — Postgres as a StatefulSet + PVC (durable, "pet")
- `20-redis.yaml`      — Redis as a Deployment, no volume (disposable cache)

App-tier manifests (catalog, insights, gateway, frontend), the Ingress, and the
HPA are built together during their phases so each concept is learned, not
copy-pasted. They will land here as we go.
