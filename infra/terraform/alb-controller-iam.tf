# alb-controller-iam.tf
# IAM for the AWS Load Balancer Controller, the AWS/identity half.
# The controller itself is installed separately with Helm; this file only
# creates the permissions and the IRSA role it will assume.
#
# Chain: policy (permissions) -> role (holds them) -> trusted by the
# kube-system/aws-load-balancer-controller service account via OIDC.

# The controller's permissions, loaded from the official policy JSON file.
resource "aws_iam_policy" "alb_controller" {
  name        = "${var.cluster_name}-alb-controller-policy"
  description = "Permissions for the AWS Load Balancer Controller"
  policy      = file("${path.module}/alb-iam-policy.json")
}

# Strip the https:// from the OIDC issuer URL, the trust policy conditions
# need it without the scheme.
locals {
  oidc_issuer = replace(aws_eks_cluster.main.identity[0].oidc[0].issuer, "https://", "")
}

# The IRSA role. Its trust policy says: only the service account named
# aws-load-balancer-controller in kube-system, proven via our OIDC provider,
# may assume this role.
resource "aws_iam_role" "alb_controller" {
  name = "${var.cluster_name}-alb-controller-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Federated = aws_iam_openid_connect_provider.eks.arn
      }
      Action = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "${local.oidc_issuer}:aud" = "sts.amazonaws.com"
          "${local.oidc_issuer}:sub" = "system:serviceaccount:kube-system:aws-load-balancer-controller"
        }
      }
    }]
  })
}

# Attach the permissions to the role.
resource "aws_iam_role_policy_attachment" "alb_controller" {
  role       = aws_iam_role.alb_controller.name
  policy_arn = aws_iam_policy.alb_controller.arn
}