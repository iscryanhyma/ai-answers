output "hosted_zone_id" {
  description = "Route53 hosted zone ID that will hold our DNS records"
  value       = aws_route53_zone.ai_answers.zone_id
}

output "hosted_zone_name" {
  description = "Route53 hosted zone name that will hold our DNS records"
  value       = aws_route53_zone.ai_answers.name
}

output "alternate_zone_id" {
  description = "Optional hosted zone id for alternate domain (if provided)"
  value       = length(aws_route53_zone.alternate) > 0 ? aws_route53_zone.alternate[0].zone_id : ""
}