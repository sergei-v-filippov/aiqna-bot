# Input variable declarations.
# Actual values are set in terraform.tfvars (excluded from git).
 
variable "do_token" {
  description = "DigitalOcean API token"
  type        = string
  sensitive   = true  # prevents the value from appearing in logs
}
 
variable "region" {
  description = "DigitalOcean datacenter region"
  type        = string
  default     = "ams3"  # Amsterdam — good latency for EU
  # Other options: fra1 (Frankfurt), lon1 (London), nyc3 (New York)
}
 
variable "droplet_size" {
  description = "Droplet size slug"
  type        = string
  default     = "s-2vcpu-4gb"  # 2 vCPU, 4 GB RAM — minimum for our stack
  # Stack RAM requirements: Qdrant ~600MB, n8n ~400MB, bot ~150MB, OS ~500MB
}
 
variable "ssh_public_key_path" {
  description = "Path to admin public SSH key (for manual access)"
  type        = string
  default     = "~/.ssh/id_ed25519.pub"
}
 
variable "github_actions_public_key_path" {
  description = "Path to GitHub Actions public SSH key (for CI/CD)"
  type        = string
  default     = "~/.ssh/github_actions_key.pub"
}
 
variable "project_name" {
  description = "Prefix applied to all created resources"
  type        = string
  default     = "aiqna-bot"
}
