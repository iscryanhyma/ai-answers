
resource "aws_acm_certificate" "ai_answers" {
  domain_name               = var.domain
  subject_alternative_names = var.san
  validation_method         = "DNS"

  tags = {
    "CostCentre"  = var.billing_code
    "force_apply" = "2025-08-13"
  }

  lifecycle {
    create_before_destroy = true
  }
}

data "aws_route53_zone" "selected" {
  for_each = {
    for dvo in aws_acm_certificate.ai_answers.domain_validation_options : dvo.domain_name => dvo.domain_name
  }
  name         = each.key
  private_zone = false
}

resource "aws_route53_record" "ai_answers_certificate_validation" {
  for_each = {
    for dvo in aws_acm_certificate.ai_answers.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      type   = dvo.resource_record_type
      record = dvo.resource_record_value
    }
  }

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  type            = each.value.type
  zone_id         = data.aws_route53_zone.selected[each.key].zone_id

  ttl = 60
}

resource "aws_acm_certificate_validation" "ai_answers" {
  certificate_arn         = aws_acm_certificate.ai_answers.arn
  validation_record_fqdns = [for record in aws_route53_record.ai_answers_certificate_validation : record.fqdn]
}
