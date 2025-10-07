<!-- 
SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
SPDX-FileContributor: Kimberly Robasky
SPDX-License-Identifier: Apache-2.0
 -->

# Local Development Environment Setup

This guide provides step-by-step instructions for setting up a complete SYNDI development environment from scratch. Essential for new developers, contributors, or when setting up isolated development environments.

## Prerequisites

Before starting, ensure you have:
- **Conda** (Miniconda or Anaconda) - Python environment management
- **Node.js** (v18 or later) - Frontend development
- **Git** - Version control
- **AWS CLI** (optional) - For deployment and testing
- **jq** (optional) - JSON processing for scripts

## Quick Start

### 1. Clone the Repository

```bash
git clone <repository-url>
cd 2CLAIRE
```

### 2. Create the Syndi Environment

The project includes a pre-configured conda environment file matching AWS Lambda runtime (Python 3.9):

```bash
# Create syndi environment from configuration
conda env create -f environment.yml

# Activate the environment
conda activate syndi
```

### 3. Verify Installation

```bash
# Check Python version (should be 3.9.x)
python --version

# Verify key dependencies
python -c "import fastapi, pydantic, boto3; print('✅ Dependencies OK')"
```

### 4. Install Frontend Dependencies

```bash
# Install Node.js packages
cd frontend
npm install

# Install Playwright browsers for E2E testing
npx playwright install

cd ..
```

### 5. Setup Local Environment

```bash
# Create local directories and deploy configs
make setup-local ENV=dev ORG=myorg
```

This creates:
```
.local/s3/                    # Simulated S3 buckets
├── forms/                    # SOP forms and templates
├── eln/                      # ELN submissions
├── eln-drafts/              # Draft submissions
├── public/                   # Public assets
├── webapp/                   # Built frontend (after build)
└── lambda/                   # Packaged Lambda (after build)
```

### 6. Start Development Servers

```bash
# Start both backend and frontend with hot reload
make start-dev ENV=dev ORG=myorg
```

**URLs:**
- Frontend: `http://localhost:3000` (or `http://localhost:5173`)
- Backend: `http://localhost:8000`
- API Docs: `http://localhost:8000/docs`

## Python Environments

### syndi Environment (Python 3.9)

The `syndi` environment matches AWS Lambda runtime:

- **Python Version**: 3.9.x (exactly matches AWS Lambda)
- **Key Dependencies**: FastAPI, Pydantic, Boto3, Mangum
- **Purpose**: Production simulation and Lambda deployment
- **Required for**: `serve-lambda` command

**When to use syndi:**
```bash
conda activate syndi
make serve-lambda ENV=dev ORG=myorg
```

### claire Environment (Python 3.11)

Alternative environment for general development:

- **Python Version**: 3.11+ (latest features)
- **Purpose**: General development with newer Python features
- **Optional**: Not required for SYNDI development

**When to use claire:**
```bash
conda activate claire
make start-backend ENV=dev ORG=myorg
```

**Note:** Per AGENTS.md, use `syndi` for `serve-lambda` (production simulation) and `claire` for development.

### Switching Environments

```bash
# Switch to syndi (Python 3.9 - Lambda compatible)
conda activate syndi

# Switch to claire (Python 3.11 - General development)
conda activate claire

# Check current environment
conda env list

# Deactivate
conda deactivate
```

## Environment Configuration

### Environment Variables

The project uses environment-based configuration:

- **`ENV`**: Environment identifier
  - `dev` - Local development
  - `test` - Automated testing
  - `stage` - Staging/pre-production
  - `prod` - Production

- **`ORG`**: Organization identifier
  - Required for all commands (no default for security)
  - Examples: `myorg`, `uga`, `pwb`
  - Used in resource naming and config selection

### Configuration Files

After `make setup-local`, you'll have:

```
backend/rawscribe/.config/config.json  # Merged Lambda config
frontend/public/config.json            # Merged webapp config
```

These are generated from:
```
infra/.config/lambda/dev.json          # Base Lambda config
infra/.config/lambda/dev-myorg.json    # Org-specific overrides
infra/.config/webapp/dev.json          # Base webapp config  
infra/.config/webapp/dev-myorg.json    # Org-specific overrides
```

See [Configuration System](../architecture/configuration-system.md) for details.

## Updating Dependencies

### Backend Dependencies

```bash
# Add package to requirements.txt
echo "pandas==2.0.0" >> backend/layers/dependencies/requirements.txt

# Reinstall in conda environment
conda activate syndi
pip install -r backend/layers/dependencies/requirements.txt
```

### Frontend Dependencies

```bash
# Add package
cd frontend
npm install <package-name>

# Or edit package.json and run
npm install
```

### Update Environment

If `environment.yml` changes:

```bash
# Update syndi environment
conda activate syndi
conda env update -f environment.yml --prune

# Or recreate from scratch
conda deactivate
conda env remove -n syndi
conda env create -f environment.yml
```

## Development Workflow

### Daily Development

```bash
# 1. Activate environment
conda activate syndi  # or claire

# 2. Pull latest changes
git pull

# 3. Update dependencies if needed
cd frontend && npm install
conda env update -f environment.yml --prune

# 4. Start development servers
make start-dev ENV=dev ORG=myorg

# 5. Make changes (auto-reload handles updates)
# 6. Test changes
make test-all

# 7. Commit
git add .
git commit -m "Your changes"
git push
```

### Production Simulation

Test packaged code locally before AWS deployment:

```bash
# Must use syndi environment (Python 3.9)
conda activate syndi

# Build and serve Lambda
make serve-lambda ENV=dev ORG=myorg

# In another terminal, serve frontend
make serve-webapp ENV=dev ORG=myorg
```

## Troubleshooting

### Import Errors After Environment Switch

**Symptom:** `ModuleNotFoundError` after switching environments

**Solution:**
```bash
# Clean and rebuild backend
make clean-backend
conda activate syndi
make build-backend ENV=dev ORG=myorg
```

### Missing Dependencies

**Symptom:** Import errors for specific packages

**Solution:**
```bash
# Reinstall from requirements
conda activate syndi
pip install -r backend/layers/dependencies/requirements.txt

# Or reinstall specific package
pip install <package-name>
```

### Environment Verification

**Check which Python is being used:**
```bash
which python
which pip
# Should point to syndi environment paths
# Example: /home/user/miniconda3/envs/syndi/bin/python
```

### Wrong Environment Active

**Symptom:** Code runs but uses wrong Python version

**Solution:**
```bash
# Check active environment
conda env list
# Active environment has * marker

# Activate correct one
conda activate syndi
```

### Port Already in Use

**Symptom:** "Address already in use" on port 8000 or 3000

**Solution:**
```bash
# Stop all servers
make stop-all

# Or manually
pkill -f "uvicorn.*rawscribe"
pkill -f "vite"

# Check what's using ports
lsof -i :8000  # Backend
lsof -i :3000  # Frontend
lsof -i :5173  # Vite alternate port
```

### Configuration Not Loading

**Symptom:** "Config file not found" errors

**Solution:**
```bash
# Redeploy configuration
make clean-config
make config ENV=dev ORG=myorg

# Verify configs exist
ls -la backend/rawscribe/.config/config.json
ls -la frontend/public/config.json
```

### Playwright Browser Issues

**Symptom:** E2E tests fail with browser errors

**Solution:**
```bash
# Reinstall Playwright browsers
cd frontend
npx playwright install

# Install system dependencies (Linux)
npx playwright install-deps
```

## Project Structure

Understanding the project layout:

```
2CLAIRE/
├── backend/                  # Python backend
│   ├── rawscribe/           # Lambda application code
│   │   ├── main.py         # Lambda handler
│   │   ├── routes/         # API endpoints
│   │   ├── utils/          # Utilities (auth, config, etc.)
│   │   └── .config/        # Generated config (not in git)
│   ├── layers/             # Lambda layers
│   │   └── dependencies/   # Python dependencies
│   ├── tests/              # Backend tests
│   └── .build/             # Build artifacts (not in git)
├── frontend/                # React frontend
│   ├── src/                # Source code
│   │   ├── components/     # React components
│   │   ├── pages/          # Page components
│   │   └── shared/         # Shared utilities
│   ├── public/             # Static assets
│   │   └── config.json     # Generated config (not in git)
│   ├── tests/              # Frontend tests
│   └── dist/               # Build output (not in git)
├── infra/                  # Infrastructure
│   ├── .config/            # Configs (not in git)
│   │   ├── lambda/         # Backend configs
│   │   └── webapp/         # Frontend configs
│   ├── example-.config/    # Config templates (in git)
│   └── scripts/            # Deployment scripts
├── .local/                 # Local "S3" storage (not in git)
├── .aws-sam-*/             # SAM build dirs (not in git)
├── template.yaml           # SAM/CloudFormation template
├── Makefile                # Build automation
└── environment.yml         # Conda environment spec
```

## Next Steps

After completing local setup:

1. **Read**: [Local Development Workflow](local-development.md) - Daily development tasks
2. **Read**: [Testing Guide](testing.md) - How to test your changes
3. **Try**: [Configuration System](../architecture/configuration-system.md) - Understanding configs
4. **Deploy**: [Makefile Deployment](../deployment/makefile-deployment.md) - Deploy to AWS

## Related Documentation

- [Local Development Workflow](local-development.md) - Daily development
- [Testing Guide](testing.md) - Testing procedures
- [Configuration System](../architecture/configuration-system.md) - Config management
- [Deployment Guide](../deployment/makefile-deployment.md) - AWS deployment
