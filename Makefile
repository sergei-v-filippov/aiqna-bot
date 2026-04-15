# aiqna-bot/Makefile
# Usage: make <target>
 
.PHONY: help infra-init infra-up infra-down ansible deploy up down logs ps clean backup
 
# ── Defaults ──────────────────────────────────────────────────────────────
PROD_IP   ?= $(shell cd infra/terraform && terraform output -raw droplet_ip 2>/dev/null)
GITHUB_KEY = $(shell cat ~/.ssh/github_actions_key.pub)
 
help:                                  ## Show this help message
	@grep -E '^[a-zA-Z_-]+:.*##' Makefile | awk 'BEGIN {FS=":.*##"}; {printf "  %-18s %s\n", $$1, $$2}'
 
# ── Infrastructure ────────────────────────────────────────────────────────
infra-init:                            ## Initialise Terraform (run once)
	cd infra/terraform && terraform init
 
infra-plan:                            ## Preview infrastructure changes
	cd infra/terraform && terraform plan
 
infra-up:                              ## Create the production VPS
	cd infra/terraform && terraform apply -auto-approve
	@echo ""
	@echo "Server IP: $$(cd infra/terraform && terraform output -raw droplet_ip)"
	@echo "Next step: make ansible"
 
infra-down:                            ## DESTROY the production VPS (stops billing)
	cd infra/terraform && terraform destroy
 
# ── Server setup ──────────────────────────────────────────────────────────
ansible:                               ## Configure the server with Ansible
	ansible-playbook \
	  -i "$(PROD_IP)," \
	  -u deploy \
	  --private-key ~/.ssh/id_ed25519 \
	  --extra-vars "github_actions_pubkey='$(GITHUB_KEY)'" \
	  infra/ansible/playbook.yml
 
# ── Application ───────────────────────────────────────────────────────────
up:                                    ## Start all services on the production server
	ssh deploy@$(PROD_IP) 'cd ~/app/aiqna-bot && docker compose up -d'
 
down:                                  ## Stop all services on the production server
	ssh deploy@$(PROD_IP) 'cd ~/app/aiqna-bot && docker compose down'
 
logs:                                  ## Stream bot logs from the production server
	ssh deploy@$(PROD_IP) 'cd ~/app/aiqna-bot && docker compose logs -f bot'
 
ps:                                    ## Show container status on the production server
	ssh deploy@$(PROD_IP) 'cd ~/app/aiqna-bot && docker compose ps'
 
clean:                                 ## Remove unused Docker images on the production server
	ssh deploy@$(PROD_IP) 'docker image prune -f'
 
# ── Backup ────────────────────────────────────────────────────────────────
backup:                                ## Download Qdrant and Postgres data backups
	@mkdir -p ./backups
	# Backup Qdrant vector store
	ssh deploy@$(PROD_IP) \
	  'docker run --rm -v aiqna-bot_qdrant_data:/data -v /tmp:/backup alpine \
	   tar czf /backup/qdrant-$(shell date +%Y%m%d).tar.gz /data'
	scp deploy@$(PROD_IP):/tmp/qdrant-$(shell date +%Y%m%d).tar.gz ./backups/
	# Backup Postgres
	ssh deploy@$(PROD_IP) \
	  'docker compose -f ~/app/aiqna-bot/docker-compose.yml exec -T postgres \
	   pg_dump -U n8n n8n > /tmp/postgres-$(shell date +%Y%m%d).sql'
	scp deploy@$(PROD_IP):/tmp/postgres-$(shell date +%Y%m%d).sql ./backups/
	@echo "Backups saved to ./backups/"
