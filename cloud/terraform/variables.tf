variable "region" {
  description = "AWS region to deploy into."
  type        = string
  default     = "us-east-1"
}

variable "name_prefix" {
  description = "Prefix for all resource names (lets you run dev/prod side by side)."
  type        = string
  default     = "studyquiz"
}

variable "upstream" {
  description = "Model provider the gateway calls: 'anthropic' (uses API key) or 'bedrock' (uses IAM)."
  type        = string
  default     = "anthropic"
  validation {
    condition     = contains(["anthropic", "bedrock"], var.upstream)
    error_message = "upstream must be 'anthropic' or 'bedrock'."
  }
}

variable "anthropic_api_key" {
  description = "Anthropic API key (sk-ant-...). Required when upstream = anthropic; leave blank for bedrock."
  type        = string
  default     = ""
  sensitive   = true
}

variable "default_model" {
  description = "Model id sent to Anthropic (ignored for bedrock, which uses bedrock_model_id)."
  type        = string
  default     = "claude-haiku-4-5-20251001"
}

variable "bedrock_model_id" {
  description = "Bedrock model id used when upstream = bedrock."
  type        = string
  default     = "anthropic.claude-3-5-haiku-20241022-v1:0"
}

variable "cache_ttl_seconds" {
  description = "How long the shared question cache keeps an entry."
  type        = number
  default     = 86400
}

variable "prewarm_schedule" {
  description = "EventBridge schedule expression for the cache prewarmer."
  type        = string
  default     = "rate(6 hours)"
}

variable "prewarm_enabled" {
  description = "Turn the scheduled prewarmer on/off."
  type        = bool
  default     = true
}

# ---- Cost / abuse guardrails ----
variable "budget_alert_email" {
  description = "Email for monthly spend alerts. Leave blank to skip creating a budget."
  type        = string
  default     = ""
}

variable "budget_limit_usd" {
  description = "Monthly budget amount (USD) that triggers the alerts."
  type        = number
  default     = 10
}

variable "throttle_rate_limit" {
  description = "Steady-state requests/second allowed across the API (caps cost if a token leaks)."
  type        = number
  default     = 5
}

variable "throttle_burst_limit" {
  description = "Burst request allowance for the API."
  type        = number
  default     = 10
}
