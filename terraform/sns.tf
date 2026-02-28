resource "aws_sns_topic" "session_invalidation" {
  name = "${var.project_name}-session-invalidation"
  tags = { Name = "${var.project_name}-session-invalidation" }
}
