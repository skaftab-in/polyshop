# ebs-csi-iam.tf
# IAM + the addon itself for the EBS CSI driver, the storage-provisioning
# piece the local vCluster never needed (it had local-path-provisioner built
# in). Same IRSA pattern as alb-controller-iam.tf and cluster-autoscaler-iam.tf:
# a role trusted by this cluster's OIDC provider, scoped to one service account.
#
# Unlike the ALB controller and autoscaler, the driver itself IS installed here
# (as an aws_eks_addon), not with Helm — and the role ARN is attached at
# creation time, which is what avoids the CREATING deadlock: the controller
# pods get credentials on their first boot instead of starting without them
# and needing a role update afterward.

resource "aws_iam_role" "ebs_csi" {
  name = "${var.cluster_name}-ebs-csi-role"

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
          "${local.oidc_issuer}:sub" = "system:serviceaccount:kube-system:ebs-csi-controller-sa"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "ebs_csi" {
  role       = aws_iam_role.ebs_csi.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonEBSCSIDriverPolicy"
}

resource "aws_eks_addon" "ebs_csi" {
  cluster_name             = aws_eks_cluster.main.name
  addon_name               = "aws-ebs-csi-driver"
  service_account_role_arn = aws_iam_role.ebs_csi.arn

  resolve_conflicts_on_create = "OVERWRITE"
  resolve_conflicts_on_update = "OVERWRITE"

  # Needs somewhere to actually run its pods.
  depends_on = [aws_eks_node_group.main, aws_iam_role_policy_attachment.ebs_csi]
}