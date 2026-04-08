terraform {
  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2.0"
    }
  }
  required_version = ">= 1.0"
}
 
# Configure the DigitalOcean provider with the API token.
provider "digitalocean" {
  token = var.do_token
}
 
# ── SSH Keys ────────────────────────────────────────────────────────────────
 
# Admin key — used by you for manual SSH access and Ansible.
resource "digitalocean_ssh_key" "admin" {
  name       = "${var.project_name}-admin"
  public_key = file(pathexpand(var.ssh_public_key_path))
}
 
# GitHub Actions key — used by CI/CD pipeline for automated deploys.
resource "digitalocean_ssh_key" "github_actions" {
  name       = "${var.project_name}-github-actions"
  public_key = file(pathexpand(var.github_actions_public_key_path))
}
 
# ── Firewall ────────────────────────────────────────────────────────────────
# First layer of network security — applied at the DO network level,
# before traffic reaches the Droplet.
 
resource "digitalocean_firewall" "main" {
  name        = "${var.project_name}-firewall"
  droplet_ids = [digitalocean_droplet.prod.id]
 
  # Allow SSH from anywhere.
  # For stricter security, replace 0.0.0.0/0 with your management VPS IP.
  inbound_rule {
    protocol         = "tcp"
    port_range       = "22"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }
 
  # Allow HTTP — used for Let's Encrypt HTTP-01 challenge and redirect to HTTPS.
  inbound_rule {
    protocol         = "tcp"
    port_range       = "80"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }
 
  # Allow HTTPS — Telegram webhook, n8n editor, bot health checks.
  inbound_rule {
    protocol         = "tcp"
    port_range       = "443"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }
 
  # Allow all outbound traffic — needed for apt, docker pull, OpenAI API calls.
  outbound_rule {
    protocol              = "tcp"
    port_range            = "1-65535"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }
  outbound_rule {
    protocol              = "udp"
    port_range            = "1-65535"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }
  outbound_rule {
    protocol              = "icmp"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }
}
 
# ── Production Droplet ──────────────────────────────────────────────────────
 
resource "digitalocean_droplet" "prod" {
  name   = "${var.project_name}-prod"
  region = var.region
  size   = var.droplet_size
  image  = "ubuntu-22-04-x64"
 
  # Both SSH keys are injected into /root/.ssh/authorized_keys at creation time.
  ssh_keys = [
    digitalocean_ssh_key.admin.fingerprint,
    digitalocean_ssh_key.github_actions.fingerprint,
  ]
 
  # cloud-init script runs once on first boot, before Ansible.
  # Creates the deploy user and copies SSH keys from root.
  user_data = <<-EOF
    #!/bin/bash
    set -e

    export DEBIAN_FRONTEND=noninteractive
 
    # Update system packages
    apt-get update -y
    apt-get upgrade -y -o Dpkg::Options::="--force-confold"
 
    # Create a non-root deploy user for Ansible and GitHub Actions
    useradd -m -s /bin/bash deploy
    usermod -aG sudo deploy
 
    # Grant passwordless sudo — required for Ansible tasks that need root
    echo "deploy ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers
 
    # Copy root SSH authorized_keys to deploy user
    mkdir -p /home/deploy/.ssh
    cp /root/.ssh/authorized_keys /home/deploy/.ssh/
    chown -R deploy:deploy /home/deploy/.ssh
    chmod 700 /home/deploy/.ssh
    chmod 600 /home/deploy/.ssh/authorized_keys
  EOF
 
  lifecycle {
    create_before_destroy = true
  }
}
