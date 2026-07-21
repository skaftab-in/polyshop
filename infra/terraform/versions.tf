# versions.tf
# Pins the Terraform version and the providers this project uses.
# Pinning versions is what makes a build reproducible: anyone who clones this
# repo gets the same provider behaviour we tested against, not whatever is
# newest that day.

terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}