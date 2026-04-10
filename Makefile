SHELL := /bin/bash

ROOT := /var/www/perfumer-by
BACKEND := $(ROOT)/backend
FRONTEND := $(ROOT)/frontend

PHP := php
NPM := npm
PM2 := pm2

FRONT_DEV_NAME := perfumer-frontend-dev
FRONT_PROD_NAME := perfumer-frontend

.PHONY: help dev dev-restart dev-stop prod prod-restart prod-stop logs logs-dev status backend-clear backend-migrate backend-seed build install-front install-back

help:
	@echo "Available commands:"
	@echo "  make dev              - start frontend in dev mode"
	@echo "  make dev-restart      - restart frontend dev"
	@echo "  make dev-stop         - stop frontend dev"
	@echo "  make prod             - build frontend and start prod"
	@echo "  make prod-restart     - restart frontend prod"
	@echo "  make prod-stop        - stop frontend prod"
	@echo "  make logs             - prod frontend logs"
	@echo "  make logs-dev         - dev frontend logs"
	@echo "  make status           - pm2 list"
	@echo "  make backend-clear    - clear Laravel caches"
	@echo "  make backend-migrate  - run migrations"
	@echo "  make backend-seed     - seed catalog"

install-front:
	cd $(FRONTEND) && $(NPM) install

install-back:
	cd $(BACKEND) && composer install

build:
	cd $(FRONTEND) && rm -rf .next && $(NPM) run build

dev:
	@echo "Stopping old dev processes..."
	@$(PM2) delete $(FRONT_DEV_NAME) >/dev/null 2>&1 || true
	@fuser -k 3000/tcp >/dev/null 2>&1 || true
	@sleep 2
	@echo "Starting frontend dev..."
	@cd $(FRONTEND) && $(PM2) start npm --name $(FRONT_DEV_NAME) -- run dev
	@$(PM2) save >/dev/null 2>&1 || true
	@$(PM2) list

dev-restart:
	@$(MAKE) dev-stop
	@$(MAKE) dev

dev-stop:
	@echo "Stopping frontend dev..."
	@$(PM2) delete $(FRONT_DEV_NAME) >/dev/null 2>&1 || true
	@fuser -k 3000/tcp >/dev/null 2>&1 || true
	@$(PM2) save >/dev/null 2>&1 || true

prod:
	@echo "Stopping old prod process..."
	-$(PM2) delete $(FRONT_PROD_NAME) >/dev/null 2>&1 || true
	@echo "Installing frontend deps..."
	cd $(FRONTEND) && $(NPM) install
	@echo "Building frontend..."
	cd $(FRONTEND) && rm -rf .next && $(NPM) run build
	@echo "Starting frontend prod..."
	cd $(FRONTEND) && $(PM2) start npm --name $(FRONT_PROD_NAME) -- run start
	$(PM2) save
	@echo "Frontend PROD deployed"
	$(PM2) list

prod-restart:
	$(PM2) restart $(FRONT_PROD_NAME)
	$(PM2) save
	$(PM2) list

prod-stop:
	-$(PM2) delete $(FRONT_PROD_NAME) >/dev/null 2>&1 || true
	$(PM2) save

logs:
	$(PM2) logs $(FRONT_PROD_NAME) --lines 100

logs-dev:
	$(PM2) logs $(FRONT_DEV_NAME) --lines 100

status:
	$(PM2) list

backend-clear:
	cd $(BACKEND) && $(PHP) artisan optimize:clear

backend-migrate:
	cd $(BACKEND) && $(PHP) artisan migrate
	cd $(BACKEND) && $(PHP) artisan optimize:clear

backend-seed:
	cd $(BACKEND) && $(PHP) artisan db:seed --class="Modules\\Catalog\\Database\\Seeders\\CatalogDatabaseSeeder"