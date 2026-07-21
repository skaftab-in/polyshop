# providers.tf
# Configures the AWS provider. The provider is the plugin that lets Terraform
# talk to AWS. It uses the same credentials your AWS CLI already has, so there
# is nothing secret to put here.

provider "aws" {
  region = var.aws_region
}