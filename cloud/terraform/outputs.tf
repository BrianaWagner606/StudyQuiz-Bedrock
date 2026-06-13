output "api_base_url" {
  description = "Base URL of the HTTP API."
  value       = local.api_base
}

output "game_endpoint" {
  description = "Put this in study_quiz_bp/scripts/userConfig.js -> USER_API_ENDPOINT."
  value       = "${local.api_base}/v1/chat/completions"
}

output "auth_token" {
  description = "Shared Bearer token. Put it in userConfig.js -> USER_API_KEY and enter it in the dashboard. Read with: terraform output -raw auth_token"
  value       = random_password.auth_token.result
  sensitive   = true
}

output "dashboard_url" {
  description = "Teacher dashboard (CloudFront)."
  value       = "https://${aws_cloudfront_distribution.dashboard.domain_name}"
}

output "events_bucket" {
  description = "S3 bucket holding analytics events (Athena source)."
  value       = aws_s3_bucket.events.bucket
}
