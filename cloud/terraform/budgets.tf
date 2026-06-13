# Monthly spend alarm. Created only when budget_alert_email is set. Emails at
# 80% actual and 100% forecasted so you hear about runaway cost early — your
# safety net if the shared token ever leaks.
#
# NOTE: this is an account-wide cost budget. If this AWS account also runs
# unrelated workloads, scope it with a cost_filter (e.g. by a cost-allocation
# tag) once that tag is activated in Billing.
resource "aws_budgets_budget" "monthly" {
  count = var.budget_alert_email != "" ? 1 : 0

  name         = "${local.name}-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.budget_limit_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.budget_alert_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.budget_alert_email]
  }
}
