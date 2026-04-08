# Values printed to the terminal after terraform apply.
# Copy the droplet_ip value into GitHub Secrets as VPS_HOST.
 
output "droplet_ip" {
  description = "Public IPv4 of the production server — add to GitHub Secrets as VPS_HOST"
  value       = digitalocean_droplet.prod.ipv4_address
}
 
output "droplet_id" {
  description = "DigitalOcean Droplet ID"
  value       = digitalocean_droplet.prod.id
}
 
output "ssh_command" {
  description = "SSH command to access the production server"
  value       = "ssh deploy@${digitalocean_droplet.prod.ipv4_address}"
}
 
output "ansible_command" {
  description = "Run this immediately after terraform apply"
  value       = "ansible-playbook -i ${digitalocean_droplet.prod.ipv4_address}, infra/ansible/playbook.yml"
}
