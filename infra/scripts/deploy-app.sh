#!/bin/bash
# SPDX-FileCopyrightText: 2024-2025 Pathway Bio, Inc. <https://pwbio.ai>
# SPDX-FileContributor: Kimberly Robasky
# SPDX-License-Identifier: Apache-2.0


# CLAIRE Application Deployment Script
# Usage: ./deploy-app.sh <environment>
# Environments: stage, prod

set -e

ENV=${1:-dev}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

if [[ ! "$ENV" =~ ^(stage|prod)$ ]]; then
    echo "❌ Error: Invalid environment '$ENV'"
    echo "Usage: $0 <environment>"
    echo "Valid environments: stage, prod"
    exit 1
fi

echo "🚀 Deploying CLAIRE application to $ENV environment..."

# Load configuration
STACK_CONFIG="$PROJECT_ROOT/infra/.config/stack/$ENV.json"
if [[ ! -f "$STACK_CONFIG" ]]; then
    echo "❌ Error: Stack config not found: $STACK_CONFIG"
    exit 1
fi

# Extract stack configuration
STACK_NAME=$(cat "$STACK_CONFIG" | jq -r '.stackName // "claire-'$ENV'"')
REGION=$(cat "$STACK_CONFIG" | jq -r '.region // "us-east-1"')

echo "📋 Deployment Configuration:"
echo "  Environment: $ENV"
echo "  Stack Name: $STACK_NAME"
echo "  Region: $REGION"
echo ""

# Step 1: Deploy CloudFormation stack
echo "☁️ Deploying CloudFormation stack..."
if aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" >/dev/null 2>&1; then
    echo "📦 Updating existing stack: $STACK_NAME"
    aws cloudformation update-stack \
        --stack-name "$STACK_NAME" \
        --template-body file://"$PROJECT_ROOT/infra/cloudformation/claire-stack.yaml" \
        --parameters file://"$STACK_CONFIG" \
        --capabilities CAPABILITY_IAM \
        --region "$REGION"
else
    echo "📦 Creating new stack: $STACK_NAME"
    aws cloudformation create-stack \
        --stack-name "$STACK_NAME" \
        --template-body file://"$PROJECT_ROOT/infra/cloudformation/claire-stack.yaml" \
        --parameters file://"$STACK_CONFIG" \
        --capabilities CAPABILITY_IAM \
        --region "$REGION"
fi

echo "⏳ Waiting for stack deployment to complete..."
aws cloudformation wait stack-update-complete --stack-name "$STACK_NAME" --region "$REGION" || \
aws cloudformation wait stack-create-complete --stack-name "$STACK_NAME" --region "$REGION"

# Step 2: Get stack outputs
echo "📋 Retrieving stack outputs..."
STACK_OUTPUTS=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --query 'Stacks[0].Outputs' \
    --output json)

WEBAPP_BUCKET=$(echo "$STACK_OUTPUTS" | jq -r '.[] | select(.OutputKey=="WebappBucket") | .OutputValue')
LAMBDA_BUCKET=$(echo "$STACK_OUTPUTS" | jq -r '.[] | select(.OutputKey=="LambdaBucket") | .OutputValue')
FORMS_BUCKET=$(echo "$STACK_OUTPUTS" | jq -r '.[] | select(.OutputKey=="FormsBucket") | .OutputValue')
ELN_BUCKET=$(echo "$STACK_OUTPUTS" | jq -r '.[] | select(.OutputKey=="ELNBucket") | .OutputValue')
DRAFTS_BUCKET=$(echo "$STACK_OUTPUTS" | jq -r '.[] | select(.OutputKey=="DraftsBucket") | .OutputValue')

echo "📦 Deployed infrastructure:"
echo "  Webapp Bucket: $WEBAPP_BUCKET"
echo "  Lambda Bucket: $LAMBDA_BUCKET"
echo "  Forms Bucket: $FORMS_BUCKET"
echo "  ELN Bucket: $ELN_BUCKET"
echo "  ELN Drafts Bucket: $DRAFTS_BUCKET"
echo ""

# Step 3: Deploy frontend to S3
echo "🌐 Deploying frontend to S3..."
if [[ ! -d "$PROJECT_ROOT/frontend/dist" ]]; then
    	echo "❌ Error: Frontend build not found. Run 'make build-frontend ENV=$ENV' first."
        # 
    exit 1
fi

# Sync frontend files to webapp bucket
aws s3 sync "$PROJECT_ROOT/frontend/dist/" "s3://$WEBAPP_BUCKET/" \
    --region "$REGION" \
    --delete \
    --exclude "config.json"  # Config is deployed separately

echo "✅ Frontend deployed to s3://$WEBAPP_BUCKET/"

# Step 4: Deploy backend Lambda function
echo "🔧 Deploying backend Lambda function..."

# Create deployment package
LAMBDA_PACKAGE="$PROJECT_ROOT/backend/lambda-deployment.zip"
cd "$PROJECT_ROOT/backend"

# Clean up previous package
rm -f "$LAMBDA_PACKAGE"

# Create Lambda deployment package
echo "📦 Creating Lambda deployment package..."
zip -r "$LAMBDA_PACKAGE" rawscribe/ -x "rawscribe/__pycache__/*" "rawscribe/*/__pycache__/*"

# Add dependencies (if they exist)
if [[ -d "dependencies" ]]; then
    cd dependencies
    zip -r "$LAMBDA_PACKAGE" . -x "__pycache__/*" "*/__pycache__/*"
    cd ..
fi

# Upload Lambda package to S3
aws s3 cp "$LAMBDA_PACKAGE" "s3://$LAMBDA_BUCKET/lambda-deployment.zip" --region "$REGION"

# Update Lambda function code
LAMBDA_FUNCTION_NAME="claire-${ENV}-api"
if aws lambda get-function --function-name "$LAMBDA_FUNCTION_NAME" --region "$REGION" >/dev/null 2>&1; then
    echo "🔄 Updating Lambda function: $LAMBDA_FUNCTION_NAME"
    aws lambda update-function-code \
        --function-name "$LAMBDA_FUNCTION_NAME" \
        --s3-bucket "$LAMBDA_BUCKET" \
        --s3-key "lambda-deployment.zip" \
        --region "$REGION"
        
    # Wait for update to complete
    aws lambda wait function-updated --function-name "$LAMBDA_FUNCTION_NAME" --region "$REGION"
else
    echo "⚠️ Warning: Lambda function $LAMBDA_FUNCTION_NAME not found. It should be created by CloudFormation."
fi

echo "✅ Backend deployed to Lambda function: $LAMBDA_FUNCTION_NAME"

# Step 5: Deploy sample data (if this is staging)
if [[ "$ENV" == "stage" ]]; then
    echo "📋 Deploying sample data to staging..."
    if [[ -d "$PROJECT_ROOT/.data/s3/forms/sops" ]]; then
        aws s3 sync "$PROJECT_ROOT/.data/s3/forms/sops/" "s3://$FORMS_BUCKET/sops/" --region "$REGION"
        echo "✅ Sample SOPs deployed to s3://$FORMS_BUCKET/sops/"
    fi
fi

# Step 6: Cleanup
echo "🧹 Cleaning up..."
rm -f "$LAMBDA_PACKAGE"

# Step 7: Display deployment information
echo ""
echo "🎉 Deployment completed successfully!"
echo ""
echo "📋 Deployment Summary:"
echo "  Environment: $ENV"
echo "  Stack: $STACK_NAME"
echo "  Region: $REGION"
echo ""
echo "🌐 Application URLs:"
if [[ "$ENV" == "stage" ]]; then
    echo "  Frontend: https://staging.claire.yourdomain.com"
    echo "  API: https://api-staging.claire.yourdomain.com"
elif [[ "$ENV" == "prod" ]]; then
    echo "  Frontend: https://claire.yourdomain.com"
    echo "  API: https://api.claire.yourdomain.com"
fi
echo ""
echo "🔧 Next Steps:"
echo "  1. Run smoke tests: ./infra/scripts/smoke-tests.sh $ENV"
echo "  2. Monitor logs in CloudWatch"
echo "  3. Verify application functionality"
echo "" 