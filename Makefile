# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

# CLAIRE Development Makefile
# Regex pattern for matching [env-org] sections in samconfig.toml
SAMCONFIG_PATTERN = ^\[[a-zA-Z0-9]+-[a-zA-Z0-9]+\]$$

GET_AWS_REGION = aws configure get region
GET_ACCOUNT_NUMBER = aws sts get-caller-identity --query Account --output text

GET_RS_STACK_NAME = aws cloudformation describe-stacks --stack-name rawscribe-$(ENV)-$(ORG) --query "Stacks[0].StackName" --output text
GET_RS_STACK_STATUS = aws cloudformation describe-stacks --stack-name rawscribe-$(ENV)-$(ORG) --query "Stacks[0].StackStatus" --output text

GET_RS_API_GATEWAY = aws apigateway get-rest-apis --query "items[?name=='rawscribe-$(ENV)-$(ORG)-api'].name | [0]" --output text --region $(AWS_REGION) 2>/dev/null || echo "Not found"
GET_RS_API_ENDPOINT = aws cloudformation describe-stacks --stack-name $(STACK_NAME) --query "Stacks[0].Outputs[?OutputKey=='ApiEndpoint'].OutputValue" --output text

GET_RS_FUNCTION_NAME = aws cloudformation describe-stacks --stack-name $(STACK_NAME) --query 'Stacks[0].Outputs[?OutputKey==`RSLambdaFunctionName`].OutputValue' --output text || echo "Not found"

GET_RS_USER_POOL_NAME = aws cloudformation describe-stacks --stack-name $(STACK_NAME) --query 'Stacks[0].Outputs[?OutputKey==`CognitoUserPoolId`].OutputValue' --output text || echo "Not found"
GET_RS_USER_POOL_CLIENT_ID = aws cloudformation describe-stacks --stack-name $(STACK_NAME) --query 'Stacks[0].Outputs[?OutputKey==`CognitoClientId`].OutputValue' --output text || echo "Not found"

GET_FRONTEND_BUCKET = aws cloudformation describe-stacks --stack-name $(STACK_NAME) --query 'Stacks[0].Outputs[?OutputKey==`FrontendBucketName`].OutputValue' --output text || echo "Not found"
GET_RS_LAMBDA_BUCKET = aws cloudformation describe-stacks --stack-name $(STACK_NAME) --query 'Stacks[0].Outputs[?OutputKey==`LambdaBucketName`].OutputValue' --output text || echo "Not found"
GET_RS_FORMS_BUCKET = aws cloudformation describe-stacks --stack-name $(STACK_NAME) --query 'Stacks[0].Outputs[?OutputKey==`FormsBucketName`].OutputValue' --output text || echo "Not found"
GET_RS_ELN_BUCKET = aws cloudformation describe-stacks --stack-name $(STACK_NAME) --query 'Stacks[0].Outputs[?OutputKey==`ELNBucketName`].OutputValue' --output text || echo "Not found"
GET_RS_DRAFTS_BUCKET = aws cloudformation describe-stacks --stack-name $(STACK_NAME) --query 'Stacks[0].Outputs[?OutputKey==`DraftsBucketName`].OutputValue' --output text || echo "Not found"


GET_RS_S3_BUCKETS = aws s3api list-buckets --region $(AWS_REGION) --query "Buckets[?contains(Name, 'rawscribe-')].Name" --output text


GET_RS_TOKEN = aws cognito-idp admin-initiate-auth --region $(AWS_REGION) --user-pool-id $(USER_POOL) --client-id $(CLIENT_ID) --auth-parameters USERNAME=$(USER_NAME),PASSWORD=$(PASSWORD) --auth-flow ADMIN_USER_PASSWORD_AUTH --query 'AuthenticationResult.IdToken' --output text

# Build paths and configuration
LAMBDA_SRC := backend/rawscribe
LAMBDA_BUILD_DIR := backend/.build/lambda
LAMBDA_BUILD_NAME := function.zip
LAMBDA_DEST_DIR := .local/s3/lambda
LAMBDA_ARTIFACT := $(LAMBDA_BUILD_DIR)/$(LAMBDA_BUILD_NAME)
LAMBDA_DEST := $(LAMBDA_DEST_DIR)/$(LAMBDA_BUILD_NAME)

# Build paths and configuration (org-aware configs, shared runtime)
ENV ?= dev
# ORG has no default - must be explicitly provided to prevent security issues
# Exception: test commands default to 'testorg' for isolation
TEST_ORG ?= testorg

# Deployment parameters with defaults and documentation
# ENABLE_AUTH: Enable/disable Cognito authentication (default: true)
#   Can be toggled without recreating the Cognito pool
ENABLE_AUTH ?= true

# CREATE_COGNITO: Force creation of NEW Cognito pool (default: false)
#   WARNING: Setting to true will create a new pool even if one exists - this is destructive!
CREATE_COGNITO ?= false

# CREATE_BUCKETS: Controls whether CloudFormation manages S3 buckets (auto-detected, usually true)
#   true = CloudFormation creates/manages buckets (default for all deployments)
#   false = Buckets are NOT managed by CloudFormation (DANGEROUS - will delete managed buckets!)
#   Leave unset for automatic detection (always true unless you know what you're doing)

# COGNITO_POOL_ID / COGNITO_CLIENT_ID: Use specific external Cognito pool
# Only set these to attach an external pool to the stack
# Leave empty to let stack manage its own pool
COGNITO_POOL_ID ?=
COGNITO_CLIENT_ID ?=

WEBAPP_SRC := frontend
WEBAPP_BUILD_DIR := frontend/dist
WEBAPP_BUILD_NAME := webapp
WEBAPP_DEST_DIR := .local/s3/webapp
WEBAPP_DEST := $(WEBAPP_DEST_DIR)/$(WEBAPP_BUILD_NAME)

.PHONY: help help-target \
	setup-local config clean-config list-orgs list-envs schemas docs \
	start-backend start-frontend start-dev stop-all \
	test-frontend test-backend test-unit test-e2e test-all test-ci clean-test test-build-system test-aws-integration \
	test-e2e-reviewsubmit test-e2e-integration test-e2e-ui test-e2e-headed test-e2e-debug \
	build-frontend clean-frontend deploy-frontend serve-webapp \
	build-backend clean-backend clean-lambda-all deploy-backend serve-lambda \
	deploy-local mirror \
	rs-build rs-validate rs-package \
	rs-deploy rs-deploy-only rs-deploy-stage rs-deploy-prod rs-deploy-function rs-cycle-stack \
	sync-configs rs-sync rs-sync-watch rs-watch-log rs-ping-health rs-teardown nuke-bucket-data rs-nuke-buckets rs-nuke-user-pool rs-nuke-all \
	rs-update-config rs-update-config-files rs-update-code rs-cp-sop \
	rs-create-test-users rs-list-test-users rs-remove-test-users rs-secure-prod \
	rs-add-user rs-show-user rs-set-password rs-set-group rs-list-groups \
	rs-show-runtime-config \
	cognito-add-user cognito-set-password cognito-set-group cognito-rm-user cognito-show-user cognito-list-groups \
	test-jwt-local test-jwt-aws test-jwt-regression test-jwt-regression-local \
	show-account-number show-region show-rs-endpoint show-rs-function-name show-rs-user-pool \
	show-rs-api-gateway show-rs-s3-buckets show-rs-stackname check-rs check-rs-stack-status \
	clean-all

# Show detailed help for a specific target
# Usage: make help-target TARGET=rs-deploy
help-target:
	@if [ -z "$(TARGET)" ]; then \
		echo "❌ Usage: make help-target TARGET=<target_name>"; \
		echo "Example: make help-target TARGET=rs-deploy"; \
		exit 1; \
	fi
	@echo "📖 Detailed help for target: $(TARGET)"
	@echo "=========================================="
	@echo ""
	@# Extract ALL consecutive comments above the target in the Makefile
	@awk 'BEGIN { in_comments=0; comment="" } \
	     /^# / { in_comments=1; comment = comment $$0 "\n"; next } \
	     /^$(TARGET):/ { if (in_comments && comment) print comment; exit } \
	     /^[^#]/ { in_comments=0; comment="" }' Makefile > /tmp/make_help_$$$$ 2>/dev/null; \
	if [ -s /tmp/make_help_$$$$ ]; then \
		cat /tmp/make_help_$$$$; \
	else \
		echo "No inline documentation found for $(TARGET)."; \
		echo ""; \
	fi; \
	rm -f /tmp/make_help_$$$$
	@echo "📋 Implementation:"
	@echo "---"
	@grep -A 15 '^$(TARGET):' Makefile | head -20 || echo "Target not found in Makefile"
	@echo ""
	@echo "💡 Full help menu: make help"
	@echo ""

help:
	@echo "CLAIRE Development Commands"
	@echo "For detailed help on any target: make help-target TARGET=<target_name>"
	@echo "=========================================="
	@echo ""
	@echo "Setup & Configuration:"
	@echo "  setup-local       Set up local directories and configs (ENV=[dev]|test ORG=<org>)"
	@echo "  config            Merge configs from infra/ (ENV=dev|test|stage|prod ORG=<org>)"
	@echo "  clean-config      Remove all generated config files"
	@echo "  list-orgs         List all configured organizations from samconfig.toml"
	@echo "  list-envs         List all configured environments from samconfig.toml"
	@echo "  schemas           Generate TypeScript schemas"
	@echo "  docs              Build documentation"
	@echo ""
	@echo "Development:"
	@echo "  start-backend     Start FastAPI server with hot reload (ENV=[dev]|test|stage|prod ORG=<org>)"
	@echo "  start-frontend    Start React dev server with hot reload (ENV=[dev]|test|stage|prod ORG=<org>)"
	@echo "  start-dev         Start both servers with hot reload (ENV=dev ORG=<org>)"
	@echo "  stop-all          Stop all local servers (backend + frontend)"
	@echo ""
	@echo "Testing:"
	@echo "  test-frontend     Frontend unit tests (defaults to ORG=testorg)"
	@echo "  test-backend      Backend unit tests (defaults to ORG=testorg)"
	@echo "  test-unit         All unit tests (defaults to ORG=testorg)"
	@echo "  test-e2e          End-to-end tests (defaults to ORG=testorg)"
	@echo "  test-e2e-*        Specific E2E test variants (reviewsubmit, integration, ui, headed, debug)"
	@echo "  test-all          All tests (defaults to ORG=testorg)"
	@echo "  test-ci           CI test suite with coverage (defaults to ORG=testorg)"
	@echo "  test-build-system Build system regression tests (clean, config, build targets)"
	@echo "  test-aws-integration  AWS integration tests (Cognito, S3, file uploads)"
	@echo "                    Requires: ENABLE_AWS_TESTS=true (disabled by default)"
	@echo "                    Options: SKIP_TEARDOWN=true, PATTERN=<pattern>, ORG=<org>, ENV=<env>"
	@echo "  clean-test        Clean test artifacts"
	@echo "  Note: Override test org with: make test-all ORG=myorg"
	@echo ""
	@echo "Build & Deploy (Local):"
	@echo "  build-frontend    Clean build of frontend (ENV=[dev]|test|stage|prod ORG=<org>)"
	@echo "  build-backend     Clean build of lambda (ENV=[dev]|test|stage|prod ORG=<org>)"
	@echo "  deploy-local      Deploy both frontend and backend locally"
	@echo "  serve-webapp      Serve webapp locally (incremental, emulates CloudFront+S3)"
	@echo "  serve-lambda      Serve lambda locally (incremental, shows logs)"
	@echo "  serve-lambda-debug  Force rebuild & serve with debug logging"
	@echo "  clean-backend     Clean backend build artifacts (forces next rebuild)"
	@echo "  clean-frontend    Clean frontend build artifacts (forces next rebuild)"
	@echo "  clean-all         Clean all build artifacts (frontend, backend, config, test, docs, sam)"
	@echo ""
	@echo "RAWSCRIBE Deployment (AWS SAM):"
	@echo "  rs-build          Build Lambda + layer with SAM (auto-caches layer)"
	@echo "  rs-deploy         Build and deploy (ENV=stage|prod ORG=<org>)"
	@echo "                    Reuses existing Cognito pool automatically"
	@echo "                    Optional: CREATE_BUCKETS=true|false (default: false)"
	@echo "                    Optional: ENABLE_AUTH=true|false (default: true)"
	@echo "                    Optional: CREATE_COGNITO=true (forces new pool, RARE!)"
	@echo "  rs-deploy-only    Deploy without building (ENV=stage|prod ORG=<org>)"
	@echo "                    Auto-syncs configs after deployment (add SKIP_SYNC=true to skip)"
	@echo "  rs-deploy-function  Fast deploy Lambda code only (ENV=stage|prod ORG=<org>)"
	@echo "  rs-deploy-stage   Deploy to staging (ORG=<org> required)"
	@echo "  rs-deploy-prod    Deploy to production (ORG=<org> required)"
	@echo "  sync-configs      Sync configs from CloudFormation outputs (ENV=stage|prod ORG=<org>)"
	@echo "  rs-sync           Sync Lambda code only (ENV=stage|prod ORG=<org>)"
	@echo "  rs-sync-watch     Sync in watch mode (ENV=stage|prod ORG=<org>)"
	@echo "  rs-watch-log      View Lambda logs (ENV=stage|prod ORG=<org>)"
	@echo "  rs-teardown       Teardown (deletes stack, leaves users, buckets, data intact)"
	@echo "                    ENV=stage|prod ORG=<org> (prompts for confirmation)"
	@echo "  rs-nuke-all       ☢️  NUCLEAR: Clean builds + teardown + delete buckets + delete users"
	@echo "                    ENV=stage ORG=<org> (BLOCKS prod, requires 'NUKE <org>' confirmation)"
	@echo "                    Complete destruction for absolute clean slate"
	@echo "  rs-validate       Validate SAM template"
	@echo ""
	@echo "User Management (Cloud-Agnostic):"
	@echo "  rs-add-user          Create/update user (auto-bootstraps first admin)"
	@echo "                       ENV=<env> ORG=<org> USER_NAME=user@email.com PASSWORD='Pass!' GROUP=RESEARCHERS"
	@echo "                       Bootstrap: Add BOOTSTRAP=true to create first admin without auth"
	@echo "  rs-show-user         Show user details and group memberships"
	@echo "                       ENV=<env> ORG=<org> USER_NAME=user@email.com"
	@echo "                       Optional: ADMIN_USER=admin@org.com ADMIN_PASSWORD='Pass!' (defaults to testadmin)"
	@echo "  rs-set-password      Set user password"
	@echo "                       ENV=<env> ORG=<org> USER_NAME=user@email.com PASSWORD='NewPass!'"
	@echo "                       ADMIN_USER=admin@org.com ADMIN_PASSWORD='AdminPass!'"
	@echo "  rs-set-group         Set user's group (removes from all other groups)"
	@echo "                       ENV=<env> ORG=<org> USER_NAME=user@email.com GROUP=LAB_MANAGERS"
	@echo "                       Optional: ADMIN_USER=admin@org.com ADMIN_PASSWORD='Pass!' (defaults to testadmin)"
	@echo "  rs-list-groups       List available groups with permissions"
	@echo "                       ENV=<env> ORG=<org>"
	@echo "  rs-remove-user       Remove a specific user (with confirmation)"
	@echo "                       ENV=<env> ORG=<org> USER_NAME=user@example.com"
	@echo ""
	@echo "Test User Management:"
	@echo "  rs-create-test-users Create test users (auto-bootstraps testadmin if needed)"
	@echo "                       ENV=<env> ORG=<org>"
	@echo "                       Optional: ADMIN_USER=user ADMIN_PASSWORD='pass' (use existing admin)"
	@echo "  rs-list-test-users   List test users with credentials"
	@echo "                       ENV=stage|prod ORG=<org>"
	@echo "  rs-remove-test-users Remove all test users"
	@echo "                       ENV=stage|prod ORG=<org>"
	@echo "  rs-cp-sop            Upload SOP file to forms bucket"
	@echo "                       ENV=stage|prod ORG=<org> FILE=path/to/sop.yaml"
	@echo "  rs-secure-prod       Secure production: remove test users, reset admin password"
	@echo "                       ENV=prod ORG=<org> (prompts for confirmation)"
	@echo ""
	@echo "JWT Testing:"
	@echo "  get-rs-token      Get JWT token (ENV=stage|prod ORG=<org> USER_NAME=user PASSWORD=pass)"
	@echo "  test-jwt-local    Test JWT locally (ENV=stage|prod ORG=<org>)"
	@echo "  test-jwt-aws      Test JWT on deployed Lambda (ENV=stage|prod ORG=<org>)"
	@echo "  test-jwt-regression  Run full JWT regression tests"
	@echo ""
	@echo "Utilities:"
	@echo "  show-account-number      Show current AWS account number"
	@echo "  show-region              Show current AWS region"
	@echo "  show-rs-endpoint         Show API endpoint (ENV=stage|prod ORG=<org>)"
	@echo "  show-rs-function-name    Show Lambda function name (ENV=stage|prod ORG=<org>)"
	@echo "  show-rs-user-pool        Show User Pool (ENV=stage|prod ORG=<org>)"
	@echo "  show-rs-client-id        Show Client ID (ENV=stage|prod ORG=<org>)"
	@echo "  show-rs-api-gateway      Show API Gateway (ENV=stage|prod ORG=<org>)"
	@echo "  show-rs-s3-buckets       Show S3 buckets (ENV=stage|prod ORG=<org>)"
	@echo "  show-rs-stackname        Show Stack Name (ENV=stage|prod ORG=<org>)"
	@echo "  check-rs-stack-status    Check Stack Status (ENV=stage|prod ORG=<org>)"
	@echo "  check-rs                 Check rawscribe deployment [(ENV=stage|prod ORG=<org>)]"
	@echo "  rs-ping-health           Ping health endpoint to initialize logs [(ENV=stage|prod ORG=<org>)]"
	@echo "  rs-show-runtime-config   Show actual runtime auth config from Lambda"
	@echo "                           ENV=stage|prod ORG=<org> (shows env vs config source)"
	@echo ""
	@echo "💡 Tip: For detailed info on any target, run: make help-target TARGET=<name>"
	@echo "   Example: make help-target TARGET=rs-deploy"
	@echo ""

clean-all: clean-config clean-test clean-frontend clean-backend clean-lambda-all
	@cd docs && $(MAKE) clean

#############################################
# Setup & Configuration
#############################################

setup-local:
	@echo "Setting up local environment for ENV=$(ENV) ORG=$(ORG)..."
	@if [ -z "$(ORG)" ]; then \
		echo "❌ ORG parameter required. Usage: make setup-local ENV=dev ORG=uga"; \
		exit 1; \
	fi
	@mkdir -p .local/s3/forms .local/s3/eln .local/s3/eln-drafts .local/s3/public
	@mkdir -p $(WEBAPP_DEST_DIR) $(LAMBDA_DEST_DIR)
	@echo "Deploying configs for $(ENV)/$(ORG)"
	@$(MAKE) config ENV=$(ENV) ORG=$(ORG)

# xxx there s a loop where it installs every config for every org in every env
# we should only install the config for the current env and org?
config:
	@echo "🔧 Configuring SYNDI for ENV=$(ENV) ORG=$(ORG)..."
	@if [ -z "$(ENV)" ]; then \
		echo "❌ ENV parameter required. Usage: make config ENV=dev ORG=uga"; \
		exit 1; \
	fi
	$(eval AWS_REGION := $(shell $(GET_AWS_REGION)))
	$(eval ACCOUNT_NUMBER := $(shell $(GET_ACCOUNT_NUMBER)))
	
	@$(MAKE) clean-config
	@echo "📋 Merging configuration files..."
	
	# Merge webapp config
	@echo "🌐 Processing webapp configuration..."
	@python infra/scripts/config-merger.py \
		"infra/.config/webapp/$(ENV).json" \
		"infra/.config/webapp/$(ENV)-$(ORG).json" \
		"frontend/public/config.json"
	
	# Merge lambda config  
	@echo "🚀 Processing lambda configuration..."
	@python infra/scripts/config-merger.py \
		"infra/.config/lambda/$(ENV).json" \
		"infra/.config/lambda/$(ENV)-$(ORG).json" \
		"backend/rawscribe/.config/config.json"
	
	# Create environment variables for cloud deployments (if needed)
	@if [ "$(ENV)" != "dev" ] && [ "$(ENV)" != "test" ]; then \
		echo "☁️  Creating environment variables for cloud deployment..."; \
		mkdir -p backend/.build/lambda; \
		LAMBDA_BUCKET="rawscribe-lambda-$(ENV)-$(ORG)-$(ACCOUNT_NUMBER)"; \
		FORMS_BUCKET="rawscribe-forms-$(ENV)-$(ORG)-$(ACCOUNT_NUMBER)"; \
		ELN_BUCKET="rawscribe-eln-$(ENV)-$(ORG)-$(ACCOUNT_NUMBER)"; \
		DRAFTS_BUCKET="rawscribe-eln-drafts-$(ENV)-$(ORG)-$(ACCOUNT_NUMBER)"; \
		jq -n \
			--arg env "$(ENV)" \
			--arg org "$(ORG)" \
			--arg lambda_bucket "$$LAMBDA_BUCKET" \
			--arg forms_bucket "$$FORMS_BUCKET" \
			--arg eln_bucket "$$ELN_BUCKET" \
			--arg drafts_bucket "$$DRAFTS_BUCKET" \
			--arg region "$(AWS_REGION)" \
			'{Variables: {ENV: $$env, ORG: $$org, CONFIG_S3_BUCKET: $$lambda_bucket, CONFIG_S3_KEY: "config.json", COGNITO_REGION: $$region, FORMS_BUCKET: $$forms_bucket, ELN_BUCKET: $$eln_bucket, DRAFTS_BUCKET: $$drafts_bucket}}' \
			> "backend/.build/lambda/$(ENV)-$(ORG).env.json"; \
		echo "✅ Environment variables created for $(ENV)/$(ORG)"; \
	fi
	
	@echo "🎉 Configuration complete for ENV=$(ENV) ORG=$(ORG)"

clean-config:
	@echo "Cleaning config files..."
	@rm -rf backend/rawscribe/.config
	@rm -rf frontend/public/config.json

list-orgs:
	@echo "Organizations configured in samconfig.toml:"
	@echo "============================================"
	@ORGS=$$(grep -E '$(SAMCONFIG_PATTERN)' samconfig.toml | sed 's/\[//g' | sed 's/\]//g' | sed 's/^[^-]*-//' | sort -u); \
	if [ -n "$$ORGS" ]; then \
		for org in $$ORGS; do \
			echo "  • $$org"; \
		done; \
		echo ""; \
		echo "Total: $$(echo $$ORGS | wc -w) organizations"; \
	else \
		echo "  No organizations found"; \
	fi

list-envs:
	@echo "Environments configured in samconfig.toml:"
	@echo "=========================================="
	@ENVS=$$(grep -E '$(SAMCONFIG_PATTERN)' samconfig.toml | sed 's/\[//g' | sed 's/\]//g' | sed 's/-[^-]*$$//' | sort -u); \
	if [ -n "$$ENVS" ]; then \
		for env in $$ENVS; do \
			echo "  • $$env"; \
		done; \
		echo ""; \
		echo "Total: $$(echo $$ENVS | wc -w) environments"; \
	else \
		echo "  No environments found"; \
	fi

schemas:
	@echo "Generating TypeScript schemas..."
	npx --yes tsx frontend/tools/generateSOPTemplateSchema.ts

schemas-validate-sop:
	@$(MAKE) schemas
	@echo "Validating SOP $(SOP_ID) against schema template..."
	npx --yes tsx frontend/tools/validateSOPAgainstTemplate.ts frontend/src/shared/schemas/SOPTemplateSchema.yaml .local/s3/forms/sops/sop$(SOP_ID).yaml

docs:
	@echo "Building documentation..."
	cd docs && make clean && make html

show-account-number:
	$(eval ACCOUNT_NUMBER := $(shell $(GET_ACCOUNT_NUMBER)))
	@echo "AWS Account Number: $(ACCOUNT_NUMBER)"

show-region:
	$(eval AWS_REGION := $(shell $(GET_AWS_REGION)))
	@echo "AWS Region: $(AWS_REGION)"

show-rs-endpoint:
	$(eval AWS_REGION := $(shell $(GET_AWS_REGION)))
	$(eval STACK_NAME := $(shell $(GET_RS_STACK_NAME)))
	$(eval API_ENDPOINT := $(shell $(GET_RS_API_ENDPOINT)))
	@if [ -z "$(ORG)" ]; then \
		echo "Error: ORG parameter required. Usage: make show-endpoint ENV=$(ENV) ORG=$(ORG)"; \
		exit 1; \
	fi; \
	if [ -z "$(ENV)" ]; then \
		echo "Error: ENV parameter required. Usage: make show-endpoint ENV=$(ENV) ORG=$(ORG)"; \
		exit 1; \
	fi; 
	@echo "API Endpoint: $(API_ENDPOINT)"

show-rs-function-name:
	$(eval AWS_REGION := $(shell $(GET_AWS_REGION)))
	$(eval STACK_NAME := $(shell $(GET_RS_STACK_NAME)))
	$(eval FUNCTION_NAME := $(shell $(GET_RS_FUNCTION_NAME)))
	@if [ -z "$(ORG)" ]; then \
		echo "Error: ORG parameter required. Usage: make show-function-name ENV=$(ENV) ORG=$(ORG)"; \
		exit 1; \
	fi; \
	if [ -z "$(ENV)" ]; then \
		echo "Error: ENV parameter required. Usage: make show-function-name ENV=$(ENV) ORG=$(ORG)"; \
		exit 1; \
	fi; 
	@echo "Lambda Function Name: $(FUNCTION_NAME)"


show-rs-user-pool:
	@if [ -z "$(ORG)" ]; then \
		echo "Error: ORG parameter required. Usage: make show-user-pool ENV=$(ENV) ORG=$(ORG)"; \
		exit 1; \
	fi; \
	if [ -z "$(ENV)" ]; then \
		echo "Error: ENV parameter required. Usage: make show-user-pool ENV=$(ENV) ORG=$(ORG)"; \
		exit 1; \
	fi; 
	$(eval AWS_REGION := $(shell $(GET_AWS_REGION)))
	$(eval STACK_NAME := $(shell $(GET_RS_STACK_NAME)))
	$(eval USER_POOL := $(shell $(GET_RS_USER_POOL_NAME)))
	@echo "User Pool: $(USER_POOL)"


show-rs-client-id:
	@if [ -z "$(ORG)" ]; then \
		echo "Error: ORG parameter required. Usage: make show-client-id ENV=$(ENV) ORG=$(ORG)"; \
		exit 1; \
	fi; \
	if [ -z "$(ENV)" ]; then \
		echo "Error: ENV parameter required. Usage: make show-client-id ENV=$(ENV) ORG=$(ORG)"; \
		exit 1; \
	fi; 
	$(eval AWS_REGION := $(shell $(GET_AWS_REGION)))
	$(eval STACK_NAME := $(shell $(GET_RS_STACK_NAME)))
	$(eval USER_POOL := $(shell $(GET_RS_USER_POOL_NAME)))
	$(eval CLIENT_ID := $(shell $(GET_RS_USER_POOL_CLIENT_ID)))
	@echo "Client ID: $(CLIENT_ID)"

show-rs-api-gateway:
	@if [ -z "$(ORG)" ]; then \
		echo "Error: ORG parameter required. Usage: make show-rs-api-gateway ENV=$(ENV) ORG=$(ORG)"; \
		exit 1; \
	fi; \
	if [ -z "$(ENV)" ]; then \
		echo "Error: ENV parameter required. Usage: make show-rs-api-gateway ENV=$(ENV) ORG=$(ORG)"; \
		exit 1; \
	fi; 
	$(eval AWS_REGION := $(shell $(GET_AWS_REGION)))
	$(eval STACK_NAME := $(shell $(GET_RS_STACK_NAME)))
	$(eval API_GATEWAY_NAME := $(shell $(GET_RS_API_GATEWAY)))
	@echo "Rawscribe API Gateway ($(ENV)/$(ORG)): $(API_GATEWAY_NAME)"


show-rs-s3-buckets:
	$(eval AWS_REGION := $(shell $(GET_AWS_REGION)))
	$(eval ACCOUNT_NUMBER := $(shell $(GET_ACCOUNT_NUMBER)))
	$(eval GET_RS_S3_BUCKETS := $(shell $(GET_RS_S3_BUCKETS)))

	@echo "Rawscribe S3 Buckets (Account: $(ACCOUNT_NUMBER), $(STACK_NAME)):"
	@if [ -n "$(ENV)" ] && [ -n "$(ORG)" ]; then \
		echo "Filtered for: $(ENV)/$(ORG)"; \
	elif [ -n "$(ENV)" ]; then \
		echo "Filtered for environment: $(ENV)"; \
	elif [ -n "$(ORG)" ]; then \
		echo "Filtered for organization: $(ORG)"; \
	else \
		echo "Showing all rawscribe buckets"; \
	fi
	@echo "================================================"
	@echo "📦 Shared Deployment Artifacts:"
	@echo "  • rawscribe-sam-deployments-$(ACCOUNT_NUMBER) (shared across all env/org)"
	@echo ""
	@if [ -n "$(ENV)" ] && [ -n "$(ORG)" ]; then \
		echo "🏢 Environment/Organization Specific Buckets ($(ENV)/$(ORG)):"; \
	elif [ -n "$(ENV)" ]; then \
		echo "🏢 Environment Specific Buckets ($(ENV)):"; \
	elif [ -n "$(ORG)" ]; then \
		echo "🏢 Organization Specific Buckets ($(ORG)):"; \
	else \
		echo "🏢 All Environment/Organization Buckets:"; \
	fi
	@if [ -n "$(S3_BUCKETS)" ]; then \
		echo "$(S3_BUCKETS)" | tr '\t' '\n' | while read bucket; do \
			if [ -n "$$bucket" ] && [ "$$bucket" != "rawscribe-sam-deployments-$(ACCOUNT_NUMBER)" ]; then \
				if [ -n "$(ENV)" ] && [ -n "$(ORG)" ]; then \
					if echo "$$bucket" | grep -q "rawscribe-.*-$(ENV)-$(ORG)-$(ACCOUNT_NUMBER)"; then \
						echo "  • $$bucket"; \
					fi; \
				elif [ -n "$(ENV)" ]; then \
					if echo "$$bucket" | grep -q "rawscribe-.*-$(ENV)-.*-$(ACCOUNT_NUMBER)"; then \
						echo "  • $$bucket"; \
					fi; \
				elif [ -n "$(ORG)" ]; then \
					if echo "$$bucket" | grep -q "rawscribe-.*-.*-$(ORG)-$(ACCOUNT_NUMBER)"; then \
						echo "  • $$bucket"; \
					fi; \
				else \
					echo "  • $$bucket"; \
				fi; \
			fi; \
		done; \
	else \
		echo "  No rawscribe buckets found"; \
	fi

show-rs-stackname:
	@if [ -z "$(ORG)" ]; then \
		echo "Error: ORG parameter required. Usage: make show-stack-name ENV=$(ENV) ORG=$(ORG)"; \
		exit 1; \
	fi; \
	if [ -z "$(ENV)" ]; then \
		echo "Error: ENV parameter required. Usage: make show-stack-name ENV=$(ENV) ORG=$(ORG)"; \
		exit 1; \
	fi; \
	$(eval AWS_REGION := $(shell $(GET_AWS_REGION)))
	$(eval STACK_NAME := $(shell $(GET_RS_STACK_NAME)))
	@echo "Stack Name: $(STACK_NAME)"

check-rs-stack-status:
	@if [ -z "$(ORG)" ]; then \
		echo "Error: ORG parameter required. Usage: make check-stack-status ENV=$(ENV) ORG=$(ORG)"; \
		exit 1; \
	fi; \
	if [ -z "$(ENV)" ]; then \
		echo "Error: ENV parameter required. Usage: make check-stack-status ENV=$(ENV) ORG=$(ORG)"; \
		exit 1; \
	fi; \
	$(eval AWS_REGION := $(shell $(GET_AWS_REGION)))
	$(eval STACK_STATUS := $(shell $(GET_RS_STACK_STATUS)))
	@echo "Stack Status: $(STACK_STATUS)"

# $$(aws cognito-idp list-user-pools --max-results 60 --query "UserPools[?contains(Name,'rawscribe-$$env-$$org-userpool')].Name | [0]" --output text --region $(AWS_REGION) 2>/dev/null || echo "Not found"); \
check-stack:
	@if [ -z "$(ORG)" ]; then \
		echo "Error: ORG parameter required. Usage: make show-stack-name ENV=$(ENV) ORG=$(ORG)"; \
		exit 1; \
	fi; \
	if [ -z "$(ENV)" ]; then \
		echo "Error: ENV parameter required. Usage: make show-stack-name ENV=$(ENV) ORG=$(ORG)"; \
		exit 1; \
	fi; \
	$(eval AWS_REGION := $(shell $(GET_AWS_REGION)))
	$(eval ACCOUNT_NUMBER := $(shell $(GET_ACCOUNT_NUMBER)))
	$(eval STACK_NAME := $(shell $(GET_RS_STACK_NAME)))
	@echo "🔍 Checking stack deployment for $(STACK_NAME)"
	@echo "=================================================================="
	sam list stack-outputs --stack-name $(STACK_NAME)

check-rs:
	@echo "🔍 Checking deployment status for all environments and organizations..."
	@echo "=================================================================="
	$(eval AWS_REGION := $(shell $(GET_AWS_REGION)))
	$(eval ACCOUNT_NUMBER := $(shell $(GET_ACCOUNT_NUMBER)))
	$(eval STACK_NAME := $(shell $(GET_RS_STACK_NAME)))
	$(eval FUNCTION_NAME := $(shell $(GET_RS_FUNCTION_NAME)))
	$(eval API_GATEWAY_NAME := $(shell $(GET_RS_API_GATEWAY)))
	$(eval API_ENDPOINT := $(shell $(GET_RS_API_ENDPOINT)))
	$(eval USER_POOL := $(shell $(GET_RS_USER_POOL_NAME)))
	$(eval CLIENT_ID := $(shell $(GET_RS_USER_POOL_CLIENT_ID)))

	$(eval LAMBDA_BUCKET := $(shell $(GET_RS_LAMBDA_BUCKET)))
	$(eval FORMS_BUCKET := $(shell $(GET_RS_FORMS_BUCKET)))
	$(eval ELN_BUCKET := $(shell $(GET_RS_ELN_BUCKET)))
	$(eval DRAFTS_BUCKET := $(shell $(GET_RS_DRAFTS_BUCKET)))
	@# Get environments and organizations - use passed params or extract from samconfig.toml
	@if [ -n "$(ENV)" ]; then \
		ENVS="$(ENV)"; \
	else \
		ENVS=$$(grep -E '$(SAMCONFIG_PATTERN)' samconfig.toml | sed 's/\[//g' | sed 's/\]//g' | sed 's/-[^-]*$$//' | sort -u); \
	fi; \
	if [ -n "$(ORG)" ]; then \
		ORGS="$(ORG)"; \
	else \
		ORGS=$$(grep -E '$(SAMCONFIG_PATTERN)' samconfig.toml | sed 's/\[//g' | sed 's/\]//g' | sed 's/^[^-]*-//' | sort -u); \
	fi; \
	if [ -n "$$ENVS" ] && [ -n "$$ORGS" ]; then \
		for env in $$ENVS; do \
			for org in $$ORGS; do \
				echo ""; \
				echo "=== $$org Resources ($$env) ==="; \
				echo "Lambda:      $(FUNCTION_NAME)"; \
				echo "API Gateway: $(API_GATEWAY_NAME)"; \
				echo "API Endpoint: $(API_ENDPOINT)"; \
				echo "Stack Name:  $(STACK_NAME)"; \
				echo "User Pool:   $(USER_POOL)"; \
				echo "Client ID:   $(CLIENT_ID)"; \
				echo "S3 Buckets:"; \
				echo "     lambda:     $(LAMBDA_BUCKET)"; \
				echo "     forms:      $(FORMS_BUCKET)"; \
				echo "     ELN:        $(ELN_BUCKET)"; \
				echo "     ELN drafts: $(DRAFTS_BUCKET)"; \
			done; \
		done; \
		echo ""; \
		echo "✅ Deployment check complete"; \
	else \
		echo "❌ No environments or organizations found"; \
	fi


#############################################
# Development
#############################################

start-backend:
	@echo "Starting backend..."
	@if [ -z "$(ORG)" ]; then \
		echo "❌ ORG parameter required. Usage: make start-backend ENV=dev ORG=<org>"; \
		exit 1; \
	fi
	@echo "ENV=$(ENV) ORG=$(ORG)"
	@echo "Port configured in backend config (typically 8000)"
	@echo "API docs at /docs endpoint"
	@echo "To exit, press Ctrl+C"
	@$(MAKE) config ENV=$(ENV) ORG=$(ORG)
	@# Create symlink so backend can use .local/s3 path consistently
	@if [ ! -L "backend/.local" ]; then \
		echo "🔗 Creating symlink to local storage..."; \
		cd backend && ln -sf ../.local .local; \
	fi
	cd backend && ENV=$(ENV) uvicorn rawscribe.main:app --reload --host 0.0.0.0

start-frontend:
	@echo "Starting frontend..."
	@if [ -z "$(ORG)" ]; then \
		echo "❌ ORG parameter required. Usage: make start-frontend ENV=dev ORG=<org>"; \
		exit 1; \
	fi
	@echo "ENV=$(ENV) ORG=$(ORG)"
	@echo "To exit, press Ctrl+C"
	@$(MAKE) config ENV=$(ENV) ORG=$(ORG)
	cd frontend && npm run dev

start-dev:
	@if [ -z "$(ORG)" ]; then \
		echo "❌ ORG parameter required. Usage: make start-dev ENV=dev ORG=<org>"; \
		exit 1; \
	fi
	@$(MAKE) start-backend ENV=dev ORG=$(ORG) &
	@$(MAKE) start-frontend ENV=dev ORG=$(ORG)

stop-all:
	@./scripts/stop-servers.sh

#############################################
# Testing
#############################################

test-frontend:
	@echo "Running frontend tests (ORG=$(if $(ORG),$(ORG),$(TEST_ORG)))..."
	@if [ ! -d "infra/.config" ]; then \
		ln -s ../infra/examples/config infra/.config; \
	fi
	@$(MAKE) setup-local ENV=test ORG=$(if $(ORG),$(ORG),$(TEST_ORG))
	@if [ -L "infra/.config" ]; then \
		rm infra/.config; \
	fi
	@$(MAKE) schemas
	cd frontend && npm install && npx --yes vitest run

test-backend:
	@echo "Running backend tests (ORG=$(if $(ORG),$(ORG),$(TEST_ORG)))..."
	@if [ ! -d "infra/.config" ]; then \
		ln -s ../infra/examples/config infra/.config; \
	fi
	@$(MAKE) setup-local ENV=test ORG=$(if $(ORG),$(ORG),$(TEST_ORG))
	@if [ -L "infra/.config" ]; then \
		rm infra/.config; \
	fi
	cd backend && TESTING=true PYTHONPATH=. python -m pytest tests/ -v --tb=short || echo "No tests found"

test-unit: test-backend test-frontend
	@echo "Unit tests completed"

test-e2e:
	@echo "Running all e2e tests (ORG=$(if $(ORG),$(ORG),$(TEST_ORG)))..."
	@$(MAKE) config ENV=test ORG=$(if $(ORG),$(ORG),$(TEST_ORG))
	@if [ -d "frontend/tests/e2e" ]; then \
		cd frontend && npm install && NODE_ENV=test npx --yes playwright test --reporter=list ; \
	else \
		echo "No e2e tests found in frontend/tests/e2e/"; \
	fi

test-e2e-reviewsubmit:
	@echo "Running ReviewSubmitPanel component tests (ORG=$(if $(ORG),$(ORG),$(TEST_ORG)))..."
	@$(MAKE) config ENV=test ORG=$(if $(ORG),$(ORG),$(TEST_ORG))
	@if [ -d "frontend/tests/e2e/reviewsubmit" ]; then \
		cd frontend && npm install && NODE_ENV=test npx --yes playwright test --reporter=list tests/e2e/reviewsubmit; \
	else \
		echo "ReviewSubmitPanel tests not found"; \
	fi

test-e2e-integration:
	@echo "Running integration tests with real backend (ORG=$(if $(ORG),$(ORG),$(TEST_ORG)))..."
	@$(MAKE) config ENV=test ORG=$(if $(ORG),$(ORG),$(TEST_ORG))
	@echo "Starting backend for integration tests..."
	@$(MAKE) start-backend ENV=test ORG=$(if $(ORG),$(ORG),$(TEST_ORG)) &
	@sleep 3
	@if [ -d "frontend/tests/integration" ]; then \
		cd frontend && npm install && NODE_ENV=test npx --yes playwright test --reporter=list tests/integration; \
	else \
		echo "Integration tests not found - running e2e with backend"; \
		cd frontend && npm install && NODE_ENV=test npx --yes playwright test --reporter=list; \
	fi
	@pkill -f "uvicorn.*rawscribe.main" || true

test-e2e-ui:
	@echo "Running e2e tests with UI runner (ORG=$(if $(ORG),$(ORG),$(TEST_ORG)))..."
	@$(MAKE) config ENV=test ORG=$(if $(ORG),$(ORG),$(TEST_ORG))
	@cd frontend && npm install && NODE_ENV=test npx --yes playwright test --ui --reporter=list

test-e2e-headed:
	@echo "Running e2e tests with visible browser (ORG=$(if $(ORG),$(ORG),$(TEST_ORG)))..."
	@$(MAKE) config ENV=test ORG=$(if $(ORG),$(ORG),$(TEST_ORG))
	@cd frontend && npm install && NODE_ENV=test npx --yes playwright test --headed

test-e2e-debug:
	@echo "Running e2e tests in debug mode (ORG=$(if $(ORG),$(ORG),$(TEST_ORG)))..."
	@$(MAKE) config ENV=test ORG=$(if $(ORG),$(ORG),$(TEST_ORG))
	@cd frontend && npm install && NODE_ENV=test npx --yes playwright test --debug

test-all: test-unit test-e2e
	@if [ $$? -eq 0 ]; then \
		echo "All tests completed successfully"; \
		exit 0; \
	else \
		echo "Tests failed"; \
		exit 1; \
	fi

# Test build system (clean, build, config targets)
# Usage: make test-build-system [PATTERN=backend]
test-build-system:
	@echo "Running build system regression tests..."
	@./infra/scripts/test-build-system.sh $(PATTERN)

# AWS integration tests (Cognito, S3, file uploads)
# Tests Cognito pool creation/teardown, user management, and file upload integrity
# Requires: ENABLE_AWS_TESTS=true to run (prevents accidental AWS charges)
# Optional: SKIP_TEARDOWN=true (keep resources for debugging)
#           PATTERN=<pattern> (e.g., "Cognito" or "File")
#           ORG=<org> (default: testaws)
#           ENV=<env> (default: stage)
# Examples:
#   make test-aws-integration ENABLE_AWS_TESTS=true
#   make test-aws-integration ENABLE_AWS_TESTS=true PATTERN="Cognito"
#   make test-aws-integration ENABLE_AWS_TESTS=true SKIP_TEARDOWN=true
test-aws-integration:
	@./infra/scripts/test-aws-integration.sh \
		$(if $(ENABLE_AWS_TESTS),--enable-aws,) \
		$(if $(SKIP_TEARDOWN),--skip-teardown,) \
		$(if $(PATTERN),--test-pattern $(PATTERN),) \
		$(if $(ORG),--org $(ORG),) \
		$(if $(ENV),--env $(ENV),)

test-ci:
	@echo "Running CI tests with coverage (ORG=$(if $(ORG),$(ORG),$(TEST_ORG)))..."
	@$(MAKE) setup-local ENV=test ORG=$(if $(ORG),$(ORG),$(TEST_ORG))
	cd backend && TESTING=true conda run -n claire python -m pytest tests/ --cov=rawscribe --cov-report=xml || echo "No backend tests"
	cd frontend && npm install && npx --yes vitest run --coverage

clean-test:
	@echo "🧹 Cleaning frontend test artifacts..."
	rm -rf frontend/{coverage,dist,build}
	rm -rf frontend/test-results
	rm -rf frontend/playwright-report
	rm -rf .env-backup
	@echo "🧹 Cleaning backend test artifacts..."
	rm -rf backend/{htmlcov,coverage.xml,.coverage}
	find backend/tests -name "*.pyc" -delete
	find backend/tests -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true

#############################################
# Build & Deploy (Local)
#############################################

clean-frontend:
	@echo "🧹 Cleaning frontend build artifacts..."
	@rm -rf frontend/dist
	@rm -f frontend/public/config.json
	@rm -rf .local/s3/webapp

# Collect all frontend source files for dependency tracking
FRONTEND_SOURCES := $(shell find frontend/src -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.jsx' -o -name '*.css' \) 2>/dev/null)
# Note: Config files with $(ENV)/$(ORG) in their paths can't be direct dependencies due to Make limitations.
# However, we CAN depend on the merged output config file, which will be regenerated by 'make config'
FRONTEND_DEPS := $(FRONTEND_SOURCES) frontend/package.json frontend/vite.config.ts

# Webapp build directory depends on source files AND the merged config
# Builds when: source files change, package.json changes, vite config changes, OR config.json changes
# The config.json dependency ensures builds trigger when configs are updated
$(WEBAPP_BUILD_DIR)/index.html: $(FRONTEND_DEPS) frontend/public/config.json
	@echo "📦 Frontend changes detected - rebuilding..."
	@echo "Building frontend webapp for ENV=$(ENV) ORG=$(ORG)..."
	@$(MAKE) config ENV=$(ENV) ORG=$(ORG)
	@echo "Creating production build in frontend/dist/"
	@echo "Please wait, the build takes a minute..."
	@cd frontend && npm run build

# User-facing frontend build - does full clean + build
# Usage: make build-frontend ENV=dev ORG=myorg
# Always does a clean build (removes dist/, configs, and .local/s3/webapp)
build-frontend:
	@echo "Building frontend webapp (ENV=$(ENV) ORG=$(ORG))..."
	@if [ -z "$(ORG)" ]; then \
		echo "❌ ORG parameter required. Usage: make build-frontend ENV=dev ORG=<org>"; \
		exit 1; \
	fi
	@$(MAKE) clean-frontend
	@$(MAKE) $(WEBAPP_BUILD_DIR)/index.html ENV=$(ENV) ORG=$(ORG)

# Deploy frontend to local S3 emulation directory
# Depends on frontend/dist/index.html which triggers rebuild if sources changed
# Usage: make deploy-frontend ENV=dev ORG=myorg
deploy-frontend: $(WEBAPP_BUILD_DIR)/index.html
	@echo "Deploying webapp to $(WEBAPP_DEST) (ENV=$(ENV) ORG=$(ORG))..."
	@mkdir -p $(WEBAPP_DEST)
	@cp -r frontend/dist/* $(WEBAPP_DEST)/
	@echo "Copying serve.py to emulate CloudFront+S3..."
	@cp infra/scripts/serve.py $(WEBAPP_DEST)/
	@echo "✅ Deployed to $(WEBAPP_DEST)"

# Serve webapp locally (incrementally rebuilds only if sources changed)
# Usage: make serve-webapp ENV=dev ORG=myorg
# For clean rebuild first: make clean-frontend && make serve-webapp ENV=dev ORG=myorg
serve-webapp: deploy-frontend
	@echo "🌐 Starting webapp server for ENV=$(ENV) ORG=$(ORG)..."
	@if [ -z "$(ORG)" ]; then \
		echo "❌ ORG parameter required. Usage: make serve-webapp ENV=dev ORG=<org>"; \
		exit 1; \
	fi
	@echo "📁 Serving from: $(WEBAPP_DEST)"
	@echo "🔧 Config will be read from: $(WEBAPP_DEST)/config.json"
	@echo "📝 Port configured in serve.py (check script for details)"
	@echo "================================================"
	@cd $(WEBAPP_DEST) && python serve.py

clean-backend:
	@echo "🧹 Cleaning backend build artifacts..."
	@rm -rf backend/.build
	@rm -rf .local/s3/lambda

clean-lambda-all: clean-backend
	@echo "🧹 Cleaning all Lambda build artifacts (including SAM)..."
	@rm -rf .aws-sam-*
	@rm -rf backend/layers

#############################################
# Date-tracked build targets
#############################################

# Collect backend source files for dependency tracking
BACKEND_SOURCES := $(shell find backend/rawscribe -type f \( -name '*.py' -o -name '*.json' \) 2>/dev/null)

# Stage source code to backend/.build/src/rawscribe/ (date-tracked)
# Depends on config being generated first
# Tracks ENV/ORG to force rebuild when they change
backend/.build/src/rawscribe/.staged: $(BACKEND_SOURCES)
	@if [ -z "$(ORG)" ]; then \
		echo "❌ ORG parameter required. Usage: make build-backend ENV=dev ORG=<org>"; \
		exit 1; \
	fi
	@if [ -z "$(ENV)" ]; then \
		echo "❌ ENV parameter required. Usage: make build-backend ENV=dev ORG=<org>"; \
		exit 1; \
	fi
	@# Check if ENV/ORG changed since last build
	@CURRENT_BUILD="$(ENV)-$(ORG)"; \
	if [ -f backend/.build/src/rawscribe/.staged ]; then \
		LAST_BUILD=$$(cat backend/.build/src/rawscribe/.staged 2>/dev/null || echo ""); \
		if [ "$$LAST_BUILD" != "$$CURRENT_BUILD" ]; then \
			echo "🔄 ENV/ORG changed ($$LAST_BUILD → $$CURRENT_BUILD), forcing rebuild..."; \
			rm -f backend/.build/src/rawscribe/.staged; \
		fi; \
	fi
	@# Always regenerate config for current ENV/ORG (ensures correct config)
	@$(MAKE) config ENV=$(ENV) ORG=$(ORG)
	@echo "📁 Staging source to backend/.build/src/rawscribe/..."
	@mkdir -p backend/.build/src
	@rsync -a --exclude '__pycache__' --exclude '*.pyc' --exclude 'tests/' \
					backend/rawscribe/ backend/.build/src/rawscribe/
	@echo "$(ENV)-$(ORG)" > backend/.build/src/rawscribe/.staged

# Copy requirements.txt to layer directory (date-tracked)
backend/layers/dependencies/requirements.txt: backend/rawscribe/requirements.txt
	@echo "📋 Copying requirements.txt to layer directory..."
	@mkdir -p backend/layers/dependencies
	@cp backend/rawscribe/requirements.txt backend/layers/dependencies/requirements.txt

#############################################
# Build targets
#############################################

# Build Lambda package for local deployment (with dependencies)
$(LAMBDA_DEST): backend/.build/src/rawscribe/.staged backend/rawscribe/requirements.txt
	@if [ -z "$(ORG)" ]; then \
		echo "❌ ORG parameter required. Usage: make build-backend ENV=dev ORG=<org>"; \
		exit 1; \
	fi
	@if [ -z "$(ENV)" ]; then \
		echo "❌ ENV parameter required. Usage: make build-backend ENV=dev ORG=<org>"; \
		exit 1; \
	fi
	@echo "📦 Building Lambda for local deployment (ENV=$(ENV) ORG=$(ORG))..."
	@# Install dependencies for local use
	@echo "📦 Installing dependencies..."
	@mkdir -p $(LAMBDA_BUILD_DIR)
	@pip install -r backend/rawscribe/requirements.txt -t $(LAMBDA_BUILD_DIR) --quiet
	@# Copy rawscribe code into build directory with dependencies
	@rsync -a backend/.build/src/rawscribe/ $(LAMBDA_BUILD_DIR)/rawscribe/
	@# Package everything
	@echo "📦 Creating package..."
	@cd $(LAMBDA_BUILD_DIR) && zip -rq $(LAMBDA_BUILD_NAME) . \
		-x "*.pyc" "__pycache__/*" "tests/*" "test/*"
	@mkdir -p $(LAMBDA_DEST_DIR)
	@cp $(LAMBDA_ARTIFACT) $(LAMBDA_DEST)

build-backend: $(LAMBDA_DEST)
	@if [ -z "$(ORG)" ]; then \
		echo "❌ ORG parameter required. Usage: make build-backend ENV=dev ORG=<org>"; \
		exit 1; \
	fi
	@if [ -z "$(ENV)" ]; then \
		echo "❌ ENV parameter required. Usage: make build-backend ENV=dev ORG=<org>"; \
		exit 1; \
	fi
	@echo "✅ Lambda package ready: $(LAMBDA_DEST)"


deploy-backend:
	@if [ "$(ENV)" = "dev" ] || [ "$(ENV)" = "test" ]; then \
		echo "Deploying lambda function to $(LAMBDA_DEST) (ENV=$(ENV) ORG=$(ORG))..."; \
		$(MAKE) build-backend ENV=$(ENV) ORG=$(ORG); \
		mkdir -p $(LAMBDA_DEST_DIR); \
		cp $(LAMBDA_ARTIFACT) $(LAMBDA_DEST); \
		echo "Deployed $(LAMBDA_ARTIFACT) to $(LAMBDA_DEST)"; \
	else \
		echo "For $(ENV) environment, use: make rs-deploy ENV=$(ENV) ORG=$(ORG)"; \
		exit 1; \
	fi

deploy-local:
	@echo "Deploying to local environment (ENV=$(ENV) ORG=$(ORG))..."
	@if [ -z "$(ORG)" ]; then \
		echo "❌ ORG parameter required. Usage: make deploy-local ENV=dev ORG=uga"; \
		exit 1; \
	fi
	@$(MAKE) deploy-frontend ENV=$(ENV) ORG=$(ORG)
	@$(MAKE) deploy-backend ENV=$(ENV) ORG=$(ORG)
	@echo "✅ Frontend and backend deployed to local environment"

# Serve Lambda function locally (build handled by build-backend)
# Usage: make serve-lambda ENV=dev ORG=myorg
# For development with hot reload, use: make start-backend ENV=dev ORG=myorg
# For clean rebuild first: make clean-backend && make serve-lambda ENV=dev ORG=myorg
serve-lambda:
	@echo "🚀 Starting lambda function (production-like) for ENV=$(ENV) ORG=$(ORG)..."
	@if [ -z "$(ORG)" ]; then \
		echo "❌ ORG parameter required. Usage: make serve-lambda ENV=dev ORG=<org>"; \
		exit 1; \
	fi
	@# Check if Lambda package exists, build if not
	@if [ ! -f "$(LAMBDA_DEST)" ]; then \
		echo "📦 Lambda package not found, building..."; \
		$(MAKE) build-backend ENV=$(ENV) ORG=$(ORG); \
	fi
	@# Extract if needed
	@if [ ! -d "$(LAMBDA_DEST_DIR)/build_mock" ] || [ "$(LAMBDA_DEST)" -nt "$(LAMBDA_DEST_DIR)/build_mock" ]; then \
		echo "📦 Extracting lambda package..."; \
		rm -rf $(LAMBDA_DEST_DIR)/build_mock; \
		unzip -oq $(LAMBDA_DEST) -d $(LAMBDA_DEST_DIR)/build_mock; \
		echo "📁 Lambda extracted to: $(LAMBDA_DEST_DIR)/build_mock"; \
	else \
		echo "✅ Using existing extracted lambda (up to date)"; \
	fi
	@# Create symlink to .local directory so lambda can find local storage
	@if [ ! -L "$(LAMBDA_DEST_DIR)/build_mock/.local" ]; then \
		echo "🔗 Creating symlink to local storage..."; \
		cd $(LAMBDA_DEST_DIR)/build_mock && ln -sf ../../../../.local .local; \
	fi
	@echo "🌐 Starting server (ENV=$(ENV) ORG=$(ORG))"
	@echo "📋 Port configured in uvicorn defaults (typically 8000)"
	@echo "⚡ Production mode: No auto-reload (use start-backend for dev with hot reload)"
	@echo "📝 Logs visible below (Ctrl+C to stop):"
	@echo "================================================"
	cd $(LAMBDA_DEST_DIR)/build_mock && uvicorn rawscribe.main:app --host 0.0.0.0

# Force rebuild for serve-lambda-debug (no incremental build)
serve-lambda-debug:
	@echo "🐛 Starting lambda function in DEBUG mode for ENV=$(ENV) ORG=$(ORG)..."
	@if [ -z "$(ORG)" ]; then \
		echo "❌ ORG parameter required. Usage: make serve-lambda-debug ENV=dev ORG=<org>"; \
		exit 1; \
	fi
	@echo "📦 Forcing full rebuild for debug mode..."
	@$(MAKE) clean-backend
	@$(MAKE) build-backend ENV=$(ENV) ORG=$(ORG)
	@echo "📦 Extracting lambda package..."
	@rm -rf $(LAMBDA_DEST_DIR)/build_mock
	@unzip -oq $(LAMBDA_DEST) -d $(LAMBDA_DEST_DIR)/build_mock
	@echo "📁 Lambda extracted to: $(LAMBDA_DEST_DIR)/build_mock"
	@# Create symlink to .local directory so lambda can find local storage
	@if [ ! -L "$(LAMBDA_DEST_DIR)/build_mock/.local" ]; then \
		echo "🔗 Creating symlink to local storage..."; \
		cd $(LAMBDA_DEST_DIR)/build_mock && ln -sf ../../../../.local .local; \
	fi
	@echo "🐛 DEBUG MODE: Full logs with verbose output"
	@echo "🌐 Starting server (ENV=$(ENV) ORG=$(ORG))"
	@echo "📋 Port from uvicorn defaults (typically 8000)"
	@echo "================================================"
	cd $(LAMBDA_DEST_DIR)/build_mock && uvicorn rawscribe.main:app --host 0.0.0.0 --log-level debug

mirror:
	@echo "This rule isn't working right now, use serve-lambda and serve-webapp instead"
	@$(MAKE) serve-lambda ENV=$(ENV) 
	@$(MAKE) serve-webapp ENV=$(ENV)

#############################################
# RAWSCRIBE Deployment (AWS SAM)
#############################################

# Build Lambda with SAM (builds both layer and function from source)
# - Layer: SAM builds from backend/layers/dependencies (caches Python packages)
# - Function: SAM builds from backend/.build/src (contains rawscribe/ directory)
# Usage: make rs-build ENV=stage ORG=myorg
rs-build: backend/.build/src/rawscribe/.staged backend/layers/dependencies/requirements.txt template.yaml
	@if [ -z "$(ORG)" ]; then \
		echo "Error: ORG parameter required. Usage: make rs-build ENV=$(ENV) ORG=myorg"; \
		exit 1; \
	fi
	@if [ -z "$(ENV)" ]; then \
		echo "Error: ENV parameter required. Usage: make rs-build ENV=$(ENV) ORG=myorg"; \
		exit 1; \
	fi
	@# Can't use make timestamp features because ENV, ORG are not available in the makefile
	@# xxx could get around this complicated logic by having ORG-ENV-specific makefiles
	@# Check if template.yaml changed (timestamp-based) - force rebuild if so
	@if [ -f ".aws-sam-$(ENV)-$(ORG)/.template-timestamp" ]; then \
		if [ "template.yaml" -nt ".aws-sam-$(ENV)-$(ORG)/.template-timestamp" ]; then \
			echo "🔄 template.yaml modified - forcing rebuild..."; \
			rm -rf .aws-sam-$(ENV)-$(ORG)/cache; \
		fi; \
	fi
	@echo "🔧 Building Lambda for $(ENV)/$(ORG)..."
	@echo ""
	@# Build with SAM (source and layer already staged)
	@echo "🔨 Building with SAM (layer + function)..."
	@echo "📌 Note: SAM will show 'requirements.txt not found' for function code - this is expected."
	@echo "   Dependencies are in the layer, not the function code (by design)."
	@sam build --cached \
		--build-dir .aws-sam-$(ENV)-$(ORG) \
		--cache-dir .aws-sam-$(ENV)-$(ORG)/cache
	@# Update template timestamp to track when template was last built
	@touch .aws-sam-$(ENV)-$(ORG)/.template-timestamp
	@echo ""
	@echo "✅ Build complete for $(ENV)/$(ORG)"
	@echo "   Build directory: .aws-sam-$(ENV)-$(ORG)/"
	@echo "   - DependencyLayer: Python packages in .aws-sam-$(ENV)-$(ORG)/DependencyLayer/python/"
	@echo "   - RawscribeLambda: Code in .aws-sam-$(ENV)-$(ORG)/RawscribeLambda/rawscribe/"
	@echo "   Ready for deployment with 'make rs-deploy-only'"



rs-validate:
	sam validate --lint

rs-package:
	@echo "Packaging SAM application..."
	$(eval ACCOUNT_NUMBER := $(shell $(GET_ACCOUNT_NUMBER)))
	@if [ -z "$(ORG)" ]; then \
		sam package --s3-bucket aws-sam-cli-managed-default-samclisourcebucket-$(ENV) --output-template-file packaged.yaml --build-dir .aws-sam-$(ENV)-$(ORG); \
	else \
		sam package --s3-bucket rawscribe-sam-deployments-$(ACCOUNT_NUMBER) --s3-prefix rawscribe-$(ENV)-$(ORG) --output-template-file packaged.yaml --build-dir .aws-sam-$(ENV)-$(ORG); \
	fi


# Build and deploy Lambda + infrastructure to AWS
# Usage: make rs-deploy ENV=stage ORG=myorg [CREATE_BUCKETS=true] [ENABLE_AUTH=true]
# 
# Parameters:
#   ENV           - Environment (stage|prod) [REQUIRED]
#   ORG           - Organization name [REQUIRED]
#   CREATE_BUCKETS - Create S3 buckets (true|false, default: false)
#   ENABLE_AUTH    - Enable Cognito auth (true|false, default: true)
#   CREATE_COGNITO - Force new Cognito pool (true|false, default: false, RARE!)
#
# Cognito behavior (automatic detection):
#   - Reuses existing Cognito pool if found in stack
#   - Creates NEW pool only if none exists OR CREATE_COGNITO=true
#   - ENABLE_AUTH toggles authentication on/off (doesn't delete pool)
#
# Common scenarios:
#   Fresh deploy:        make rs-deploy ENV=stage ORG=myorg CREATE_BUCKETS=true
#   Code update:         make rs-deploy ENV=stage ORG=myorg
#   Config update:       make rs-deploy ENV=stage ORG=myorg
#   Toggle auth:         make rs-deploy ENV=stage ORG=myorg ENABLE_AUTH=false
#   Force new pool:      make rs-deploy ENV=stage ORG=myorg CREATE_COGNITO=true (RARE!)
#   Fast code-only:      make rs-deploy-function ENV=stage ORG=myorg (bypasses CloudFormation)
# Bootstrap test environment with test users and sample SOP
# Usage: make rs-bootstrap-testenv ENV=stage ORG=testorg
# Creates test users and uploads a sample SOP for testing (non-prod only)
rs-bootstrap-testenv:
	@if [ -z "$(ORG)" ] || [ -z "$(ENV)" ]; then \
		echo "❌ ENV and ORG required. Usage: make rs-bootstrap-testenv ENV=stage ORG=testorg"; \
		exit 1; \
	fi
	@if [ "$(ENV)" = "prod" ]; then \
		echo "❌ Cannot bootstrap test environment in production!"; \
		echo "   Use: make rs-add-user ENV=prod ORG=$(ORG) for production users"; \
		exit 1; \
	fi
	@echo "🧪 Bootstrapping test environment for $(ENV)/$(ORG)..."
	@echo ""
	@echo "👥 Creating test users..."
	@$(MAKE) rs-create-test-users ENV=$(ENV) ORG=$(ORG) || \
		(echo "⚠️  Test user creation failed (Lambda may need a moment)" && \
		 echo "   Retry manually: make rs-create-test-users ENV=$(ENV) ORG=$(ORG)")
	@echo ""
	@echo "📄 Loading example SOP for testing..."
	@$(MAKE) rs-cp-sop FILE=infra/examples/sopTest4.yaml ENV=$(ENV) ORG=$(ORG)
	@echo ""
	@echo "✅ Test environment bootstrapped!"
	@echo ""
	@echo "📋 Test user credentials:"
	@echo "   testadmin@example.com / TestAdmin123! [ADMINS]"
	@echo "   testresearcher@example.com / TestResearch123! [RESEARCHERS]"
	@echo "   testclinician@example.com / TestClinic123! [CLINICIANS]"
	@echo ""
	@echo "Next steps:"
	@echo "  1. Start frontend: make start-frontend ENV=$(ENV) ORG=$(ORG)"
	@WEBAPP_PORT=$$(jq -r '.webapp.server.port // 3000' frontend/public/config.json 2>/dev/null || echo "3000"); \
	echo "  2. Navigate to: http://localhost:$$WEBAPP_PORT/claire"
	@echo "  3. Login with test credentials above"
	@echo ""
	@echo "  When done testing:"
	@echo "  • Remove test users: make rs-remove-test-users ENV=$(ENV) ORG=$(ORG)"
	@echo ""

# Full deployment with automatic bucket detection and test environment setup
# Usage: make rs-deploy ENV=stage ORG=testorg
# Automatically detects if buckets exist, creates them if needed
# For non-prod environments, automatically bootstraps test users and sample SOP
# Note: rs-build uses Make dependencies + SAM --cached, so rebuilds only when needed
rs-deploy: rs-build
	@if [ -z "$(ORG)" ] || [ -z "$(ENV)" ]; then \
		echo "❌ ENV and ORG required. Usage: make rs-deploy ENV=stage ORG=testorg"; \
		exit 1; \
	fi
	$(eval AWS_REGION := $(shell $(GET_AWS_REGION)))
	$(eval ACCOUNT_NUMBER := $(shell $(GET_ACCOUNT_NUMBER)))
	$(eval STACK_NAME := rawscribe-$(ENV)-$(ORG))
	@# Auto-detect CREATE_BUCKETS based on stack existence
	@# Once a stack is created, we ALWAYS use CREATE_BUCKETS=true to keep CloudFormation managing buckets
	@STACK_EXISTS=$$(aws cloudformation describe-stacks --stack-name $(STACK_NAME) --region $(AWS_REGION) 2>/dev/null && echo "true" || echo "false"); \
	if [ -n "$(CREATE_BUCKETS)" ]; then \
		echo "📋 Using explicit CREATE_BUCKETS=$(CREATE_BUCKETS)"; \
		$(MAKE) rs-deploy-only ENV=$(ENV) ORG=$(ORG) CREATE_BUCKETS=$(CREATE_BUCKETS); \
	elif [ "$$STACK_EXISTS" = "true" ]; then \
		echo "📦 Existing stack detected - keeping buckets managed (CREATE_BUCKETS=true)"; \
		$(MAKE) rs-deploy-only ENV=$(ENV) ORG=$(ORG) CREATE_BUCKETS=true; \
	else \
		echo "🆕 Fresh deployment - creating buckets (CREATE_BUCKETS=true)"; \
		$(MAKE) rs-deploy-only ENV=$(ENV) ORG=$(ORG) CREATE_BUCKETS=true; \
	fi
	@$(MAKE) rs-ping-health ENV=$(ENV) ORG=$(ORG)
	@echo ""
	@# Bootstrap test environment for non-prod when buckets were just created
	@# Check if SOP already exists to determine if this is truly a fresh deployment
	@if [ "$(ENV)" != "prod" ]; then \
		SOP_EXISTS=$$(aws s3 ls s3://rawscribe-forms-$(ENV)-$(ORG)-$(ACCOUNT_NUMBER)/forms/sops/sopTest4.yaml 2>/dev/null && echo "true" || echo "false"); \
		if [ "$$SOP_EXISTS" = "false" ]; then \
			NEEDS_BOOTSTRAP=true; \
		else \
			NEEDS_BOOTSTRAP=false; \
		fi; \
		if [ "$$NEEDS_BOOTSTRAP" = "true" ]; then \
		echo "🧪 Fresh non-prod deployment detected - bootstrapping test environment..."; \
		echo ""; \
		$(MAKE) rs-bootstrap-testenv ENV=$(ENV) ORG=$(ORG) || \
			(echo "⚠️  Bootstrap failed - you can retry with:" && \
			 echo "   make rs-bootstrap-testenv ENV=$(ENV) ORG=$(ORG)"); \
		echo ""; \
		echo "📝 Deployment complete!"; \
		echo ""; \
		echo "✅ Completed automatically:"; \
		echo "  • Infrastructure deployed"; \
		echo "  • Config files synced from CloudFormation outputs"; \
		echo "  • Test users created (admin, researcher, clinician)"; \
		echo "  • Sample SOP uploaded"; \
		echo ""; \
		echo "📌 Recommended next steps:"; \
		echo "  1. Commit synced configs to version control"; \
		echo "     cd <path-to-org-specific-syndi-config-repo>"; \
		echo "     git add .; git commit -m 'Update configs for $(ENV)-$(ORG)'"; \
		echo ""; \
		echo "  2. Test the deployment:"; \
		echo "     make start-frontend ENV=$(ENV) ORG=$(ORG)"; \
		WEBAPP_PORT=$$(jq -r '.webapp.server.port // 3000' frontend/public/config.json 2>/dev/null || echo "3000"); \
		echo "     Navigate to: http://localhost:$$WEBAPP_PORT/claire"; \
		echo "     Login as: testresearcher@example.com / TestResearch123!"; \
		echo ""; \
		echo "🎉 SYNDI has you on your way to AI-ready data!"; \
		echo ""; \
		else \
			echo "📝 Deployment update complete!"; \
			echo ""; \
			echo "✅ Infrastructure updated successfully"; \
			echo ""; \
		fi; \
	elif [ "$(ENV)" = "prod" ]; then \
		echo "📝 Production deployment complete!"; \
		echo ""; \
		echo "✅ Infrastructure deployed successfully"; \
		echo ""; \
		echo "⚠️  Remember to create production admin user:"; \
		echo "  make rs-add-user ENV=prod ORG=$(ORG) \\"; \
		echo "    USER_NAME=admin@$(ORG).com PASSWORD='YourSecurePass!' \\"; \
		echo "    GROUP=ADMINS BOOTSTRAP=true"; \
		echo ""; \
	fi

# XXX this is very dangerous, remove it in deployment
# Complete stack cycling: nuke everything and redeploy from scratch
# Usage: make rs-cycle-stack ENV=stage ORG=testorg
# WARNING: This is DESTRUCTIVE - only use for testing environments!
# Perfect for testing clean deployments or resetting a test environment
# Automatically bypasses confirmation prompts (FORCE_YES=true)
rs-cycle-stack:
	@if [ -z "$(ORG)" ] || [ -z "$(ENV)" ]; then \
		echo "❌ ENV and ORG required. Usage: make rs-cycle-stack ENV=stage ORG=testorg"; \
		exit 1; \
	fi
	@if [ "$(ENV)" = "prod" ]; then \
		echo "❌ BLOCKED: Cannot cycle production environment!"; \
		exit 1; \
	fi
	@echo "🔄 Cycling stack for $(ENV)/$(ORG)..."
	@echo "⚠️  This will DESTROY and REBUILD everything!"
	@echo ""
	@read -p "Type 'CYCLE $(ORG)' to confirm: " confirmation; \
	if [ "$$confirmation" != "CYCLE $(ORG)" ]; then \
		echo "❌ Cancelled"; \
		exit 1; \
	fi
	@echo ""
	@echo "Step 1: Nuclear cleanup..."
	@$(MAKE) rs-nuke-all ENV=$(ENV) ORG=$(ORG) FORCE_YES=true
	@echo ""
	@echo "⏳ Waiting 10 seconds for AWS resources to fully delete..."
	@sleep 10
	@echo ""
	@echo "Step 2: Fresh deployment..."
	@# After nuclear cleanup, buckets are gone, so force creation
	@$(MAKE) rs-deploy ENV=$(ENV) ORG=$(ORG) CREATE_BUCKETS=true
	@echo ""
	@echo "✅ Stack cycle complete for $(ENV)/$(ORG)!"

# Copy SOP file to Lambda bucket (for testing/seeding forms)
# Usage: make rs-cp-sop ENV=stage ORG=myorg FILE=infra/examples/sopTest4.yaml
# Uploads SOP YAML file to the forms directory where the system can find it
rs-cp-sop:
	@if [ -z "$(ORG)" ] || [ -z "$(ENV)" ] || [ -z "$(FILE)" ]; then \
		echo "❌ ENV, ORG, and FILE required."; \
		echo "Usage: make rs-cp-sop ENV=stage ORG=testorg FILE=infra/examples/sopTest4.yaml"; \
		exit 1; \
	fi
	@if [ ! -f "$(FILE)" ]; then \
		echo "❌ File not found: $(FILE)"; \
		exit 1; \
	fi
	$(eval AWS_REGION := $(shell $(GET_AWS_REGION)))
	$(eval STACK_NAME := rawscribe-$(ENV)-$(ORG))
	$(eval FORMS_BUCKET := $(shell $(GET_RS_FORMS_BUCKET)))
	@if [ -z "$(FORMS_BUCKET)" ] || [ "$(FORMS_BUCKET)" = "Not found" ]; then \
		echo "❌ Forms bucket not found for stack: $(STACK_NAME)"; \
		echo "   Deploy first with: make rs-deploy ENV=$(ENV) ORG=$(ORG) CREATE_BUCKETS=true"; \
		exit 1; \
	fi
	@echo "📤 Uploading $(FILE) to forms bucket..."
	@aws s3 cp $(FILE) s3://$(FORMS_BUCKET)/forms/sops/ --region $(AWS_REGION)
	@echo "✅ SOP uploaded to s3://$(FORMS_BUCKET)/forms/sops/$$(basename $(FILE))"

# Deploy without building (use when build already exists)
# Usage: make rs-deploy-only ENV=stage ORG=myorg
# Deploys via CloudFormation using existing .aws-sam-${ENV}-${ORG} build directory
# Automatically detects and handles Cognito pools (stack-managed vs external)
# Take COGNITO_POOL_ID and COGNITO_CLIENT_ID
rs-deploy-only:
	@if [ -z "$(ORG)" ] || [ -z "$(ENV)" ]; then \
		echo "Error: ENV and ORG required. Usage: make rs-deploy-only ENV=stage ORG=uga"; \
		exit 1; \
	fi
	@echo "🚀 Deploying $(STACK_NAME)..."
	$(eval ACCOUNT_NUMBER := $(shell $(GET_ACCOUNT_NUMBER)))
	$(eval STACK_NAME := rawscribe-$(ENV)-$(ORG))
	$(eval AWS_REGION := $(shell $(GET_AWS_REGION)))
	@# Handle ROLLBACK_COMPLETE and DELETE_FAILED states
	@STACK_STATUS=$$(aws cloudformation describe-stacks --stack-name $(STACK_NAME) --region $(AWS_REGION) --query 'Stacks[0].StackStatus' --output text 2>/dev/null || echo "NO_STACK"); \
	if [ "$$STACK_STATUS" = "ROLLBACK_COMPLETE" ] || [ "$$STACK_STATUS" = "DELETE_FAILED" ]; then \
		echo "⚠️  Stack in $$STACK_STATUS state - deleting before redeploy..."; \
		aws cloudformation delete-stack --stack-name $(STACK_NAME) --region $(AWS_REGION); \
		echo "⏳ Waiting for stack deletion to complete..."; \
		aws cloudformation wait stack-delete-complete --stack-name $(STACK_NAME) --region $(AWS_REGION) 2>/dev/null || \
			(echo "⚠️  Wait timed out or failed, checking status..."; \
			 FINAL_STATUS=$$(aws cloudformation describe-stacks --stack-name $(STACK_NAME) --region $(AWS_REGION) --query 'Stacks[0].StackStatus' --output text 2>/dev/null || echo "NO_STACK"); \
			 if [ "$$FINAL_STATUS" != "NO_STACK" ]; then \
				echo "❌ Stack still exists with status: $$FINAL_STATUS"; \
				echo "   Manual intervention may be required"; \
				exit 1; \
			 fi); \
		echo "✅ Failed stack deleted"; \
	elif [ "$$STACK_STATUS" != "NO_STACK" ]; then \
		echo "📊 Stack status: $$STACK_STATUS"; \
	fi
	@# Detect Cognito configuration using centralized script
	@COGNITO_INFO=$$(infra/scripts/cognito-user-manager.sh detect-cognito --env $(ENV) --org $(ORG) --region $(AWS_REGION) 2>/dev/null || echo ""); \
	if [ -z "$$COGNITO_INFO" ]; then \
		echo "📢 No existing Cognito pool found"; \
		echo "   Strategy: CloudFormation will create new pool"; \
		COGNITO_PARAMS=""; \
	else \
		POOL_ID=$$(echo "$$COGNITO_INFO" | grep "^POOL_ID=" | cut -d'=' -f2); \
		CLIENT_ID=$$(echo "$$COGNITO_INFO" | grep "^CLIENT_ID=" | cut -d'=' -f2); \
		IS_STACK_MANAGED=$$(echo "$$COGNITO_INFO" | grep "^IS_STACK_MANAGED=" | cut -d'=' -f2); \
		echo "   Pool ID: $$POOL_ID"; \
		echo "   Client ID: $$CLIENT_ID"; \
		echo "   Stack-managed: $$IS_STACK_MANAGED"; \
		echo ""; \
		echo "🔍 Cognito pool deployment strategy:"; \
		if [ "$(CREATE_COGNITO)" = "true" ]; then \
			echo "   ⚠️  CREATE_COGNITO=true - Will create NEW pool"; \
			echo "   WARNING: Existing pool will be DELETED if managed by stack!"; \
			echo "   Strategy: CloudFormation will create new pool"; \
			COGNITO_PARAMS=""; \
		elif [ "$$IS_STACK_MANAGED" = "true" ]; then \
			echo "   ✅ Stack-managed pool: $$POOL_ID"; \
			echo "   Strategy: Let CloudFormation manage (NO parameters)"; \
			COGNITO_PARAMS=""; \
		elif [ -n "$$POOL_ID" ] && [ "$$POOL_ID" != "None" ]; then \
			echo "   ✅ External pool: $$POOL_ID"; \
			echo "   Strategy: Pass as parameter"; \
			COGNITO_PARAMS="CognitoUserPoolId=$$POOL_ID CognitoClientId=$$CLIENT_ID"; \
		else \
			echo "   📢 Invalid pool configuration"; \
			echo "   Strategy: CloudFormation will create new pool"; \
			COGNITO_PARAMS=""; \
		fi; \
	fi; \
	echo ""; \
	echo "📋 Deployment:"; \
	echo "   ENV=$(ENV) ORG=$(ORG) EnableAuth=$(ENABLE_AUTH) CreateBuckets=$(CREATE_BUCKETS)"; \
	echo "   Cognito: $$COGNITO_PARAMS"; \
	echo ""; \
	if sam deploy --no-confirm-changeset \
		--stack-name $(STACK_NAME) \
		--template-file .aws-sam-$(ENV)-$(ORG)/template.yaml \
		--s3-bucket rawscribe-sam-deployments-$(ACCOUNT_NUMBER) \
		--s3-prefix rawscribe-$(ENV)-$(ORG) \
		--region $(AWS_REGION) \
		--parameter-overrides Environment=$(ENV) Organization=$(ORG) \
			EnableAuth=$(ENABLE_AUTH) CreateBuckets=$(CREATE_BUCKETS) $$COGNITO_PARAMS \
		--capabilities CAPABILITY_NAMED_IAM 2>&1 | tee /tmp/sam-deploy.log; then \
		echo ""; \
		echo "✅ Deployment successful"; \
	elif grep -q "No changes to deploy" /tmp/sam-deploy.log; then \
		echo ""; \
		echo "✅ Stack already up to date (no changes needed)"; \
	else \
		echo ""; \
		echo "❌ Deployment failed"; \
		exit 1; \
	fi; \
	rm -f /tmp/sam-deploy.log
	@echo ""
	@echo "   Config is packaged inside Lambda (no separate S3 upload needed)"
	@echo ""
	@# Auto-sync configs unless SKIP_SYNC=true
	@if [ "$(SKIP_SYNC)" != "true" ]; then \
		echo "🔄 Auto-syncing configs from CloudFormation outputs..."; \
		$(MAKE) sync-configs ENV=$(ENV) ORG=$(ORG) || echo "⚠️  Config sync failed (not critical)"; \
		echo ""; \
	else \
		echo "⏭️  Skipping config sync (SKIP_SYNC=true)"; \
		echo "   Run manually: make sync-configs ENV=$(ENV) ORG=$(ORG)"; \
		echo ""; \
	fi

rs-check-stack-status:
	@if [ -z "$(ORG)" ] || [ -z "$(ENV)" ]; then \
		echo "Error: ENV and ORG parameters required. Usage: make rs-check-stack-status ENV=stage ORG=pwb"; \
		exit 1; \
	fi
	$(eval STACK_NAME := rawscribe-$(ENV)-$(ORG))
	$(eval AWS_REGION := $(shell $(GET_AWS_REGION)))
	@echo "Checking stack status for $(STACK_NAME)..."
	@STACK_STATUS=$$(aws cloudformation describe-stacks --stack-name $(STACK_NAME) --region $(AWS_REGION) --query 'Stacks[0].StackStatus' --output text 2>/dev/null || echo "NO_STACK"); \
	if [ "$$STACK_STATUS" = "NO_STACK" ]; then \
		echo "❌ Stack does not exist"; \
	elif [ "$$STACK_STATUS" = "ROLLBACK_COMPLETE" ]; then \
		echo "⚠️  Stack is in ROLLBACK_COMPLETE state (failed deployment)"; \
		echo "   Run 'make rs-deploy-only ENV=$(ENV) ORG=$(ORG)' to auto-delete and redeploy"; \
	elif [ "$$STACK_STATUS" = "CREATE_COMPLETE" ] || [ "$$STACK_STATUS" = "UPDATE_COMPLETE" ]; then \
		echo "✅ Stack is healthy: $$STACK_STATUS"; \
	else \
		echo "📊 Stack status: $$STACK_STATUS"; \
	fi

rs-deploy-stage:
	@if [ -z "$(ORG)" ]; then echo "Error: ORG parameter required. Usage: make rs-deploy-stage ORG=pwb"; exit 1; fi
	@echo "Deploying to stage environment for $(ORG) with SAM..."
	@$(MAKE) rs-deploy ENV=stage ORG=$(ORG)

rs-deploy-prod:
	@if [ -z "$(ORG)" ]; then echo "Error: ORG parameter required. Usage: make rs-deploy-prod ORG=pwb"; exit 1; fi
	@echo "Deploying to production environment for $(ORG) with SAM..."
	@echo "Production deployment - are you sure? (Ctrl+C to cancel)"
	@sleep 5
	@$(MAKE) rs-deploy ENV=prod ORG=$(ORG)

rs-sync:
	$(eval AWS_REGION := $(shell $(GET_AWS_REGION)))
	@if [ -z "$(ORG)" ]; then \
		echo "Error: ORG parameter required. Usage: make rs-sync ENV=$(ENV) ORG=pwb"; \
		exit 1; \
	fi
	@echo "Syncing Lambda code for $(ENV) $(ORG)..."
	@$(MAKE) config ENV=$(ENV) ORG=$(ORG)
	$(eval STACK_NAME := $(shell $(GET_RS_STACK_NAME)))
	if ! aws cloudformation describe-stacks --stack-name $(STACK_NAME) --region $(AWS_REGION) >/dev/null 2>&1; then \
		echo "Stack $(STACK_NAME) not found. Deploy first with: make rs-deploy ENV=$(ENV) ORG=$(ORG)"; \
		exit 1; \
	fi; \
	echo "Syncing stack: $(STACK_NAME)"; \
	if sam sync \
		--stack-name $(STACK_NAME) \
		--code \
		--region $(AWS_REGION) \
		--config-env $(ENV)-$(ORG) \
		--build-dir .aws-sam-$(ENV)-$(ORG); \
	then \
		echo "Lambda code synced successfully"; \
	else \
		echo "Sync failed. Check that your code compiles locally first."; \
		exit 1; \
	fi

rs-sync-watch:
	$(eval AWS_REGION := $(shell $(GET_AWS_REGION)))
	$(eval STACK_NAME := $(shell $(GET_RS_STACK_NAME)))
	@if [ -z "$(ORG)" ]; then \
		echo "Error: ORG parameter required. Usage: make rs-sync-watch ENV=$(ENV) ORG=pwb"; \
		exit 1; \
	fi
	@echo "Starting SAM sync in watch mode for $(ENV) $(ORG)..."
	@echo "Press Ctrl+C to stop watching"
	@$(MAKE) config ENV=$(ENV) ORG=$(ORG)
	if ! aws cloudformation describe-stacks --stack-name $(STACK_NAME) --region $(AWS_REGION) >/dev/null 2>&1; then \
		echo "Stack $$STACK_NAME not found. Deploy first with: make rs-deploy ENV=$(ENV) ORG=$(ORG)"; \
		exit 1; \
	fi; \
	echo "Watching stack: $(STACK_NAME)"; \
	sam sync --stack-name $(STACK_NAME) --watch --region $(AWS_REGION) --config-env $(ENV)-$(ORG) --build-dir .aws-sam-$(ENV)-$(ORG)


rs-update-config-files:
	$(eval AWS_REGION := $(shell $(GET_AWS_REGION)))
	$(eval STACK_NAME := $(shell $(GET_RS_STACK_NAME)))
	$(eval API_ENDPOINT := $(shell $(GET_RS_API_ENDPOINT)))
	@echo "Updating configuration with deployed endpoints..."
	if [ -n "$$API_ENDPOINT" ] && [ "$$API_ENDPOINT" != "None" ]; then \
		echo "API Endpoint: $$API_ENDPOINT"; \
		WEBAPP_CONFIG="infra/.config/webapp/$(ENV).json"; \
		if [ -f "$$WEBAPP_CONFIG" ]; then \
			cp "$$WEBAPP_CONFIG" "$${WEBAPP_CONFIG}.backup"; \
			jq --arg endpoint "$$API_ENDPOINT" \
				'.webapp.apiEndpoint = $$endpoint' \
				"$$WEBAPP_CONFIG" > "$${WEBAPP_CONFIG}.tmp" && \
			mv "$${WEBAPP_CONFIG}.tmp" "$$WEBAPP_CONFIG"; \
			echo "Updated webapp config"; \
		fi; \
	else \
		echo "Could not retrieve API endpoint from stack"; \
	fi

sync-configs:
	@echo "🔄 Syncing configs from CloudFormation stack..."
	@if [ -z "$(ENV)" ] || [ -z "$(ORG)" ]; then \
		echo "❌ Usage: make sync-configs ENV=stage ORG=uga"; \
		exit 1; \
	fi
	$(eval AWS_REGION := $(shell $(GET_AWS_REGION)))
	@python3 infra/scripts/sync-configs-from-cloudformation.py \
		--env $(ENV) \
		--org $(ORG) \
		--region $(AWS_REGION)
	@$(MAKE) config ENV=$(ENV) ORG=$(ORG)
	@echo "✅ Synced configs from CloudFormation stack"

# Empty all S3 buckets for this deployment
# Gets bucket names from CloudFormation stack outputs (doesn't assume naming pattern)
# Usage: make nuke-bucket-data ENV=stage ORG=myorg
# Set FORCE=true to skip confirmation (used by rs-teardown)
nuke-bucket-data:
	$(eval AWS_REGION := $(shell $(GET_AWS_REGION)))
	$(eval STACK_NAME := $(shell $(GET_RS_STACK_NAME)))
	@if [ -z "$(ORG)" ] || [ -z "$(ENV)" ]; then \
		echo "Error: ORG and ENV parameters required. Usage: make rs-bucket-data ENV=$(ENV) ORG=$(ORG)"; \
		exit 1; \
	fi
	@if [ "$(ENV)" = "prod" ]; then \
		echo "❌ BLOCKED: Cannot nuke production buckets!"; \
		echo "   If you really need to do this, use rs-teardown instead"; \
		exit 1; \
	fi
	@# Ask for confirmation unless FORCE=true (used by rs-teardown)
	@if [ "$(FORCE)" != "true" ]; then \
		echo "⚠️  WARNING: This will delete ALL data in S3 buckets!"; \
		echo "Stack: $(STACK_NAME)"; \
		echo ""; \
		read -p "Type 'yes' to confirm: " confirmation; \
		if [ "$$confirmation" != "yes" ]; then \
			echo "❌ Cancelled"; \
			exit 1; \
		fi; \
		echo ""; \
	fi
	$(eval ACCOUNT_NUMBER := $(shell $(GET_ACCOUNT_NUMBER)))
	@echo "🗑️  Emptying S3 buckets for $(ENV)/$(ORG)..."
	@# Use bucket naming pattern instead of querying stack (which may be deleted)
	@LAMBDA_BUCKET="rawscribe-lambda-$(ENV)-$(ORG)-$(ACCOUNT_NUMBER)"; \
	FORMS_BUCKET="rawscribe-forms-$(ENV)-$(ORG)-$(ACCOUNT_NUMBER)"; \
	ELN_BUCKET="rawscribe-eln-$(ENV)-$(ORG)-$(ACCOUNT_NUMBER)"; \
	DRAFTS_BUCKET="rawscribe-eln-drafts-$(ENV)-$(ORG)-$(ACCOUNT_NUMBER)"; \
	for bucket in "$$LAMBDA_BUCKET" "$$FORMS_BUCKET" "$$ELN_BUCKET" "$$DRAFTS_BUCKET"; do \
		if aws s3 ls "s3://$$bucket" --region $(AWS_REGION) >/dev/null 2>&1; then \
			echo "  Emptying $$bucket..."; \
			aws s3 rm "s3://$$bucket/" --recursive --region $(AWS_REGION) 2>/dev/null || true; \
		else \
			echo "  Bucket $$bucket doesn't exist (skipping)"; \
		fi; \
	done
	@echo "✅ All buckets emptied"

# Delete all Cognito users (for clean slate testing)
# WARNING: This permanently deletes all users and their data!
# Usage: make rs-nuke-users ENV=stage ORG=testorg
# This is useful when testing deployment from scratch
rs-nuke-users:
	$(eval AWS_REGION := $(shell $(GET_AWS_REGION)))
	$(eval STACK_NAME := $(shell $(GET_RS_STACK_NAME)))
	@if [ -z "$(ORG)" ] || [ -z "$(ENV)" ]; then \
		echo "Error: ORG and ENV parameters required. Usage: make rs-nuke-users ENV=$(ENV) ORG=$(ORG)"; \
		exit 1; \
	fi
	@echo "☢️  ☢️  ☢️  DESTRUCTIVE OPERATION ☢️  ☢️  ☢️"
	@echo ""
	@echo "This will PERMANENTLY DELETE all users for $(ENV)/$(ORG)!"
	@echo ""
	@echo "This is for TESTING ONLY to get a clean slate!"
	@echo "Production data will be LOST!"
	@echo ""
	@if [ "$(ENV)" = "prod" ]; then \
		echo "❌ BLOCKED: Cannot nuke production users!"; \
		echo "   If you really need to do this, use rs-teardown instead"; \
		exit 1; \
	fi
	@if [ "$(FORCE_YES)" != "true" ]; then \
		read -p "Type the org name '$(ORG)' to confirm: " confirmation; \
		if [ "$$confirmation" != "$(ORG)" ]; then \
			echo "❌ Cancelled"; \
			exit 1; \
		fi; \
	else \
		echo "  (auto-confirmed via FORCE_YES)"; \
	fi
	@echo ""
	@echo "🗑️  Deleting all users..."
	@$(COGNITO_SCRIPT) delete-all-users --env $(ENV) --org $(ORG) --region $(AWS_REGION)
	@echo "✅ All users deleted"



# Delete all S3 buckets (for clean slate testing)
# WARNING: This permanently deletes buckets AND all their data!
# Usage: make rs-nuke-buckets ENV=stage ORG=testorg
# This is useful when testing deployment from scratch
rs-nuke-buckets:
	$(eval AWS_REGION := $(shell $(GET_AWS_REGION)))
	$(eval ACCOUNT_NUMBER := $(shell $(GET_ACCOUNT_NUMBER)))
	@if [ -z "$(ORG)" ] || [ -z "$(ENV)" ]; then \
		echo "Error: ORG and ENV parameters required. Usage: make rs-nuke-buckets ENV=$(ENV) ORG=$(ORG)"; \
		exit 1; \
	fi
	@echo "☢️  ☢️  ☢️  DESTRUCTIVE OPERATION ☢️  ☢️  ☢️"
	@echo ""
	@echo "This will PERMANENTLY DELETE all S3 buckets for $(ENV)/$(ORG):"
	@echo "  • rawscribe-lambda-$(ENV)-$(ORG)-$(ACCOUNT_NUMBER)"
	@echo "  • rawscribe-forms-$(ENV)-$(ORG)-$(ACCOUNT_NUMBER)"
	@echo "  • rawscribe-eln-$(ENV)-$(ORG)-$(ACCOUNT_NUMBER)"
	@echo "  • rawscribe-eln-drafts-$(ENV)-$(ORG)-$(ACCOUNT_NUMBER)"
	@echo ""
	@echo "This is for TESTING ONLY to get a clean slate!"
	@echo "Production data will be LOST!"
	@echo ""
	@if [ "$(ENV)" = "prod" ]; then \
		echo "❌ BLOCKED: Cannot nuke production buckets!"; \
		echo "   If you really need to do this, use rs-teardown instead"; \
		exit 1; \
	fi
	@if [ "$(FORCE_YES)" != "true" ]; then \
		read -p "Type the org name '$(ORG)' to confirm: " confirmation; \
		if [ "$$confirmation" != "$(ORG)" ]; then \
			echo "❌ Cancelled"; \
			exit 1; \
		fi; \
	else \
		echo "  (auto-confirmed via FORCE_YES)"; \
	fi
	@echo ""
	@echo "🗑️  Step 1: Emptying buckets..."
	@$(MAKE) nuke-bucket-data ENV=$(ENV) ORG=$(ORG) FORCE=true
	@echo ""
	@echo "🗑️  Step 2: Deleting buckets..."
	@for bucket in \
		"rawscribe-lambda-$(ENV)-$(ORG)-$(ACCOUNT_NUMBER)" \
		"rawscribe-forms-$(ENV)-$(ORG)-$(ACCOUNT_NUMBER)" \
		"rawscribe-eln-$(ENV)-$(ORG)-$(ACCOUNT_NUMBER)" \
		"rawscribe-eln-drafts-$(ENV)-$(ORG)-$(ACCOUNT_NUMBER)"; do \
		echo "  Deleting $$bucket..."; \
		aws s3 rb s3://$$bucket --region $(AWS_REGION) 2>/dev/null || echo "  (bucket doesn't exist or already deleted)"; \
	done
	@echo ""
	@echo "✅ All buckets deleted"
	@echo "💡 You can now deploy with: make rs-deploy ENV=$(ENV) ORG=$(ORG) CREATE_BUCKETS=true"

# Delete Cognito User Pool (for authentication reset testing)
# WARNING: This deletes ALL users and authentication data!
# Usage: make rs-nuke-user-pool ENV=stage ORG=testorg
# Useful when you want to reset authentication but keep other resources
rs-nuke-user-pool:
	$(eval AWS_REGION := $(shell $(GET_AWS_REGION)))
	@if [ -z "$(ORG)" ] || [ -z "$(ENV)" ]; then \
		echo "Error: ORG and ENV parameters required. Usage: make rs-nuke-user-pool ENV=$(ENV) ORG=$(ORG)"; \
		exit 1; \
	fi
	@echo "☢️  ☢️  ☢️  DESTRUCTIVE OPERATION ☢️  ☢️  ☢️"
	@echo ""
	@echo "This will PERMANENTLY DELETE the Cognito User Pool for $(ENV)/$(ORG):"
	@echo "  • All users and their credentials"
	@echo "  • All groups (ADMINS, LAB_MANAGERS, RESEARCHERS, CLINICIANS)"
	@echo "  • User pool client configuration"
	@echo ""
	@echo "⚠️  CloudFormation Impact:"
	@echo "  If pool is stack-managed, next deployment will recreate it"
	@echo "  If pool is external, you'll need to create a new one manually"
	@echo ""
	@echo "This is for TESTING ONLY - reset authentication from scratch!"
	@echo ""
	@if [ "$(ENV)" = "prod" ]; then \
		echo "❌ BLOCKED: Cannot nuke production user pool!"; \
		echo "   Production users would lose access!"; \
		exit 1; \
	fi
	@if [ "$(FORCE_YES)" != "true" ]; then \
		read -p "Type 'DELETE USERS' to confirm: " confirmation; \
		if [ "$$confirmation" != "DELETE USERS" ]; then \
			echo "❌ Cancelled"; \
			exit 1; \
		fi; \
	else \
		echo "  (auto-confirmed via FORCE_YES)"; \
	fi
	@echo ""
	@echo "🗑️  Detecting and deleting user pool..."
	@COGNITO_INFO=$$(infra/scripts/cognito-user-manager.sh detect-cognito --env $(ENV) --org $(ORG) --region $(AWS_REGION) 2>/dev/null || echo ""); \
	if [ -z "$$COGNITO_INFO" ]; then \
		echo "  No Cognito pool found (already deleted or never created)"; \
		echo "✅ Nothing to delete"; \
	else \
		POOL_ID=$$(echo "$$COGNITO_INFO" | grep "^POOL_ID=" | cut -d'=' -f2); \
		if [ -n "$$POOL_ID" ] && [ "$$POOL_ID" != "None" ]; then \
			echo "  Deleting pool: $$POOL_ID"; \
			aws cognito-idp delete-user-pool \
				--user-pool-id "$$POOL_ID" \
				--region $(AWS_REGION) 2>/dev/null && \
				echo "✅ User pool deleted" || \
				echo "⚠️  Failed to delete pool (may not exist or no permissions)"; \
		else \
			echo "  Invalid pool ID detected"; \
			echo "✅ Nothing to delete"; \
		fi; \
	fi
	@echo ""
	@echo "💡 Next steps:"
	@echo "   To recreate pool: make rs-deploy ENV=$(ENV) ORG=$(ORG)"
	@echo "   Then create users: make rs-create-test-users ENV=$(ENV) ORG=$(ORG)"

# Nuclear option: Complete cleanup (local builds + CloudFormation + buckets)
# WARNING: This DESTROYS EVERYTHING for the environment!
# Usage: make rs-nuke-all ENV=stage ORG=testorg
# This is the ultimate clean slate for testing deployments from scratch
rs-nuke-all:
	$(eval AWS_REGION := $(shell $(GET_AWS_REGION)))
	@if [ -z "$(ORG)" ] || [ -z "$(ENV)" ]; then \
		echo "Error: ORG and ENV parameters required. Usage: make rs-nuke-all ENV=$(ENV) ORG=$(ORG)"; \
		exit 1; \
	fi
	@echo "☢️  ☢️  ☢️  NUCLEAR OPTION ☢️  ☢️  ☢️"
	@echo ""
	@echo "This will PERMANENTLY DELETE EVERYTHING for $(ENV)/$(ORG):"
	@echo "  1. Local build artifacts (backend/.build/, .aws-sam-*, etc.)"
	@echo "  2. CloudFormation stack (Lambda, API Gateway, Cognito, etc.)"
	@echo "  3. S3 buckets and ALL their data"
	@echo "  4. Cognito User Pool (all users and credentials)"
	@echo ""
	@echo "This gives you a COMPLETE clean slate!"
	@echo ""
	@if [ "$(ENV)" = "prod" ]; then \
		echo "❌ BLOCKED: Cannot nuke production environment!"; \
		echo "   Production is too important for this operation"; \
		exit 1; \
	fi
	@if [ "$(FORCE_YES)" != "true" ]; then \
		read -p "Type 'NUKE $(ORG)' to confirm total destruction: " confirmation; \
		if [ "$$confirmation" != "NUKE $(ORG)" ]; then \
			echo "❌ Cancelled"; \
			exit 1; \
		fi; \
	else \
		echo "  (auto-confirmed via FORCE_YES)"; \
	fi
	@echo ""
	@echo "☢️  Step 1/4: Cleaning local build artifacts..."
	@$(MAKE) clean-backend
	@$(MAKE) clean-lambda-all
	@echo ""
	@echo "☢️  Step 2/4: Tearing down CloudFormation stack..."
	@# Check if stack exists before trying to teardown
	@if aws cloudformation describe-stacks --stack-name rawscribe-$(ENV)-$(ORG) --region $(AWS_REGION) >/dev/null 2>&1; then \
		$(MAKE) rs-teardown ENV=$(ENV) ORG=$(ORG) FORCE_YES=true; \
	else \
		echo "  Stack doesn't exist (skipping)"; \
	fi
	@echo ""
	@echo "☢️  Step 3/4: Nuking user pool..."
	@$(MAKE) rs-nuke-user-pool ENV=$(ENV) ORG=$(ORG) FORCE_YES=true || true
	@echo ""
	@echo "☢️  Step 4/4: Nuking any remaining buckets..."
	@$(MAKE) rs-nuke-buckets ENV=$(ENV) ORG=$(ORG) FORCE_YES=true || true
	@echo ""
	@echo "✅ COMPLETE DESTRUCTION SUCCESSFUL!"
	@echo ""
	@echo "💡 Fresh start workflow:"
	@echo "   make rs-deploy ENV=$(ENV) ORG=$(ORG) CREATE_BUCKETS=true"

rs-teardown:
	$(eval AWS_REGION := $(shell $(GET_AWS_REGION)))
	$(eval STACK_NAME := $(shell $(GET_RS_STACK_NAME)))
	@if [ -z "$(ORG)" ] || [ -z "$(ENV)" ]; then \
		echo "Error: ORG and ENV parameters required. Usage: make rs-teardown ENV=$(ENV) ORG=$(ORG)"; \
		exit 1; \
	fi
	@$(MAKE) check-rs ENV=$(ENV) ORG=$(ORG)
	@echo "⚠️  ⚠️  ⚠️  DESTRUCTIVE OPERATION ⚠️  ⚠️  ⚠️"
	@echo ""
	@echo "Tearing down: $(STACK_NAME)"
	@echo "Environment:  $(ENV)"
	@echo "Organization: $(ORG)"
	@echo ""
	@echo "This will PERMANENTLY DELETE:"
	@echo "  • Cognito User Pool (all users and credentials)"
	@echo "  • Lambda functions"
	@echo "  • API Gateway"
	@echo "  • CloudFront distribution"
	@echo ""
	@echo "Permanently deleting all resources associated with the stack:"
	@if [ "$(FORCE_YES)" != "true" ]; then \
		read -p "Type 'yes' to confirm deletion: " confirmation; \
		if [ "$$confirmation" != "yes" ]; then \
			echo "❌ Cancelled"; \
			exit 1; \
		fi; \
	else \
		echo "  (auto-confirmed via FORCE_YES)"; \
	fi
	@echo ""
	@echo "🗑️  Deleting CloudFormation stack..."
	@aws cloudformation delete-stack --stack-name $(STACK_NAME) --region $(AWS_REGION)
	@echo "✅ Stack deletion initiated: $(STACK_NAME)"
	@echo ""
	@echo "⏳ Waiting for deletion to complete (this may take a few minutes)..."
	@aws cloudformation wait stack-delete-complete --stack-name $(STACK_NAME) --region $(AWS_REGION) 2>/dev/null && \
		echo "" && \
		echo "✅ Stack deleted successfully" || \
		(echo "" && echo "⚠️  Deletion may still be in progress or failed. Check with: make check-rs-stack-status ENV=$(ENV) ORG=$(ORG)")

rs-watch-log:
	@if [ -z "$(ORG)" ] || [ -z "$(ENV)" ]; then \
		echo "Error: ORG and ENV parameters required. Usage: make rs-watch-log ENV=$(ENV) ORG=$(ORG)"; \
		exit 1; \
	fi
	@echo "Fetching Lambda logs..."
	$(eval AWS_REGION := $(shell $(GET_AWS_REGION)))
	$(eval STACK_NAME := $(shell $(GET_RS_STACK_NAME)))
	$(eval FUNCTION_NAME := $(shell $(GET_RS_FUNCTION_NAME)))
	@if [ "$(FUNCTION_NAME)" = "Not found" ]; then \
		echo "Error: Lambda function not found. Deploy first with: make rs-deploy ENV=$(ENV) ORG=$(ORG)"; \
		exit 1; \
	fi
	aws logs tail /aws/lambda/$(FUNCTION_NAME) --follow --no-cli-pager

# Ping Lambda health endpoint to kickstart log group creation
rs-ping-health:
	@if [ -z "$(ORG)" ] || [ -z "$(ENV)" ]; then \
		echo "Error: ORG and ENV parameters required. Usage: make rs-ping-health ENV=$(ENV) ORG=$(ORG)"; \
		exit 1; \
	fi
	@echo "🏥 Pinging health endpoint to initialize logs..."
	$(eval AWS_REGION := $(shell $(GET_AWS_REGION)))
	$(eval STACK_NAME := $(shell $(GET_RS_STACK_NAME)))
	$(eval API_ENDPOINT := $(shell $(GET_RS_API_ENDPOINT)))
	$(eval API_URL := $(shell aws cloudformation describe-stacks --stack-name $(STACK_NAME) --region $(AWS_REGION) --query 'Stacks[0].Outputs[?OutputKey==`ApiEndpoint`].OutputValue' --output text 2>/dev/null || echo ""))
	@if [ -z "$(API_URL)" ]; then \
		echo "⚠️  Could not find API URL, skipping health check"; \
	else \
		echo "   API: $(API_ENDPOINT)"; \
		HTTP_CODE=$$(curl -s -o /tmp/health_response.json -w "%{http_code}" $(API_ENDPOINT)/health 2>/dev/null || echo "000"); \
		echo "   Status: $$HTTP_CODE"; \
		if [ "$$HTTP_CODE" != "200" ]; then \
			echo ""; \
			echo "❌ Health check failed (Status: $$HTTP_CODE)"; \
			echo "Response:"; \
			cat /tmp/health_response.json 2>/dev/null | jq . 2>/dev/null || cat /tmp/health_response.json 2>/dev/null || echo "(no response body)"; \
			echo ""; \
			echo "💡 Check Lambda logs: make rs-watch-log ENV=$(ENV) ORG=$(ORG)"; \
			rm -f /tmp/health_response.json; \
		else \
			echo "✅ Health check passed"; \
			rm -f /tmp/health_response.json; \
		fi; \
	fi

# aws cloudformation logs -n $$FUNCTION_NAME --stack-name $$STACK_NAME 
# logs -n $$FUNCTION_NAME --stack-name $$STACK_NAME --region $$AWS_REGION  

rs-update-config:
	$(eval AWS_REGION := $(shell $(GET_AWS_REGION)))
	$(eval STACK_NAME := $(shell $(GET_RS_STACK_NAME)))
	$(eval FUNCTION_NAME := $(shell $(GET_RS_FUNCTION_NAME)))
	@if [ -z "$(ORG)" ]; then \
		echo "Error: ORG parameter required. Usage: make rs-update-config ENV=$(ENV) ORG=pwb"; \
		exit 1; \
	fi
	@echo "Updating Lambda configuration..."
	@$(MAKE) config ENV=$(ENV) ORG=$(ORG)
	ENV_FILE="backend/.build/lambda/$(ENV)-$(ORG).env.json"; \
	if [ -f "$$ENV_FILE" ]; then \
		aws lambda update-function-configuration \
			--function-name $(FUNCTION_NAME) \
			--environment file://$$ENV_FILE \
			--region $(AWS_REGION); \
		echo "Configuration updated"; \
	else \
		echo "Environment file not found: $$ENV_FILE"; \
		exit 1; \
	fi

rs-update-code:
	$(eval AWS_REGION := $(shell $(GET_AWS_REGION)))
	$(eval STACK_NAME := $(shell $(GET_RS_STACK_NAME)))
	$(eval FUNCTION_NAME := $(shell $(GET_RS_FUNCTION_NAME)))
	@if [ -z "$(ORG)" ]; then \
		echo "Error: ORG parameter required. Usage: make rs-update-code ENV=$(ENV) ORG=pwb"; \
		exit 1; \
	fi
	@echo "Building and updating function code only..."
	@$(MAKE) config ENV=$(ENV) ORG=$(ORG)
	echo "Building with SAM..."; \
	sam build --cached --config-env $(ENV)-$(ORG) --build-dir .aws-sam-$(ENV)-$(ORG); \
	if [ -d ".aws-sam-$(ENV)-$(ORG)/RawscribeLambda" ]; then \
		echo "Creating deployment package..."; \
		cd .aws-sam-$(ENV)-$(ORG)/RawscribeLambda && \
		zip -r ../function.zip . -q && \
		cd ../.. && \
		echo "Updating Lambda function..."; \
		aws lambda update-function-code \
			--function-name $(FUNCTION_NAME) \
			--zip-file fileb://.aws-sam-$(ENV)-$(ORG)/function.zip \
			--region $(AWS_REGION) --output text --query 'LastUpdateStatus'; \
		echo "Code updated successfully!"; \
	else \
		echo "Build failed - Lambda function not found in .aws-sam-$(ENV)-$(ORG)/"; \
		exit 1; \
	fi

# Quick Lambda function update without full SAM deploy
# Packages code-only (dependencies are in layer) and updates function directly
rs-deploy-function: backend/.build/deploy-temp.zip
	@if [ -z "$(ORG)" ] || [ -z "$(ENV)" ]; then \
		echo "Error: ENV and ORG parameters required. Usage: make rs-deploy-function ENV=stage ORG=myorg"; \
		exit 1; \
	fi
	$(eval AWS_REGION := $(shell $(GET_AWS_REGION)))
	$(eval ACCOUNT_NUMBER := $(shell $(GET_ACCOUNT_NUMBER)))
	$(eval STACK_NAME := $(shell $(GET_RS_STACK_NAME)))
	$(eval FUNCTION_NAME := $(shell $(GET_RS_FUNCTION_NAME)))
	$(eval LAMBDA_BUCKET := $(shell $(GET_RS_LAMBDA_BUCKET)))
	@echo "📦 Quick deploy of Lambda function for $(ENV)/$(ORG)..."
	@FILE_SIZE=$$(stat -c%s backend/.build/deploy-temp.zip 2>/dev/null || stat -f%z backend/.build/deploy-temp.zip 2>/dev/null || echo "0"); \
	echo "Package size: $$(($$FILE_SIZE / 1024 / 1024))MB"; \
	if [ "$$FILE_SIZE" -lt "50000000" ]; then \
		echo "Updating Lambda function directly..."; \
		aws lambda update-function-code \
			--function-name $(FUNCTION_NAME) \
			--zip-file fileb://backend/.build/deploy-temp.zip \
			--region $(AWS_REGION) --output text --query 'LastUpdateStatus'; \
	else \
		echo "Package too large, uploading via S3..."; \
		S3_KEY="deployments/function-$$(date +%s).zip"; \
		aws s3 cp backend/.build/deploy-temp.zip s3://$(LAMBDA_BUCKET)/$$S3_KEY --region $(AWS_REGION); \
		aws lambda update-function-code \
			--function-name $(FUNCTION_NAME) \
			--s3-bucket $(LAMBDA_BUCKET) \
			--s3-key $$S3_KEY \
			--region $(AWS_REGION) --output text --query 'LastUpdateStatus'; \
		aws s3 rm s3://$(LAMBDA_BUCKET)/$$S3_KEY --region $(AWS_REGION); \
	fi; \
	echo "✅ Lambda function updated successfully!"


# Build code-only package for AWS deployment (dependencies in layer)
backend/.build/deploy-temp.zip: backend/.build/src/rawscribe/.staged
	@echo "📦 Creating code-only deployment package..."
	@cd backend/.build/src && zip -rq ../deploy-temp.zip rawscribe/ \
		-x "*.pyc" "__pycache__/*" "rawscribe/tests/*"


#############################################
# Cognito User Management
# Uses infra/scripts/cognito-user-manager.sh
#############################################

# Path to user management script
COGNITO_SCRIPT := infra/scripts/cognito-user-manager.sh

# List available Cognito groups with permissions
# Usage: make cognito-list-groups
cognito-list-groups:
	@$(COGNITO_SCRIPT) list-groups

# Show user details and group memberships
# Usage: make cognito-show-user ENV=stage ORG=uga USER_NAME=user@example.com
cognito-show-user:
	@if [ -z "$(USER_NAME)" ] || [ -z "$(ENV)" ] || [ -z "$(ORG)" ]; then \
		echo "❌ Required parameters missing"; \
		echo "Usage: make cognito-show-user ENV=stage ORG=uga USER_NAME=user@example.com"; \
		exit 1; \
	fi
	$(eval AWS_REGION := $(shell $(GET_AWS_REGION)))
	@$(COGNITO_SCRIPT) show-user --env $(ENV) --org $(ORG) --user $(USER_NAME) --region $(AWS_REGION)

# Set user password in Cognito
# Usage: make cognito-set-password ENV=stage ORG=uga USER_NAME=user@example.com PASSWORD="Pass123!"
cognito-set-password:
	@if [ -z "$(USER_NAME)" ] || [ -z "$(PASSWORD)" ] || [ -z "$(ENV)" ] || [ -z "$(ORG)" ]; then \
		echo "❌ Required parameters missing"; \
		echo "Usage: make cognito-set-password ENV=stage ORG=uga USER_NAME=user@example.com PASSWORD='Pass123!'"; \
		exit 1; \
	fi
	$(eval AWS_REGION := $(shell $(GET_AWS_REGION)))
	@$(COGNITO_SCRIPT) set-password --env $(ENV) --org $(ORG) --user $(USER_NAME) --password "$(PASSWORD)" --region $(AWS_REGION)

# Set user's group membership in Cognito
# Usage: make cognito-set-group ENV=stage ORG=uga USER_NAME=user@example.com GROUP=RESEARCHERS
# Valid groups: ADMINS, LAB_MANAGERS, RESEARCHERS, CLINICIANS
cognito-set-group:
	@if [ -z "$(USER_NAME)" ] || [ -z "$(GROUP)" ] || [ -z "$(ENV)" ] || [ -z "$(ORG)" ]; then \
		echo "❌ Required parameters missing"; \
		echo "Usage: make cognito-set-group ENV=stage ORG=uga USER_NAME=user@example.com GROUP=RESEARCHERS"; \
		exit 1; \
	fi
	$(eval AWS_REGION := $(shell $(GET_AWS_REGION)))
	@$(COGNITO_SCRIPT) set-group --env $(ENV) --org $(ORG) --user $(USER_NAME) --group $(GROUP) --region $(AWS_REGION)

# Remove user from Cognito
# Usage: make cognito-rm-user ENV=stage ORG=uga USER_NAME=user@example.com
cognito-rm-user:
	@if [ -z "$(USER_NAME)" ] || [ -z "$(ENV)" ] || [ -z "$(ORG)" ]; then \
		echo "❌ Required parameters missing"; \
		echo "Usage: make cognito-rm-user ENV=stage ORG=uga USER_NAME=user@example.com"; \
		exit 1; \
	fi
	$(eval AWS_REGION := $(shell $(GET_AWS_REGION)))
	@$(COGNITO_SCRIPT) remove-user --env $(ENV) --org $(ORG) --user $(USER_NAME) --region $(AWS_REGION)

# Create or update Cognito user with group membership
# Usage: make cognito-add-user ENV=stage ORG=uga USER_NAME=user@example.com PASSWORD="Pass123!" GROUP=RESEARCHERS
# Valid groups: ADMINS, LAB_MANAGERS, RESEARCHERS, CLINICIANS
# Default group: RESEARCHERS
cognito-add-user:
	@if [ -z "$(USER_NAME)" ] || [ -z "$(PASSWORD)" ] || [ -z "$(ENV)" ] || [ -z "$(ORG)" ]; then \
		echo "❌ Required parameters missing"; \
		echo "Usage: make cognito-add-user ENV=stage ORG=uga USER_NAME=user@example.com PASSWORD='Pass123!' GROUP=RESEARCHERS"; \
		exit 1; \
	fi
	$(eval AWS_REGION := $(shell $(GET_AWS_REGION)))
	$(eval GROUP := $(if $(GROUP),$(GROUP),RESEARCHERS))
	@$(COGNITO_SCRIPT) add-user --env $(ENV) --org $(ORG) --user $(USER_NAME) --password "$(PASSWORD)" --group $(GROUP) --region $(AWS_REGION)

# Create or update user via REST API (cloud-agnostic, auto-bootstraps)
# Usage: make rs-add-user ENV=stage ORG=myorg USER_NAME=user@example.com PASSWORD='Pass123!' GROUP=RESEARCHERS
# Bootstrap mode: make rs-add-user ENV=stage ORG=myorg USER_NAME=admin@example.com PASSWORD='Admin123!' GROUP=ADMINS BOOTSTRAP=true
# Works with: Cognito (stage/prod) and on-prem JWT (dev/test)
rs-add-user:
	@if [ -z "$(ORG)" ] || [ -z "$(ENV)" ] || [ -z "$(USER_NAME)" ] || [ -z "$(PASSWORD)" ]; then \
		echo "❌ ENV, ORG, USER_NAME, and PASSWORD required."; \
		echo "Usage: make rs-add-user ENV=stage ORG=myorg USER_NAME=user@example.com PASSWORD='Pass123!' GROUP=RESEARCHERS"; \
		echo "Bootstrap: make rs-add-user ... BOOTSTRAP=true (creates first admin without auth)"; \
		exit 1; \
	fi
	$(eval GROUP := $(if $(GROUP),$(GROUP),RESEARCHERS))
	@# Bootstrap mode: Create first admin without authentication
	@if [ "$(BOOTSTRAP)" = "true" ]; then \
		echo "🔧 Bootstrap mode: Creating first admin user without authentication..."; \
		if [ "$(ENV)" = "stage" ] || [ "$(ENV)" = "prod" ]; then \
			echo "Using Cognito SDK for AWS environment..."; \
			$(MAKE) cognito-add-user ENV=$(ENV) ORG=$(ORG) USER_NAME=$(USER_NAME) PASSWORD='$(PASSWORD)' GROUP=$(GROUP); \
		elif [ "$(ENV)" = "dev" ] || [ "$(ENV)" = "test" ]; then \
			echo "❌ On-prem JWT user management not yet implemented for dev/test"; \
			echo "TODO: Add user to infra/.config/lambda/$(ENV)-$(ORG).json"; \
			exit 1; \
		else \
			echo "❌ Invalid ENV: $(ENV). Must be dev, test, stage, or prod"; \
			exit 1; \
		fi; \
	fi
	$(eval AWS_REGION := $(shell $(GET_AWS_REGION)))
	$(eval STACK_NAME := $(shell $(GET_RS_STACK_NAME)))
	$(eval API_ENDPOINT := $(shell $(GET_RS_API_ENDPOINT)))
	@# API mode (not bootstrap) - use REST API with authentication
	@if [ "$(BOOTSTRAP)" != "true" ]; then \
		echo "👤 Creating/updating user $(USER_NAME) in group $(GROUP)..."; \
		TOKEN=$$(infra/scripts/cognito-user-manager.sh get-token --env $(ENV) --org $(ORG) --user testadmin@example.com --password 'TestAdmin123!' --region $(AWS_REGION)); \
		if [ -z "$$TOKEN" ]; then \
			echo ""; \
			echo "❌ Authentication failed. No admin user exists yet."; \
			echo ""; \
			echo "💡 To create your first admin user (bootstrap), run:"; \
			echo "   make rs-add-user ENV=$(ENV) ORG=$(ORG) USER_NAME=admin@$(ORG).com PASSWORD='YourSecurePass!' GROUP=ADMINS BOOTSTRAP=true"; \
			echo ""; \
			exit 1; \
		fi; \
		curl --http1.1 -s -X POST "$(API_ENDPOINT)/api/v1/user-management/users" \
			-H "Authorization: Bearer $$TOKEN" \
			-H "Content-Type: application/json" \
			-d '{"username":"$(USER_NAME)","password":"$(PASSWORD)","group":"$(GROUP)"}' | jq .; \
		echo "✅ User $(USER_NAME) created/updated"; \
	fi

# Show user details via REST API (cloud-agnostic)
# Usage: make rs-show-user ENV=stage ORG=myorg USER_NAME=user@example.com
#        Optional: ADMIN_USER=admin@myorg.com ADMIN_PASSWORD='AdminPass!'
#        Defaults: ADMIN_USER=testadmin@example.com ADMIN_PASSWORD=TestAdmin123!
rs-show-user:
	@if [ -z "$(ORG)" ] || [ -z "$(ENV)" ] || [ -z "$(USER_NAME)" ]; then \
		echo "❌ ENV, ORG, and USER_NAME required."; \
		echo "Usage: make rs-show-user ENV=stage ORG=myorg USER_NAME=user@example.com"; \
		echo "Optional: ADMIN_USER=admin@myorg.com ADMIN_PASSWORD='AdminPass!' (defaults to testadmin)"; \
		exit 1; \
	fi
	$(eval ADMIN_USER := $(if $(ADMIN_USER),$(ADMIN_USER),testadmin@example.com))
	$(eval ADMIN_PASSWORD := $(if $(ADMIN_PASSWORD),$(ADMIN_PASSWORD),TestAdmin123!))
	$(eval AWS_REGION := $(shell $(GET_AWS_REGION)))
	$(eval STACK_NAME := $(shell $(GET_RS_STACK_NAME)))
	$(eval API_ENDPOINT := $(shell $(GET_RS_API_ENDPOINT)))
	@echo "👤 Fetching user details for $(USER_NAME)..."
	@# Get admin token using Cognito script
	@TOKEN=$$(infra/scripts/cognito-user-manager.sh get-token --env $(ENV) --org $(ORG) --user $(ADMIN_USER) --password '$(ADMIN_PASSWORD)' --region $(AWS_REGION)); \
	if [ -z "$$TOKEN" ]; then \
		echo "❌ Authentication failed for $(ADMIN_USER)"; \
		exit 1; \
	fi; \
	USERNAME_ENCODED=$$(echo "$(USER_NAME)" | sed 's/@/%40/g'); \
	curl --http1.1 -s -X GET "$(API_ENDPOINT)/api/v1/user-management/users/$$USERNAME_ENCODED" \
		-H "Authorization: Bearer $$TOKEN" | jq .

# Set user password via REST API (cloud-agnostic)
# Usage: make rs-set-password ENV=stage ORG=myorg USER_NAME=user@example.com PASSWORD='NewPass123!'
#          [ADMIN_USER=testadmin@example.com ADMIN_PASSWORD='TestAdmin123!']
rs-set-password:
	@if [ -z "$(ORG)" ] || [ -z "$(ENV)" ] || [ -z "$(USER_NAME)" ] || [ -z "$(PASSWORD)" ] || [ -z "$(ADMIN_USER)" ] || [ -z "$(ADMIN_PASSWORD)" ]; then \
		echo "❌ ENV, ORG, USER_NAME, PASSWORD, ADMIN_USER, and ADMIN_PASSWORD required."; \
		echo "Usage: make rs-set-password ENV=stage ORG=myorg USER_NAME=user@example.com PASSWORD='NewPass123!' ADMIN_USER=admin@myorg.com ADMIN_PASSWORD='AdminPass123!'"; \
		exit 1; \
	fi
	$(eval AWS_REGION := $(shell $(GET_AWS_REGION)))
	$(eval STACK_NAME := $(shell $(GET_RS_STACK_NAME)))
	$(eval API_ENDPOINT := $(shell $(GET_RS_API_ENDPOINT)))
	$(eval ADMIN_USER := $(if $(ADMIN_USER),$(ADMIN_USER),testadmin@example.com))
	$(eval ADMIN_PASSWORD := $(if $(ADMIN_PASSWORD),$(ADMIN_PASSWORD),TestAdmin123!))
	@echo "🔑 Setting password for $(USER_NAME)..."
	@# Get admin token using Cognito script
	@TOKEN=$$(infra/scripts/cognito-user-manager.sh get-token --env $(ENV) --org $(ORG) --user $(ADMIN_USER) --password '$(ADMIN_PASSWORD)' --region $(AWS_REGION)); \
	if [ -z "$$TOKEN" ]; then \
		echo "❌ Authentication failed for $(ADMIN_USER)"; \
		exit 1; \
	fi; \
	USERNAME_ENCODED=$$(echo "$(USER_NAME)" | sed 's/@/%40/g'); \
	curl --http1.1 -s -X PUT "$(API_ENDPOINT)/api/v1/user-management/users/$$USERNAME_ENCODED/password" \
		-H "Authorization: Bearer $$TOKEN" \
		-H "Content-Type: application/json" \
		-d '{"password":"$(PASSWORD)"}' | jq .; \
	echo "✅ Password updated for $(USER_NAME)"

# Set user group via REST API (cloud-agnostic)
# Usage: make rs-set-group ENV=stage ORG=myorg USER_NAME=user@example.com GROUP=LAB_MANAGERS
#        Optional: ADMIN_USER=admin@myorg.com ADMIN_PASSWORD='AdminPass!'
#        Defaults: ADMIN_USER=testadmin@example.com ADMIN_PASSWORD=TestAdmin123!
rs-set-group:
	@if [ -z "$(ORG)" ] || [ -z "$(ENV)" ] || [ -z "$(USER_NAME)" ] || [ -z "$(GROUP)" ]; then \
		echo "❌ ENV, ORG, USER_NAME, and GROUP required."; \
		echo "Usage: make rs-set-group ENV=stage ORG=myorg USER_NAME=user@example.com GROUP=LAB_MANAGERS"; \
		echo "Optional: ADMIN_USER=admin@myorg.com ADMIN_PASSWORD='AdminPass!' (defaults to testadmin)"; \
		exit 1; \
	fi
	$(eval ADMIN_USER := $(if $(ADMIN_USER),$(ADMIN_USER),testadmin@example.com))
	$(eval ADMIN_PASSWORD := $(if $(ADMIN_PASSWORD),$(ADMIN_PASSWORD),TestAdmin123!))
	$(eval AWS_REGION := $(shell $(GET_AWS_REGION)))
	$(eval STACK_NAME := $(shell $(GET_RS_STACK_NAME)))
	$(eval API_ENDPOINT := $(shell $(GET_RS_API_ENDPOINT)))
	@echo "👥 Setting group for $(USER_NAME) to $(GROUP)..."
	@# Get admin token using Cognito script
	@TOKEN=$$(infra/scripts/cognito-user-manager.sh get-token --env $(ENV) --org $(ORG) --user $(ADMIN_USER) --password '$(ADMIN_PASSWORD)' --region $(AWS_REGION)); \
	if [ -z "$$TOKEN" ]; then \
		echo "❌ Authentication failed for $(ADMIN_USER)"; \
		exit 1; \
	fi; \
	USERNAME_ENCODED=$$(echo "$(USER_NAME)" | sed 's/@/%40/g'); \
	curl --http1.1 -s -X PUT "$(API_ENDPOINT)/api/v1/user-management/users/$$USERNAME_ENCODED/group" \
		-H "Authorization: Bearer $$TOKEN" \
		-H "Content-Type: application/json" \
		-d '{"group":"$(GROUP)"}' | jq .; \
	echo "✅ Group updated for $(USER_NAME)"

# List available groups via REST API (cloud-agnostic)
# Usage: make rs-list-groups ENV=stage ORG=myorg
rs-list-groups:
	@if [ -z "$(ORG)" ] || [ -z "$(ENV)" ]; then \
		echo "❌ ENV and ORG required."; \
		echo "Usage: make rs-list-groups ENV=stage ORG=myorg"; \
		exit 1; \
	fi
	$(eval AWS_REGION := $(shell $(GET_AWS_REGION)))
	$(eval STACK_NAME := $(shell $(GET_RS_STACK_NAME)))
	$(eval API_ENDPOINT := $(shell $(GET_RS_API_ENDPOINT)))
	@echo "📋 Fetching available groups..."
	@# Get admin token using Cognito script
	@TOKEN=$$(infra/scripts/cognito-user-manager.sh get-token --env $(ENV) --org $(ORG) --user testadmin@example.com --password 'TestAdmin123!' --region $(AWS_REGION)); \
	if [ -z "$$TOKEN" ]; then \
		echo "❌ Authentication failed for testadmin@example.com"; \
		exit 1; \
	fi; \
	RESPONSE=$$(curl --http1.1 -s -X GET "$(API_ENDPOINT)/api/v1/user-management/groups" \
		-H "Authorization: Bearer $$TOKEN"); \
	if echo "$$RESPONSE" | jq -e . > /dev/null 2>&1; then \
		if echo "$$RESPONSE" | jq -e 'type == "array"' > /dev/null 2>&1; then \
			echo "$$RESPONSE" | jq -r '.[] | "\(.name) - \(.description)\n  Permissions: \(.permissions | join(", "))\n"'; \
		else \
			echo "❌ API Error:"; \
			echo "$$RESPONSE" | jq .; \
			exit 1; \
		fi; \
	else \
		echo "❌ Invalid response from API:"; \
		echo "$$RESPONSE"; \
		exit 1; \
	fi

# Create test users via REST API (auto-bootstraps admin if using defaults)
# Usage:
#   make rs-create-test-users ENV=stage ORG=myorg
#   make rs-create-test-users ENV=stage ORG=myorg ADMIN_USER=admin@myorg.com ADMIN_PASSWORD='MyPass!'
#
# Defaults to testadmin@example.com (auto-creates via AWS CLI if needed)
# Override ADMIN_USER/ADMIN_PASSWORD to use your existing admin
#
# Security model:
#   - API endpoint requires manage:users permission (secured)
#   - Makefile can bootstrap admin via AWS CLI (uses AWS credentials)
#   - Then authenticates as admin to call secured API
rs-create-test-users:
	@if [ -z "$(ORG)" ] || [ -z "$(ENV)" ]; then \
		echo "❌ ENV and ORG required. Usage: make rs-create-test-users ENV=stage ORG=myorg"; \
		exit 1; \
	fi
	$(eval ADMIN_USER := $(if $(ADMIN_USER),$(ADMIN_USER),testadmin@example.com))
	$(eval ADMIN_PASSWORD := $(if $(ADMIN_PASSWORD),$(ADMIN_PASSWORD),TestAdmin123!))	@echo "🧪 Setting up test users for $(ENV)/$(ORG)..."
	$(eval AWS_REGION := $(shell $(GET_AWS_REGION)))
	$(eval STACK_NAME := $(shell $(GET_RS_STACK_NAME)))
	$(eval API_ENDPOINT := $(shell $(GET_RS_API_ENDPOINT)))
	@if [ -z "$(API_ENDPOINT)" ] || [ "$(API_ENDPOINT)" = "None" ]; then \
		echo "❌ Could not find API endpoint. Deploy first with: make rs-deploy"; \
		exit 1; \
	fi
	@echo "Step 1: Ensuring admin user exists (create if needed)..."
	@$(MAKE) cognito-add-user ENV=$(ENV) ORG=$(ORG) \
		USER_NAME=$(ADMIN_USER) \
		PASSWORD='$(ADMIN_PASSWORD)' \
		GROUP=ADMINS > /dev/null 2>&1 || true
	@echo "⏳ Waiting for Cognito group membership to propagate..."
	@sleep 8
	@# Verify admin has ADMINS group (critical for manage:users permission)
	@USER_GROUPS=$$(infra/scripts/cognito-user-manager.sh show-user --env $(ENV) --org $(ORG) --user $(ADMIN_USER) --region $(AWS_REGION) 2>/dev/null | jq -r '.Groups[]?' 2>/dev/null || echo ""); \
	if [ -z "$$USER_GROUPS" ] || ! echo "$$USER_GROUPS" | grep -q "ADMINS"; then \
		echo "⚠️  Admin user missing ADMINS group, adding now..."; \
		$(MAKE) rs-set-group ENV=$(ENV) ORG=$(ORG) USER_NAME=$(ADMIN_USER) GROUP=ADMINS > /dev/null 2>&1 || true; \
		sleep 5; \
	fi
	@echo "✅ Admin user $(ADMIN_USER) verified in ADMINS group."
	@echo "Step 2: Authenticating as admin..."; \
	echo "Getting authentication token..."; \
	TOKEN=$$(infra/scripts/cognito-user-manager.sh get-token --env $(ENV) --org $(ORG) --user $(ADMIN_USER) --password '$(ADMIN_PASSWORD)' --region $(AWS_REGION)); \
	if [ -z "$$TOKEN" ]; then \
		echo "❌ Authentication failed for $(ADMIN_USER)."; \
		echo ""; \
		echo "Response: $$TOKEN"; \
		echo ""; \
		echo "💡 Troubleshooting:"; \
		echo "   1. Verify admin exists: make cognito-show-user ENV=$(ENV) ORG=$(ORG) USER_NAME=$(ADMIN_USER)"; \
		echo "   2. Check pool: make show-rs-user-pool ENV=$(ENV) ORG=$(ORG)"; \
		exit 1; \
	fi; \
	echo "✅ Authenticated successfully for $(ADMIN_USER)"; \
	echo "Step 3: Creating remaining test users via secured API..."; \
	echo "   API Endpoint: $(API_ENDPOINT)/api/v1/user-management/test-users"; \
	echo "   Token length: $$(echo $$TOKEN | wc -c) chars"; \
	echo "   Calling API..."; \
	HTTP_RESPONSE=$$(curl -s -w "\n%{http_code}" -X POST "$(API_ENDPOINT)/api/v1/user-management/test-users" \
		-H "Authorization: Bearer $$TOKEN" \
		-H "Content-Type: application/json" 2>&1); \
	CURL_EXIT=$$?; \
	HTTP_CODE=$$(echo "$$HTTP_RESPONSE" | tail -n1); \
	RESPONSE_BODY=$$(echo "$$HTTP_RESPONSE" | sed '$$d'); \
	if [ $$CURL_EXIT -ne 0 ]; then \
		echo "❌ Curl command failed (exit code $$CURL_EXIT)"; \
		echo "   Response captured: $$(echo "$$HTTP_RESPONSE" | wc -c) bytes"; \
		echo ""; \
		echo "Retrying with verbose output for debugging..."; \
		curl -v -X POST "$(API_ENDPOINT)/api/v1/user-management/test-users" \
			-H "Authorization: Bearer $$TOKEN" \
			-H "Content-Type: application/json" 2>&1 | head -50; \
		echo ""; \
		echo "💡 Troubleshooting:"; \
		echo "   1. Check API is deployed: make show-rs-endpoint ENV=$(ENV) ORG=$(ORG)"; \
		echo "   2. Test health: curl $(API_ENDPOINT)/health"; \
		echo "   3. Check Lambda logs: make rs-watch-log ENV=$(ENV) ORG=$(ORG)"; \
		exit 1; \
	fi; \
	if [ "$$HTTP_CODE" != "200" ] && [ "$$HTTP_CODE" != "000" ]; then \
		echo "❌ API Error (HTTP $$HTTP_CODE)"; \
		echo "   Response:"; \
		echo "$$RESPONSE_BODY" | jq . 2>/dev/null || echo "$$RESPONSE_BODY"; \
		echo ""; \
		echo "💡 Check Lambda logs for details: make rs-watch-log ENV=$(ENV) ORG=$(ORG)"; \
		exit 1; \
	elif [ "$$HTTP_CODE" = "000" ]; then \
		echo "❌ No HTTP response received (connection/timeout issue)"; \
		echo "   Response body: $$RESPONSE_BODY"; \
		echo ""; \
		echo "💡 This usually means Lambda timeout or API Gateway issue"; \
		echo "   Check Lambda logs: make rs-watch-log ENV=$(ENV) ORG=$(ORG)"; \
		exit 1; \
	fi; \
	echo ""; \
	echo "✅ Test users created!"; \
	echo ""; \
	echo "📋 Test user credentials:"; \
	echo "   $(ADMIN_USER) / $(ADMIN_PASSWORD) [ADMINS]"; \
	echo "   testresearcher@example.com / TestResearch123! [RESEARCHERS]"; \
	echo "   testclinician@example.com / TestClinic123! [CLINICIANS]"

# List test users with credentials
# Usage: make rs-list-test-users ENV=stage ORG=myorg [AMIN_USER=admin@myorg.com ADMIN_PASSWORD='MayPass!']
rs-list-test-users:
	@if [ -z "$(ORG)" ] || [ -z "$(ENV)" ]; then \
		echo "❌ ENV and ORG required. Usage: make rs-list-test-users ENV=stage ORG=myorg"; \
		exit 1; \
	fi
	$(eval ADMIN_USER := $(if $(ADMIN_USER),$(ADMIN_USER),testadmin@example.com))
	$(eval ADMIN_PASSWORD := $(if $(ADMIN_PASSWORD),$(ADMIN_PASSWORD),TestAdmin123!))
	$(eval AWS_REGION := $(shell $(GET_AWS_REGION)))
	$(eval STACK_NAME := $(shell $(GET_RS_STACK_NAME)))
	$(eval API_ENDPOINT := $(shell $(GET_RS_API_ENDPOINT)))
	@echo "🧪 Test users for $(ENV)/$(ORG)..."
	@# Get admin token using Cognito script
	@TOKEN=$$(infra/scripts/cognito-user-manager.sh get-token --env $(ENV) --org $(ORG) --user $(ADMIN_USER) --password '$(ADMIN_PASSWORD)' --region $(AWS_REGION)); \
	if [ -z "$$TOKEN" ]; then \
		echo "❌ Authentication failed for $(ADMIN_USER)"; \
		exit 1; \
	fi; \
	curl -s -X GET "$(API_ENDPOINT)/api/v1/user-management/test-users" \
		-H "Authorization: Bearer $$TOKEN" | jq -r '.[] | "  \(.username) / \(.password) [\(.group)] - \(.status)"'

# Remove all test users
# Usage: make rs-remove-test-users ENV=stage ORG=myorg
rs-remove-test-users:
	@if [ -z "$(ORG)" ] || [ -z "$(ENV)" ]; then \
		echo "❌ ENV and ORG required. Usage: make rs-remove-test-users ENV=stage ORG=myorg"; \
		exit 1; \
	fi
	@echo "🗑️  Removing test users from $(ENV)/$(ORG)..."
	$(eval AWS_REGION := $(shell $(GET_AWS_REGION)))
	$(eval API_ENDPOINT := $(shell $(GET_RS_API_ENDPOINT)))
	@# Get admin token using Cognito script
	@TOKEN=$$(infra/scripts/cognito-user-manager.sh get-token --env $(ENV) --org $(ORG) --user testadmin@example.com --password 'TestAdmin123!' --region $(AWS_REGION)); \
	if [ -z "$$TOKEN" ]; then \
		echo "❌ Authentication failed for testadmin@example.com"; \
		exit 1; \
	fi; \
	curl -s -X DELETE "$(API_ENDPOINT)/api/v1/user-management/test-users" \
		-H "Authorization: Bearer $$TOKEN" | jq .; \
	echo "✅ Test users removed"

# Secure production environment (remove test users, reset admin password)
# Usage: make rs-secure-prod ENV=prod ORG=myorg
# WARNING: This will generate a new random admin password!
rs-secure-prod:
	@if [ -z "$(ORG)" ] || [ -z "$(ENV)" ]; then \
		echo "❌ ENV and ORG required. Usage: make rs-secure-prod ENV=prod ORG=myorg"; \
		exit 1; \
	fi
	@if [ "$(ENV)" != "prod" ] && [ "$(ENV)" != "stage" ]; then \
		echo "❌ rs-secure-prod only for stage/prod environments"; \
		exit 1; \
	fi
	@echo "🔐 Securing $(ENV)/$(ORG) environment..."
	@echo "⚠️  This will:"
	@echo "   1. Remove all test users"
	@echo "   2. Reset admin password to random value"
	@echo ""
	@echo "Press Ctrl+C to cancel, or wait 5 seconds to continue..."
	@sleep 5
	$(eval AWS_REGION := $(shell $(GET_AWS_REGION)))
	$(eval API_ENDPOINT := $(shell $(GET_RS_API_ENDPOINT)))
	@# Get admin token using Cognito script
	@TOKEN=$$(infra/scripts/cognito-user-manager.sh get-token --env $(ENV) --org $(ORG) --user testadmin@example.com --password 'TestAdmin123!' --region $(AWS_REGION)); \
	if [ -z "$$TOKEN" ]; then \
		echo "❌ Authentication failed for testadmin@example.com"; \
		exit 1; \
	fi; \
	echo ""; \
	echo "🔒 IMPORTANT: Save the new admin passwords below!"; \
	echo "================================================"; \
	curl -s -X POST "$(API_ENDPOINT)/api/v1/user-management/secure-production" \
		-H "Authorization: Bearer $$TOKEN" | jq -r '.admin_passwords_reset | to_entries[] | "\(.key): \(.value)"'; \
	echo "================================================"; \
	echo "⚠️  SAVE THESE PASSWORDS - They cannot be recovered!"

get-rs-token:
	@if [ -z $(ENV) ]; then \
		echo "Error: ENV parameter required. Usage: make get-rs-token ENV=stage ORG=myorg USER_NAME=username PASSWORD=password"; \
		exit 1; \
	fi
	@if [ -z $(ORG) ]; then \
		echo "Error: ORG parameter required. Usage: make get-rs-token ENV=stage ORG=myorg USER_NAME=username PASSWORD=password"; \
		exit 1; \
	fi
	@if [ -z $(USER_NAME) ]; then \
		echo "Error: USER_NAME parameter required. Usage: make get-rs-token ENV=stage ORG=myorg USER_NAME=username PASSWORD=password"; \
		exit 1; \
	fi
	@if [ -z $(PASSWORD) ]; then \
		echo "Error: PASSWORD parameter required. Usage: make get-rs-token ENV=stage ORG=myorg USER_NAME=username PASSWORD=password"; \
		exit 1; \
	fi
	$(eval AWS_REGION := $(shell $(GET_AWS_REGION)))
	$(eval STACK_NAME := $(shell $(GET_RS_STACK_NAME)))
	$(eval USER_POOL := $(shell $(GET_RS_USER_POOL_NAME)))
	$(eval CLIENT_ID := $(shell $(GET_RS_USER_POOL_CLIENT_ID)))
	$(eval JWT := $(shell $(GET_RS_TOKEN)))
	@echo "$(JWT)"

# Query runtime auth config from deployed Lambda
# This shows what auth configuration the Lambda is actually using
# (environment variables take precedence over config file)
# Usage: make rs-show-runtime-config ENV=stage ORG=myorg
rs-show-runtime-config:
	@if [ -z "$(ENV)" ] || [ -z "$(ORG)" ]; then \
		echo "❌ ENV and ORG required. Usage: make rs-show-runtime-config ENV=stage ORG=myorg"; \
		exit 1; \
	fi
	$(eval AWS_REGION := $(shell $(GET_AWS_REGION)))
	$(eval API_ENDPOINT := $(shell $(GET_RS_API_ENDPOINT)))
	@echo "🔍 Querying runtime config from deployed Lambda..."
	@echo "   API: $(API_ENDPOINT)/api/config/runtime"
	@echo ""
	@curl -s "$(API_ENDPOINT)/api/config/runtime" | jq . || \
		(echo "❌ Failed to query runtime config" && exit 1)
	@echo ""
	@echo "💡 This shows the actual auth config the Lambda is using."
	@echo "   'source: environment' = from CloudFormation env vars (correct)"
	@echo "   'source: config_file' = from baked-in config (may be stale)"


test-jwt-local:
	@if [ -z "$(ORG)" ]; then echo "Error: ORG parameter required. Usage: make test-jwt-local ENV=stage ORG=pwb"; exit 1; fi
	@echo "Testing JWT for $(ORG) locally..."
	@TEST_USER=$${$(shell echo $(ORG) | tr '[:lower:]' '[:upper:]')_TEST_USER}; \
	TEST_PASS=$${$(shell echo $(ORG) | tr '[:lower:]' '[:upper:]')_TEST_PASSWORD}; \
	if [ -z "$$TEST_USER" ] || [ -z "$$TEST_PASS" ]; then \
		echo "Set test credentials: export $(shell echo $(ORG) | tr '[:lower:]' '[:upper:]')_TEST_USER=<username>"; \
		echo "                      export $(shell echo $(ORG) | tr '[:lower:]' '[:upper:]')_TEST_PASSWORD=<password>"; \
		exit 1; \
	fi; \
	python backend/test_jwt_local.py --org $(ORG) --get-token --username $$TEST_USER --password $$TEST_PASS

test-jwt-aws:
	$(eval AWS_REGION := $(shell $(GET_AWS_REGION)))
	@if [ -z "$(ORG)" ]; then echo "Error: ORG parameter required. Usage: make test-jwt-aws ENV=stage ORG=pwb"; exit 1; fi
	@echo "Testing JWT for $(ORG) on AWS..."
	@API_ID=$$(aws apigateway get-rest-apis --query "items[?name=='rawscribe-$(ENV)-$(ORG)-api'].id | [0]" --output text --region $$AWS_REGION); \
	if [ -z "$$API_ID" ] || [ "$$API_ID" = "None" ]; then \
		echo "API Gateway not found for rawscribe-$(ENV)-$(ORG)-api"; \
		exit 1; \
	fi; \
	API_URL="https://$$API_ID.execute-api.$$AWS_REGION.amazonaws.com/$(ENV)"; \
	echo "Found API Gateway: $$API_URL"; \
	TEST_USER=$${$(shell echo $(ORG) | tr '[:lower:]' '[:upper:]')_TEST_USER}; \
	TEST_PASS=$${$(shell echo $(ORG) | tr '[:lower:]' '[:upper:]')_TEST_PASSWORD}; \
	if [ -z "$$TEST_USER" ] || [ -z "$$TEST_PASS" ]; then \
		echo "Set test credentials: export $(shell echo $(ORG) | tr '[:lower:]' '[:upper:]')_TEST_USER=<username>"; \
		echo "                      export $(shell echo $(ORG) | tr '[:lower:]' '[:upper:]')_TEST_PASSWORD=<password>"; \
		exit 1; \
	fi; \
	POOL_ID=$$(aws cognito-idp list-user-pools --max-results 60 --query "UserPools[?contains(Name,'rawscribe-$(ENV)-$(ORG)')].Id | [0]" --output text --region $$AWS_REGION); \
	if [ -z "$$POOL_ID" ] || [ "$$POOL_ID" = "None" ]; then \
		echo "User Pool not found for rawscribe-$(ENV)-$(ORG)"; \
		exit 1; \
	fi; \
	CLIENT_ID=$$(aws cognito-idp list-user-pool-clients --user-pool-id $$POOL_ID --query "UserPoolClients[0].ClientId" --output text --region $$AWS_REGION); \
	JWT=$$(aws cognito-idp admin-initiate-auth --user-pool-id $$POOL_ID --client-id $$CLIENT_ID --auth-flow ADMIN_USER_PASSWORD_AUTH --auth-parameters USERNAME=$$TEST_USER,PASSWORD=$$TEST_PASS --region $$AWS_REGION --query 'AuthenticationResult.IdToken' --output text); \
	echo "Testing protected endpoint..."; \
	curl -s -H "Authorization: Bearer $$JWT" $$API_URL/api/config/private | jq '.lambda.auth.cognito'

test-jwt-regression:
	@echo "Running JWT authentication regression tests..."
	@cd backend && python -m pytest test_jwt_regression.py -v --tb=short || python test_jwt_regression.py -v

test-jwt-regression-local:
	@echo "Running JWT authentication regression tests (local only)..."
	@cd backend && python -m pytest test_jwt_regression.py -v --tb=short -k "not aws" || python test_jwt_regression.py --skip-aws -v

