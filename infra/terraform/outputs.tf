# outputs.tf
# Values printed after apply. Handy for connecting kubectl and for wiring up
# the ALB controller later.

output "cluster_name" {
  description = "EKS cluster name"
  value       = aws_eks_cluster.main.name
}

output "cluster_endpoint" {
  description = "EKS API server endpoint"
  value       = aws_eks_cluster.main.endpoint
}

output "cluster_region" {
  description = "AWS region"
  value       = var.aws_region
}

output "oidc_provider_arn" {
  description = "ARN of the IAM OIDC provider (needed for IRSA roles)"
  value       = aws_iam_openid_connect_provider.eks.arn
}

output "configure_kubectl" {
  description = "Command to point kubectl at this cluster"
  value       = "aws eks update-kubeconfig --name ${aws_eks_cluster.main.name} --region ${var.aws_region}"
}

output "alb_controller_role_arn" {
  description = "IAM role ARN for the ALB controller service account (used by Helm)"
  value       = aws_iam_role.alb_controller.arn
}
output "cluster_autoscaler_role_arn" {
  description = "IAM role ARN for the cluster autoscaler service account (used by Helm)"
  value       = aws_iam_role.cluster_autoscaler.arn
}
output "ebs_csi_role_arn" {
  description = "IAM role ARN for the EBS CSI driver (informational; the addon already has it wired)"
  value       = aws_iam_role.ebs_csi.arn
}
output "vpc_id" {
  description = "VPC ID needed by alb-values.yaml's vpcId field"
  value       = aws_vpc.main.id
}