resource "aws_ecs_cluster" "main" {
  name = "${var.project_name}-cluster"
}

# Security group for App Service (ALB + SNS access)
resource "aws_security_group" "app_service" {
  name   = "${var.project_name}-app-sg"
  vpc_id = aws_vpc.main.id

  ingress {
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  # Allow SNS HTTP push (from anywhere, SNS uses various IPs)
  ingress {
    from_port   = 3000
    to_port     = 3000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project_name}-app-sg" }
}

# Security group for Session Manager
resource "aws_security_group" "session_manager" {
  name   = "${var.project_name}-sm-sg"
  vpc_id = aws_vpc.main.id

  ingress {
    from_port   = 3000
    to_port     = 3000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project_name}-sm-sg" }
}

# CloudWatch log groups
resource "aws_cloudwatch_log_group" "session_manager" {
  name              = "/ecs/${var.project_name}-session-manager"
  retention_in_days = 7
}

resource "aws_cloudwatch_log_group" "app_service" {
  name              = "/ecs/${var.project_name}-app-service"
  retention_in_days = 7
}

# Session Manager Task Definition
resource "aws_ecs_task_definition" "session_manager" {
  family                   = "${var.project_name}-session-manager"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.session_manager_task.arn

  container_definitions = jsonencode([{
    name      = "session-manager"
    image     = var.session_manager_image
    essential = true
    portMappings = [{
      containerPort = 3000
      protocol      = "tcp"
    }]
    environment = [
      { name = "AWS_REGION", value = var.aws_region },
      { name = "DYNAMODB_TABLE", value = aws_dynamodb_table.sessions.name },
      { name = "SNS_TOPIC_ARN", value = aws_sns_topic.session_invalidation.arn },
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.session_manager.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "ecs"
      }
    }
  }])
}

# Session Manager Service (standalone, public IP)
resource "aws_ecs_service" "session_manager" {
  name            = "${var.project_name}-session-manager"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.session_manager.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.session_manager.id]
    assign_public_ip = true
  }
}

# App Service Task Definition
resource "aws_ecs_task_definition" "app_service" {
  family                   = "${var.project_name}-app-service"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.app_service_task.arn

  container_definitions = jsonencode([{
    name      = "app-service"
    image     = var.app_service_image
    essential = true
    portMappings = [{
      containerPort = 3000
      protocol      = "tcp"
    }]
    environment = [
      { name = "AWS_REGION", value = var.aws_region },
      { name = "DYNAMODB_TABLE", value = aws_dynamodb_table.sessions.name },
      { name = "SNS_TOPIC_ARN", value = aws_sns_topic.session_invalidation.arn },
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.app_service.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "ecs"
      }
    }
  }])
}

# App Service ECS Service (behind ALB)
resource "aws_ecs_service" "app_service" {
  name            = "${var.project_name}-app-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.app_service.arn
  desired_count   = var.app_service_desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.app_service.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.app.arn
    container_name   = "app-service"
    container_port   = 3000
  }

  depends_on = [aws_lb_listener.app]
}
