# Zip each function directly from source. No build step: the functions use only
# Node's built-ins plus the AWS SDK v3, which is preinstalled in the nodejs20.x
# managed runtime.
data "archive_file" "gateway" {
  type        = "zip"
  source_dir  = "${path.module}/../lambda/gateway"
  output_path = "${path.module}/.build/gateway.zip"
}

data "archive_file" "api" {
  type        = "zip"
  source_dir  = "${path.module}/../lambda/api"
  output_path = "${path.module}/.build/api.zip"
}

data "archive_file" "prewarm" {
  type        = "zip"
  source_dir  = "${path.module}/../lambda/prewarm"
  output_path = "${path.module}/.build/prewarm.zip"
}

resource "aws_lambda_function" "gateway" {
  function_name    = "${local.name}-gateway"
  role             = aws_iam_role.gateway.arn
  runtime          = "nodejs20.x"
  handler          = "index.handler"
  filename         = data.archive_file.gateway.output_path
  source_code_hash = data.archive_file.gateway.output_base64sha256
  timeout          = 30
  memory_size      = 256

  environment {
    variables = {
      UPSTREAM          = var.upstream
      SECRET_ARN        = aws_secretsmanager_secret.app.arn
      CACHE_TABLE       = aws_dynamodb_table.cache.name
      CACHE_TTL_SECONDS = tostring(var.cache_ttl_seconds)
      DEFAULT_MODEL     = var.default_model
      BEDROCK_MODEL_ID  = var.bedrock_model_id
    }
  }

  tags = local.tags
}

resource "aws_lambda_function" "api" {
  function_name    = "${local.name}-api"
  role             = aws_iam_role.api.arn
  runtime          = "nodejs20.x"
  handler          = "index.handler"
  filename         = data.archive_file.api.output_path
  source_code_hash = data.archive_file.api.output_base64sha256
  timeout          = 15
  memory_size      = 256

  environment {
    variables = {
      SECRET_ARN     = aws_secretsmanager_secret.app.arn
      PROFILES_TABLE = aws_dynamodb_table.profiles.name
      CONFIG_TABLE   = aws_dynamodb_table.config.name
      EVENTS_BUCKET  = aws_s3_bucket.events.bucket
    }
  }

  tags = local.tags
}

resource "aws_lambda_function" "prewarm" {
  function_name    = "${local.name}-prewarm"
  role             = aws_iam_role.prewarm.arn
  runtime          = "nodejs20.x"
  handler          = "index.handler"
  filename         = data.archive_file.prewarm.output_path
  source_code_hash = data.archive_file.prewarm.output_base64sha256
  timeout          = 120
  memory_size      = 256

  environment {
    variables = {
      SECRET_ARN    = aws_secretsmanager_secret.app.arn
      GATEWAY_URL   = "${local.api_base}/v1/chat/completions"
      DEFAULT_MODEL = var.default_model
    }
  }

  tags = local.tags
}
