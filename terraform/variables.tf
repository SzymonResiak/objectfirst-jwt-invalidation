variable "aws_region" {
  default = "eu-central-1"
}

variable "project_name" {
  default = "objectfirst-jwt"
}

variable "session_manager_image" {
  description = "ECR image URI for session-manager"
  type        = string
}

variable "app_service_image" {
  description = "ECR image URI for app-service"
  type        = string
}

variable "app_service_desired_count" {
  default = 2
}
