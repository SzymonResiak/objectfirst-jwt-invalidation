resource "aws_ecr_repository" "session_manager" {
  name                 = "${var.project_name}-session-manager"
  image_tag_mutability = "MUTABLE"
  force_delete         = true
}

resource "aws_ecr_repository" "app_service" {
  name                 = "${var.project_name}-app-service"
  image_tag_mutability = "MUTABLE"
  force_delete         = true
}
