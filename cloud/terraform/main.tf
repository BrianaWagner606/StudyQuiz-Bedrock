# ============================================================
#  Study Quiz - Cloud backend (Terraform root)
# ============================================================
# Provisions the serverless backend for the Study Quiz add-on:
#   - HTTP API (API Gateway v2)            -> gateway + data API Lambdas
#   - DynamoDB                             -> question cache, player profiles, config
#   - Secrets Manager                      -> Anthropic key + shared auth token
#   - S3 + CloudFront                      -> teacher dashboard (static) + events bucket
#   - EventBridge schedule                 -> prewarm Lambda
#
# Deploy:  terraform init && terraform apply
# See cloud/README.md for the full walkthrough.

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws     = { source = "hashicorp/aws", version = "~> 5.40" }
    random  = { source = "hashicorp/random", version = "~> 3.6" }
    archive = { source = "hashicorp/archive", version = "~> 2.4" }
  }
}

provider "aws" {
  region = var.region
}

locals {
  name = var.name_prefix
  tags = {
    Project = "StudyQuiz"
    Managed = "terraform"
  }
}
