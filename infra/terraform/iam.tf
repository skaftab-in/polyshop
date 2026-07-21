# iam.tf
# The two IAM roles the cluster itself needs.
# - Cluster role: assumed by the EKS control plane so it can manage AWS resources.
# - Node role: assumed by the EC2 worker instances so the kubelet can function
#   and pull images.
# These are the same two roles built by hand in the console, now as code.

# ---------- Cluster role ----------
# Trust policy: only the EKS service is allowed to assume this role.
resource "aws_iam_role" "cluster" {
  name = "${var.cluster_name}-cluster-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "eks.amazonaws.com"
      }
      Action = "sts:AssumeRole"
    }]
  })
}

# The one managed policy the control plane needs.
resource "aws_iam_role_policy_attachment" "cluster_policy" {
  role       = aws_iam_role.cluster.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
}

# ---------- Node role ----------
# Trust policy: only EC2 instances are allowed to assume this role, because the
# worker nodes are EC2 machines. This is why the trusted entity differs from the
# cluster role.
resource "aws_iam_role" "node" {
  name = "${var.cluster_name}-node-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "ec2.amazonaws.com"
      }
      Action = "sts:AssumeRole"
    }]
  })
}

# The three managed policies worker nodes need.
# Declared as a set so we attach all three with one resource block instead of
# repeating the block three times.
resource "aws_iam_role_policy_attachment" "node_policies" {
  for_each = toset([
    "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy",
    "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy",
    "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly",
  ])

  role       = aws_iam_role.node.name
  policy_arn = each.value
}