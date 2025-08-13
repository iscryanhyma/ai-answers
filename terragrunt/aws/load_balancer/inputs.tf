variable "hosted_zone_id" {
  description = "The hosted zone ID to create DNS records in"
  type        = string
}

variable "hosted_zone_name" {
  description = "Route53 hosted zone ID that will hold our DNS records"
  type        = string
}

variable "vpc_id" {
  description = "The VPC id of the url shortener"
  type        = string
}

variable "vpc_cidr_block" {
  description = "IP CIDR block of the VPC"
  type        = string
}

variable "vpc_public_subnet_ids" {
  description = "Public subnet ids of the VPC"
  type        = list(string)
}

variable "french_zone_id" {
  description = "Optional Route53 hosted zone ID for reponses-ia.alpha.canada.ca (only in production)"
  type        = string
  default     = ""
}

variable "env" {
  description = "Deployment environment (e.g., production, staging)"
  type        = string
}

variable "default_tags" {
  description = "Default tagging map passed from Terragrunt root"
  type        = map(string)
}

variable "billing_code" {
  description = "Billing code used for tagging"
  type        = string
}

variable "product_name" {
  description = "Product name used in resource naming"
  type        = string
}

