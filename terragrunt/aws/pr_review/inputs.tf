variable "vpc_id" {
  description = "VPC ID to attach the Lambda's security group to"
  type        = string
}


variable "ai_answers_docdb_security_group_id" {
  description = "Security group ID for the ai-answers DocumentDB"
  type        = string
}

variable "ai_answers_lambda_client_iam_role_name" {
  description = "IAM role name for ai-answers client Lambda"
  type        = string
}

variable "env" {
  description = "Environment (staging, production)"
  type        = string
}

variable "billing_code" {
  description = "Billing code for cost center tagging"
  type        = string
}

variable "account_id" {
  description = "AWS Account ID"
  type        = string
}
