# eks.tf
# The EKS control plane and a managed node group of worker nodes.
# This ties together the network (vpc.tf) and the IAM roles (iam.tf).

# ---------- Control plane ----------
resource "aws_eks_cluster" "main" {
  name     = var.cluster_name
  role_arn = aws_iam_role.cluster.arn
  version  = var.kubernetes_version

  vpc_config {
    # Control plane spans both private and public subnets.
    subnet_ids              = concat(aws_subnet.private[*].id, aws_subnet.public[*].id)
    endpoint_public_access  = true
    endpoint_private_access = true
  }

  # API auth mode, and make the identity running Terraform a cluster admin
  # automatically. This is what stops the "you created it as one identity but
  # connect as another" lockout we hit during the manual build.
  access_config {
    authentication_mode                         = "API"
    bootstrap_cluster_creator_admin_permissions = true
  }

  # The cluster cannot come up until the role has its policy attached, so we
  # wait for that explicitly.
  depends_on = [aws_iam_role_policy_attachment.cluster_policy]

  tags = {
    Name = var.cluster_name
  }
}

# ---------- Managed node group ----------
resource "aws_eks_node_group" "main" {
  cluster_name    = aws_eks_cluster.main.name
  node_group_name = "${var.cluster_name}-nodes"
  node_role_arn   = aws_iam_role.node.arn

  # Nodes live in the PRIVATE subnets only. They reach the internet outbound
  # via the NAT gateway, but are not reachable from the internet directly.
  subnet_ids = aws_subnet.private[*].id

  instance_types = ["t3.medium"]
  ami_type       = "AL2023_x86_64_STANDARD"
  capacity_type  = "ON_DEMAND"
  disk_size      = 20

  scaling_config {
    desired_size = 2
    min_size     = 1
    max_size     = 3
  }

  # During rolling updates, allow one node to be unavailable at a time.
  update_config {
    max_unavailable = 1
  }

  # Node group needs the node role's policies attached first, and the cluster
  # to exist. Terraform infers the cluster dependency from the reference above;
  # we add the policy attachments explicitly.
  depends_on = [aws_iam_role_policy_attachment.node_policies]

  tags = {
    Name = "${var.cluster_name}-nodes"
    # Cluster Autoscaler discovers this node group's ASG by these tags.
    # "enabled" turns the ASG on for autoscaling; the "owned" tag scopes it to
    # this cluster and is also what the IAM policy condition checks against.
    "k8s.io/cluster-autoscaler/enabled"             = "true"
    "k8s.io/cluster-autoscaler/${var.cluster_name}" = "owned"
  }
}