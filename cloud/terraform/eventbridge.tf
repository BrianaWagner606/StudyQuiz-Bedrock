# Scheduled trigger for the cache prewarmer (Phase 2). Toggle with prewarm_enabled.
resource "aws_cloudwatch_event_rule" "prewarm" {
  count               = var.prewarm_enabled ? 1 : 0
  name                = "${local.name}-prewarm"
  description         = "Periodically warm the Study Quiz question cache."
  schedule_expression = var.prewarm_schedule
  tags                = local.tags
}

resource "aws_cloudwatch_event_target" "prewarm" {
  count     = var.prewarm_enabled ? 1 : 0
  rule      = aws_cloudwatch_event_rule.prewarm[0].name
  target_id = "prewarm-lambda"
  arn       = aws_lambda_function.prewarm.arn
}

resource "aws_lambda_permission" "prewarm_events" {
  count         = var.prewarm_enabled ? 1 : 0
  statement_id  = "AllowEventBridgePrewarm"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.prewarm.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.prewarm[0].arn
}
