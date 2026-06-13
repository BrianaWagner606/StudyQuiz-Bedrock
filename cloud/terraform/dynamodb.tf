# Shared question cache. On-demand billing (scales to zero) + TTL so stale
# entries expire automatically.
resource "aws_dynamodb_table" "cache" {
  name         = "${local.name}-cache"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "cacheKey"

  attribute {
    name = "cacheKey"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  tags = local.tags
}

# Cross-server player progress, keyed by player XUID.
resource "aws_dynamodb_table" "profiles" {
  name         = "${local.name}-profiles"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "xuid"

  attribute {
    name = "xuid"
    type = "S"
  }

  tags = local.tags
}

# Small config table; currently holds the single "class" assignment item.
resource "aws_dynamodb_table" "config" {
  name         = "${local.name}-config"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  tags = local.tags
}
