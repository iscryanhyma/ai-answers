# 
# Hosted zone for React Answers app
#

resource "aws_route53_zone" "ai_answers" {
  name = var.domain

  tags = {
    Name       = "${var.product_name}-zone"
    CostCentre = var.billing_code
    Terraform  = true
  }
}

resource "aws_route53_zone" "reponses_ia" {
  count = var.env == "production" ? 1 : 0
  name  = "reponses-ia.alpha.canada.ca"

  tags = {
    Name       = "${var.product_name}-zone"
    CostCentre = var.billing_code
    Terraform  = true
  }
}