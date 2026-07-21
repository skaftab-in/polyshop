# ALB Ingress plus Cluster Autoscaler runbook

Run this after `terraform apply` builds the cluster. Terraform creates the AWS
infrastructure and the two IRSA roles (ALB controller and Cluster Autoscaler),
but it does not install the controllers themselves. Both are installed here with
Helm, using values files rather than long `--set` flags.

Cluster facts this runbook assumes: `polyshop-eks`, region `us-west-2`,
Kubernetes 1.33, one managed node group of `t3.medium` (min 1, desired 2, max 3).

## 0. Get the values you need from Terraform

The role ARNs and the VPC id come from the apply. Fresh builds get a new VPC id,
so pull these every time rather than reusing old values. Run these from
`infra/terraform/`:

    cd infra/terraform
    terraform output cluster_autoscaler_role_arn
    terraform output alb_controller_role_arn
    aws eks describe-cluster --name polyshop-eks --region us-west-2 --query "cluster.resourcesVpcConfig.vpcId" --output text

Point kubectl at the cluster and confirm the nodes joined.

    aws eks update-kubeconfig --name polyshop-eks --region us-west-2
    kubectl get nodes

## 1. Values files

Two small files hold the Helm settings. Fill the placeholders from step 0.

`infra/helm/alb-values.yaml`

    clusterName: polyshop-eks
    region: us-west-2
    vpcId: <VPC_ID>
    serviceAccount:
      create: true
      name: aws-load-balancer-controller     # MUST match the trust rule on the ALB role
      annotations:
        eks.amazonaws.com/role-arn: <ALB_CONTROLLER_ROLE_ARN>

`infra/helm/ca-values.yaml`

    autoDiscovery:
      clusterName: polyshop-eks
    awsRegion: us-west-2
    rbac:
      serviceAccount:
        name: cluster-autoscaler              # MUST match the trust rule on the CA role
        annotations:
          eks.amazonaws.com/role-arn: <CA_ROLE_ARN>
    image:
      tag: v1.33.0                             # match the cluster minor version; must be a published tag

The two `serviceAccount.name` values are the important lines. Each IAM role's
trust policy is scoped to one exact service account name
(`system:serviceaccount:kube-system:<name>`). If the name here does not match,
AWS refuses the role, the pod runs but cannot call AWS, and scaling silently
never happens. Confirm the expected name with:

    aws iam get-role --role-name polyshop-eks-cluster-autoscaler-role --query "Role.AssumeRolePolicyDocument"

## 2. Install the ALB controller

    helm repo add eks https://aws.github.io/eks-charts
    helm repo update
    helm install aws-load-balancer-controller eks/aws-load-balancer-controller -n kube-system -f infra/helm/alb-values.yaml

Confirm it is up (2 replicas) and carries its badge.

    kubectl get deployment -n kube-system aws-load-balancer-controller
    kubectl get sa aws-load-balancer-controller -n kube-system -o jsonpath="{.metadata.annotations}"

## 3. Install the Cluster Autoscaler

    helm repo add autoscaler https://kubernetes.github.io/autoscaler
    helm repo update
    helm install cluster-autoscaler autoscaler/cluster-autoscaler -n kube-system -f infra/helm/ca-values.yaml

## 4. Verify IRSA before any load test

This is the step that was missing the first time. Prove both controllers can
reach AWS before testing, so a silent auth failure does not waste a scale test.

    kubectl get pods -n kube-system -l app.kubernetes.io/name=aws-cluster-autoscaler
    kubectl logs -n kube-system -l app.kubernetes.io/name=aws-cluster-autoscaler --tail=20

The pod should be `1/1 Running`. In the logs, look for it discovering the ASG
(a line like `Found ... availability zones for ASG "eks-polyshop-eks-nodes-..."`)
and confirm there is no `AccessDenied`. Discovering the ASG means IRSA works.

## 5. Deploy nginx behind the ALB

    kubectl apply -f infra/smoke-test/nginx.yaml
    kubectl apply -f infra/smoke-test/ingress.yaml
    kubectl get ingress nginx -w

The ADDRESS is empty at first, then fills with an `k8s-default-nginx-...elb.amazonaws.com`
name in a few seconds. The ALB itself needs another minute or two to pass health
checks. Then confirm traffic flows end to end:

    curl.exe http://<ADDRESS>

You should get the nginx welcome page, which proves Internet to ALB to pod.

## 6. Force a scale-up

Each nginx pod requests 500m CPU. A `t3.medium` gives about 1.9 usable CPU.
Scaling to 8 replicas needs 4 CPU, which overflows the current nodes, so some
pods go Pending and the autoscaler adds nodes up to the max of 3.

    kubectl scale deployment nginx --replicas=8
    kubectl get pods                      # some Running, some Pending
    kubectl describe pod -l app=nginx | Select-String -Pattern "Insufficient|FailedScheduling"
    kubectl get nodes -w                  # a new node appears NotReady then Ready

Watch the decision in the autoscaler log:

    kubectl logs -n kube-system -l app.kubernetes.io/name=aws-cluster-autoscaler --tail=30 | Select-String -Pattern "unschedulable|scale-up|setting group size"

The line to look for is `Scale-up: setting group ... size to 3`.

## 7. Scale back down (and what to expect)

    kubectl scale deployment nginx --replicas=2

Pods drop to 2 immediately, but nodes do not. Scale-down is deliberately slow
and conservative:

- There is a cooldown of about 10 minutes after any scale-up before scale-down
  starts (`scaleDownInCooldown=true` in the log). This prevents thrashing.
- A node is only removed after it has been continuously unneeded for about 10
  minutes, and only if every pod on it can move elsewhere.
- The autoscaler refuses to remove a node hosting a kube-system pod that has no
  PodDisruptionBudget (for example the ALB controller or coredns replicas). Such
  a node shows as unremovable even when it is nearly idle.
- It removes one node at a time. After each removal the layout changes and the
  unneeded timer resets for the rest.
- The node group min is 1, so it never goes below one node.

Watch it work:

    kubectl logs -n kube-system -l app.kubernetes.io/name=aws-cluster-autoscaler -f --tail=10

The removal shows as a `ToBeDeletedByClusterAutoscaler` taint on the node, then
`deleting pod for node scale down` lines (the drain), then the instance
terminates.

## 8. Tear down (order matters)

Delete the Ingress first so the controller removes the real ALB before Terraform
deletes the network. A leftover ALB can block the VPC from deleting.

    kubectl delete -f infra/smoke-test/ingress.yaml
    kubectl get ingress                   # expect none
    aws elbv2 describe-load-balancers --region us-west-2 --query "LoadBalancers[?contains(LoadBalancerName, 'k8s-default-nginx')].LoadBalancerName" --output text

Wait until that ALB query returns nothing, then remove the rest:

    kubectl delete -f infra/smoke-test/nginx.yaml
    helm uninstall cluster-autoscaler -n kube-system
    helm uninstall aws-load-balancer-controller -n kube-system
    cd infra/terraform && terraform destroy

After destroy finishes, confirm nothing is left billing. All three should
return empty:

    aws ec2 describe-instances --region us-west-2 --filters "Name=tag:eks:cluster-name,Values=polyshop-eks" --query "Reservations[].Instances[?State.Name=='running'].InstanceId" --output text
    aws elbv2 describe-load-balancers --region us-west-2 --query "LoadBalancers[].LoadBalancerName" --output text
    aws ec2 describe-nat-gateways --region us-west-2 --filter "Name=tag:Name,Values=polyshop-eks-nat" --query "NatGateways[?State=='available'].NatGatewayId" --output text

## Notes and gotchas

- Service account name is the whole IRSA contract. Terraform writes the role and
  its trust rule; Helm creates the service account and points it at the role.
  Both must use the same name or AWS refuses the role and scaling fails silently
  with no crash. Always pin `serviceAccount.name` in the values file.
- Pin the autoscaler `image.tag` to a published version that matches the cluster
  minor version. An unpublished tag leaves the pod in `ImagePullBackOff`.
- No separate ingress controller is needed. The AWS Load Balancer Controller
  handles `ingressClassName: alb` and builds a real ALB for it.
- Cost: control plane, nodes, and NAT gateway bill by the hour, and an ALB adds
  more once an Ingress exists. Tear down when done.