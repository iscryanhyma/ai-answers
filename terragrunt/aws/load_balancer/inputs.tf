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

## Stage 1: french_zone_id removed; will reintroduce in Stage 2 rollout

variable "alternate_zone_id" {
  description = "Hosted zone ID for the alternate domain (if any)"
  type        = string
  default     = ""
}

variable "domain" {
  description = "Primary domain"
  type        = string
}

variable "san" {
  description = "Subject alternative names for ACM cert"
  type        = list(string)
  default     = []
}

variable "altdomain" {
  description = "Alternate (secondary) root domain"
  type        = string
  default     = ""
}

variable "env" {
  description = "Deployment environment"
  type        = string
}

variable "product_name" {
  description = "Product name used for naming resources"
  type        = string
}

variable "billing_code" {
  description = "Billing / cost center code"
  type        = string
}

variable "default_tags" {
  description = "Default tags map"
  type        = map(any)
  default     = {}
}

