output "alb_dns_name" {
  description = "ALB DNS name for App Service (GET /whoami)"
  value       = aws_lb.app.dns_name
}

output "ecr_session_manager_url" {
  description = "ECR repository URL for session-manager"
  value       = aws_ecr_repository.session_manager.repository_url
}

output "ecr_app_service_url" {
  description = "ECR repository URL for app-service"
  value       = aws_ecr_repository.app_service.repository_url
}

output "sns_topic_arn" {
  description = "SNS topic ARN for session invalidation"
  value       = aws_sns_topic.session_invalidation.arn
}

output "dynamodb_table_name" {
  description = "DynamoDB table name"
  value       = aws_dynamodb_table.sessions.name
}
