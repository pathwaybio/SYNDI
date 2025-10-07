# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0

"""
Rawscribe (SYNDI Backend) - FastAPI Application Entry Point
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import logging
from contextlib import asynccontextmanager
from mangum import Mangum

# Local imports
import sys
import os

# Add current directory to Python path to ensure we import from local utils
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

from rawscribe.utils.config_loader import ConfigLoader
from rawscribe.utils.auth import AuthValidator

# Configure logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Configure config loader
config_loader = ConfigLoader()

# Load configuration once at startup
try:
    config = config_loader.load_config()
    lambda_config = config.get('lambda', {})
except Exception as e:
    logger.error(f"Failed to load configuration: {e}")
    lambda_config = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan with environment/provider enforcement"""
    logger.info("Starting CLAIRE backend...")
    
    # Use existing config_loader pattern
    from rawscribe.utils.config_loader import config_loader
    
    environment = config_loader.get_environment()
    is_aws_lambda = bool(os.environ.get('AWS_EXECUTION_ENV'))
    
    logger.info(f"Environment: {environment}, AWS Lambda: {is_aws_lambda}")
    
    try:
        # Load configuration
        auth_config = lambda_config.get('auth', {})
        provider = auth_config.get('provider', 'jwt')
        
        # CRITICAL: Enforce Cognito in AWS
        if is_aws_lambda:
            if provider != 'cognito':
                error_msg = (
                    f"SECURITY ERROR: AWS Lambda MUST use Cognito provider.\n"
                    f"Current provider: '{provider}'\n"
                    f"API Gateway Cognito Authorizer will reject non-Cognito tokens.\n"
                    f"Update config: provider: 'cognito'"
                )
                logger.critical(error_msg)
                raise RuntimeError(error_msg)
            logger.info("✅ AWS Lambda with Cognito - valid")
        
        # Enforce secure auth in stage/prod
        if environment in ['stage', 'prod']:
            if provider not in ['cognito', 'jwt']:
                raise RuntimeError(
                    f"Security error: {environment} requires cognito or jwt provider"
                )
            
            if provider == 'jwt':
                jwt_secret = auth_config.get('jwt', {}).get('secret', '')
                if jwt_secret in ['dev-secret', 'dev-secret-replace-with-strong-secret', '']:
                    raise RuntimeError(
                        "Production JWT requires secure secret. "
                        "Generate: openssl rand -base64 32"
                    )
                logger.warning(
                    f"⚠️  JWT provider in {environment}. "
                    f"Ensure this is self-hosted (not AWS with API Gateway)"
                )
        
        # Store config and config_loader in app state
        app.state.config = config
        app.state.config_loader = config_loader
        
        # Initialize auth validator
        auth_validator = AuthValidator({'lambda': {'auth': auth_config}})
        app.state.auth = auth_validator
        
        logger.info("CLAIRE backend started successfully")
        
    except Exception as e:
        logger.error(f"Startup failed: {e}")
        raise
    
    yield
    
    logger.info("Shutting down CLAIRE backend...")

# Create FastAPI application
app = FastAPI(
    title="Rawscribe API",
    description="Rawscribe API for Electronic Lab Notebook (ELN)",
    version="1.0.0",
    lifespan=lifespan
)

# Initialize app state for Lambda (where lifespan events don't run)
# This ensures state attributes are available even when lifespan="off"
app.state.config_loader = config_loader
app.state.config = lambda_config

# Configure CORS
cors_config = lambda_config.get('cors', {})
allow_origins = cors_config.get('allowedOrigins', [])
if not allow_origins:
    logger.warning("⚠️ CORS allowedOrigins not configured, using fallback defaults: ['http://localhost:3000', 'http://localhost:5173']")
    allow_origins = ["http://localhost:3000", "http://localhost:5173"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    """Health check endpoint"""
    return {"message": "CLAIRE API is running", "status": "healthy"}

@app.get("/health")
async def health_check():
    """Detailed health check"""
    try:
        config_loader = app.state.config_loader
        return {
            "status": "healthy",
            "service": "claire-api",
            "version": "1.0.0",
            "environment": config_loader.get_environment()
        }
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        raise HTTPException(status_code=503, detail="Service unhealthy")

# Import and include routers
from rawscribe.routes import drafts, eln, auth, sops, files, user_management, config as config_routes
app.include_router(drafts.router, prefix="/api/v1")
app.include_router(eln.router, prefix="/api/v1")
app.include_router(config_routes.router, prefix="/api")  # For /api/config/private
app.include_router(auth.router, prefix="/api")
app.include_router(sops.router, prefix="/api/v1")
app.include_router(files.router, prefix="/api/v1")
app.include_router(user_management.router, prefix="/api")  # Mounts at /api/v1/user-management/*

# Create Mangum handler for AWS Lambda (only for deployed environments)
# This handler is used when the app is deployed to AWS Lambda
# For local development, we use uvicorn directly
if config_loader.get_environment() in ['stage', 'prod']:
    handler = Mangum(app, lifespan="off")
else:
    # For local development, we don't need the Lambda handler
    # The handler variable is still created but won't be used
    handler = None

if __name__ == "__main__":
    import uvicorn
    
    # Get server config
    server_config = lambda_config.get('server', {})
    port = server_config.get('port')
    host = server_config.get('host')
    
    if not port:
        logger.warning("⚠️ Server port not configured, using fallback default: 8000")
        port = 8000
    
    if not host:
        logger.warning("⚠️ Server host not configured, using fallback default: 0.0.0.0")
        host = '0.0.0.0'
    
    uvicorn.run(app, host=host, port=port, reload=True) # Test change Sun Oct  5 03:42:44 PM EDT 2025
