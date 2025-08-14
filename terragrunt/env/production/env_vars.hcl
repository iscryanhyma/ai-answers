inputs = {
  account_id       = "730335533085"
  env              = "production"
  cost_center_code = "ai-answers-prod"
  domain           = "ai-answers.alpha.canada.ca"
  # Stage 1 rollout: exclude French domain SAN until hosted zone applied and validated
  san              = ["*.ai-answers.alpha.canada.ca"]
}