# ---- Analytics events bucket (Phase 5) ----
resource "aws_s3_bucket" "events" {
  bucket        = "${local.name}-events-${data.aws_caller_identity.me.account_id}"
  force_destroy = true
  tags          = local.tags
}

resource "aws_s3_bucket_public_access_block" "events" {
  bucket                  = aws_s3_bucket.events.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ---- Teacher dashboard static site (Phase 3) ----
resource "aws_s3_bucket" "dashboard" {
  bucket        = "${local.name}-dashboard-${data.aws_caller_identity.me.account_id}"
  force_destroy = true
  tags          = local.tags
}

resource "aws_s3_bucket_public_access_block" "dashboard" {
  bucket                  = aws_s3_bucket.dashboard.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Inject the live API base URL into the dashboard at deploy time. We use a
# literal placeholder + replace() (not templatefile) so the HTML's own ${...}
# JS template literals are left untouched.
resource "aws_s3_object" "dashboard_index" {
  bucket        = aws_s3_bucket.dashboard.id
  key           = "index.html"
  content       = replace(file("${path.module}/../dashboard/index.html"), "%%API_BASE%%", local.api_base)
  content_type  = "text/html"
  cache_control = "no-cache"
  etag          = md5(replace(file("${path.module}/../dashboard/index.html"), "%%API_BASE%%", local.api_base))
}

resource "aws_cloudfront_origin_access_control" "dashboard" {
  name                              = "${local.name}-dashboard-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "dashboard" {
  enabled             = true
  default_root_object = "index.html"
  comment             = "${local.name} teacher dashboard"
  price_class         = "PriceClass_100"

  origin {
    domain_name              = aws_s3_bucket.dashboard.bucket_regional_domain_name
    origin_id                = "dashboard-s3"
    origin_access_control_id = aws_cloudfront_origin_access_control.dashboard.id
  }

  default_cache_behavior {
    target_origin_id       = "dashboard-s3"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = 300
    max_ttl     = 3600
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = local.tags
}

# Let only this CloudFront distribution read the dashboard bucket.
data "aws_iam_policy_document" "dashboard_bucket" {
  statement {
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.dashboard.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.dashboard.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "dashboard" {
  bucket = aws_s3_bucket.dashboard.id
  policy = data.aws_iam_policy_document.dashboard_bucket.json
}

data "aws_caller_identity" "me" {}
