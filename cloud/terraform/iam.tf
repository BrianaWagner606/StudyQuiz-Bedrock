data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

# ---------- Gateway Lambda role ----------
resource "aws_iam_role" "gateway" {
  name               = "${local.name}-gateway-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
  tags               = local.tags
}

resource "aws_iam_role_policy_attachment" "gateway_logs" {
  role       = aws_iam_role.gateway.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "aws_iam_policy_document" "gateway" {
  statement {
    sid       = "ReadSecret"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.app.arn]
  }
  statement {
    sid       = "CacheRW"
    actions   = ["dynamodb:GetItem", "dynamodb:PutItem"]
    resources = [aws_dynamodb_table.cache.arn]
  }
  statement {
    sid     = "InvokeBedrock"
    actions = ["bedrock:InvokeModel"]
    # Cross-region inference profiles (us.* / global.*) invoke the underlying
    # foundation model in several regions, so both resource types are required.
    resources = [
      "arn:aws:bedrock:*::foundation-model/*",
      "arn:aws:bedrock:*:*:inference-profile/*"
    ]
  }
}

resource "aws_iam_role_policy" "gateway" {
  name   = "${local.name}-gateway-policy"
  role   = aws_iam_role.gateway.id
  policy = data.aws_iam_policy_document.gateway.json
}

# ---------- Data API Lambda role ----------
resource "aws_iam_role" "api" {
  name               = "${local.name}-api-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
  tags               = local.tags
}

resource "aws_iam_role_policy_attachment" "api_logs" {
  role       = aws_iam_role.api.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "aws_iam_policy_document" "api" {
  statement {
    sid       = "ReadSecret"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.app.arn]
  }
  statement {
    sid     = "ProfilesAndConfig"
    actions = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:Scan"]
    resources = [
      aws_dynamodb_table.profiles.arn,
      aws_dynamodb_table.config.arn
    ]
  }
  statement {
    sid       = "WriteEvents"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.events.arn}/*"]
  }
}

resource "aws_iam_role_policy" "api" {
  name   = "${local.name}-api-policy"
  role   = aws_iam_role.api.id
  policy = data.aws_iam_policy_document.api.json
}

# ---------- Prewarm Lambda role ----------
resource "aws_iam_role" "prewarm" {
  name               = "${local.name}-prewarm-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
  tags               = local.tags
}

resource "aws_iam_role_policy_attachment" "prewarm_logs" {
  role       = aws_iam_role.prewarm.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "aws_iam_policy_document" "prewarm" {
  statement {
    sid       = "ReadSecret"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.app.arn]
  }
}

resource "aws_iam_role_policy" "prewarm" {
  name   = "${local.name}-prewarm-policy"
  role   = aws_iam_role.prewarm.id
  policy = data.aws_iam_policy_document.prewarm.json
}
