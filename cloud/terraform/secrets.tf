# Shared auth token the game and dashboard present as a Bearer token. Generated
# so it never lives in source. Read it after apply with:
#   terraform output -raw auth_token
resource "random_password" "auth_token" {
  length  = 40
  special = false
}

resource "aws_secretsmanager_secret" "app" {
  name        = "${local.name}-secret"
  description = "Study Quiz: Anthropic API key + shared auth token."
  tags        = local.tags
}

resource "aws_secretsmanager_secret_version" "app" {
  secret_id = aws_secretsmanager_secret.app.id
  secret_string = jsonencode({
    anthropicApiKey = var.anthropic_api_key
    authToken       = random_password.auth_token.result
  })
}
