# oidc.tf
# The IAM OIDC provider for the cluster. This is the trust anchor that lets
# Kubernetes service accounts assume IAM roles (IRSA). It registers the
# cluster's OIDC issuer with IAM so AWS trusts identity tokens the cluster signs.
# This is the code equivalent of "eksctl utils associate-iam-oidc-provider".

# TLS data source: fetches the cluster OIDC issuer's certificate thumbprint,
# which IAM requires to trust the provider.
data "tls_certificate" "eks" {
  url = aws_eks_cluster.main.identity[0].oidc[0].issuer
}

resource "aws_iam_openid_connect_provider" "eks" {
  # The client that will present tokens is AWS STS.
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.eks.certificates[0].sha1_fingerprint]
  url             = aws_eks_cluster.main.identity[0].oidc[0].issuer

  tags = {
    Name = "${var.cluster_name}-oidc"
  }
}