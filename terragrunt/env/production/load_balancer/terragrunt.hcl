terraform {
  source = "../../../aws//load_balancer"
}

dependencies {
  paths = ["../hosted_zone", "../network"]
}

dependency "hosted_zone" {
  config_path = "../hosted_zone"

  mock_outputs_allowed_terraform_commands = ["init", "fmt", "validate", "plan", "show"]
  mock_outputs_merge_with_state           = true
  mock_outputs = {
    hosted_zone_id   = "1234567890"
    hosted_zone_name = ""
  }
}

dependency "network" {
  config_path = "../network"

  mock_outputs_allowed_terraform_commands = ["init", "fmt", "validate", "plan", "show"]
  mock_outputs_merge_with_state           = true
  mock_outputs = {
    vpc_id                 = "mock-vpc-id"
    vpc_private_subnet_ids = ["mock-private-subnet-1"]
    vpc_public_subnet_ids  = ["mock-public-subnet-1"]
    vpc_cidr_block         = "10.0.0.0/16"
  }
}

locals {
  # Defensive: ensure outputs is a map even if dependency state not updated yet.
  hosted_zone_outputs = dependency.hosted_zone.outputs != null ? dependency.hosted_zone.outputs : {}
  # Safe lookup (won't error if key missing or outputs null).
  french_zone_id = try(lookup(local.hosted_zone_outputs, "french_zone_id", ""), "")
}

inputs = {
  hosted_zone_id         = dependency.hosted_zone.outputs.hosted_zone_id
  hosted_zone_name       = dependency.hosted_zone.outputs.hosted_zone_name
  french_zone_id         = local.french_zone_id
  vpc_id                 = dependency.network.outputs.vpc_id
  vpc_private_subnet_ids = dependency.network.outputs.vpc_private_subnet_ids
  vpc_public_subnet_ids  = dependency.network.outputs.vpc_public_subnet_ids
  vpc_cidr_block         = dependency.network.outputs.vpc_cidr_block
}

include {
  path = find_in_parent_folders("root.hcl")
}