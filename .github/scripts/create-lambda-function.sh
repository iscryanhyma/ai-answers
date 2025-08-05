#!/bin/bash
set -euo pipefail

PR_NUMBER="$1"
FUNCTION_NAME="$2"
REGISTRY="$3"
IMAGE="$4"
ROLE_ARN="$5"

FULL_FUNCTION_NAME="${FUNCTION_NAME}-${PR_NUMBER}"
IMAGE_TAG="${PR_NUMBER}"

echo "Deploying AI Answers function: $FULL_FUNCTION_NAME"

# Fetch environment variables from SSM Parameter Store
echo "Fetching environment variables from SSM Parameter Store..."
# The parameter names to fetch
PARAMETER_NAMES="docdb_uri azure_openai_api_key azure_openai_endpoint azure_openai_api_version canada_ca_search_uri canada_ca_search_api_key jwt_secret_key user_agent google_api_key google_search_engine_id"

# Fetch all parameters in one go
PARAMETERS_JSON=$(aws ssm get-parameters --names $PARAMETER_NAMES --with-decryption --query 'Parameters' --output json)

# Check for missing parameters
INVALID_PARAMS=$(aws ssm get-parameters --names $PARAMETER_NAMES --with-decryption --query 'InvalidParameters' --output text)
if [ "$INVALID_PARAMS" != "None" ] && [ -n "$INVALID_PARAMS" ]; then
  echo "Error: Missing or invalid parameters: $INVALID_PARAMS"
  exit 1
fi

# Extract each parameter value using jq
DOCDB_URI=$(echo "$PARAMETERS_JSON" | jq -r '.[] | select(.Name=="docdb_uri") | .Value')
AZURE_OPENAI_API_KEY=$(echo "$PARAMETERS_JSON" | jq -r '.[] | select(.Name=="azure_openai_api_key") | .Value')
AZURE_OPENAI_ENDPOINT=$(echo "$PARAMETERS_JSON" | jq -r '.[] | select(.Name=="azure_openai_endpoint") | .Value')
AZURE_OPENAI_API_VERSION=$(echo "$PARAMETERS_JSON" | jq -r '.[] | select(.Name=="azure_openai_api_version") | .Value')
CANADA_CA_SEARCH_URI=$(echo "$PARAMETERS_JSON" | jq -r '.[] | select(.Name=="canada_ca_search_uri") | .Value')
CANADA_CA_SEARCH_API_KEY=$(echo "$PARAMETERS_JSON" | jq -r '.[] | select(.Name=="canada_ca_search_api_key") | .Value')
JWT_SECRET_KEY=$(echo "$PARAMETERS_JSON" | jq -r '.[] | select(.Name=="jwt_secret_key") | .Value')
USER_AGENT=$(echo "$PARAMETERS_JSON" | jq -r '.[] | select(.Name=="user_agent") | .Value')
GOOGLE_API_KEY=$(echo "$PARAMETERS_JSON" | jq -r '.[] | select(.Name=="google_api_key") | .Value')
GOOGLE_SEARCH_ENGINE_ID=$(echo "$PARAMETERS_JSON" | jq -r '.[] | select(.Name=="google_search_engine_id") | .Value')

# Validate that all required parameters were extracted
if [ -z "$DOCDB_URI" ] || [ -z "$AZURE_OPENAI_API_KEY" ] || [ -z "$AZURE_OPENAI_ENDPOINT" ] || [ -z "$JWT_SECRET_KEY" ]; then
  echo "Error: One or more required parameters are empty after extraction"
  echo "DOCDB_URI: ${DOCDB_URI:+SET}"
  echo "AZURE_OPENAI_API_KEY: ${AZURE_OPENAI_API_KEY:+SET}"
  echo "AZURE_OPENAI_ENDPOINT: ${AZURE_OPENAI_ENDPOINT:+SET}"
  echo "JWT_SECRET_KEY: ${JWT_SECRET_KEY:+SET}"
  exit 1
fi

# Check if the function already exists
if aws lambda get-function --function-name "$FULL_FUNCTION_NAME" > /dev/null 2>&1; then
  echo "Function exists. Updating code and environment variables..."
  
  echo "Updating function code..."
  if ! aws lambda update-function-code \
    --function-name "$FULL_FUNCTION_NAME" \
    --image-uri "${REGISTRY}/${IMAGE}:${IMAGE_TAG}" > /dev/null 2>&1; then
    echo "Error: Failed to update function code"
    exit 1
  fi
  
  echo "Waiting for function to be ready for configuration update..."
  aws lambda wait function-updated --function-name "$FULL_FUNCTION_NAME" 2>/dev/null || true
    
  echo "Updating function configuration..."
  ERROR_OUTPUT=$(aws lambda update-function-configuration \
    --function-name "$FULL_FUNCTION_NAME" \
    --timeout 300 \
    --environment "Variables={NODE_ENV=production,PORT=3001,DOCDB_URI=$DOCDB_URI,AZURE_OPENAI_API_KEY=$AZURE_OPENAI_API_KEY,AZURE_OPENAI_ENDPOINT=$AZURE_OPENAI_ENDPOINT,AZURE_OPENAI_API_VERSION=$AZURE_OPENAI_API_VERSION,CANADA_CA_SEARCH_URI=$CANADA_CA_SEARCH_URI,CANADA_CA_SEARCH_API_KEY=$CANADA_CA_SEARCH_API_KEY,JWT_SECRET_KEY=$JWT_SECRET_KEY,USER_AGENT=$USER_AGENT,GOOGLE_API_KEY=$GOOGLE_API_KEY,GOOGLE_SEARCH_ENGINE_ID=$GOOGLE_SEARCH_ENGINE_ID}" 2>&1)
  
  if [ $? -ne 0 ]; then
    echo "Error: Failed to update function configuration"
    echo "AWS Error details:"
    echo "$ERROR_OUTPUT" | grep -E "(Error|error|Invalid|invalid|not found|NotFound|AccessDenied|Forbidden)" || echo "$ERROR_OUTPUT"
    exit 1
  fi
else
  echo "Function does not exist. Creating new Lambda function..."
  echo "Using image: ${REGISTRY}/${IMAGE}:${IMAGE_TAG}"
  echo "Using role: $ROLE_ARN"
  
  # First validate the role exists
  if ! aws iam get-role --role-name "$(basename "$ROLE_ARN")" > /dev/null 2>&1; then
    echo "Error: IAM role does not exist or is not accessible: $ROLE_ARN"
    exit 1
  fi
  
  # Try to create the function and capture the error
  ERROR_OUTPUT=$(aws lambda create-function \
    --function-name "$FULL_FUNCTION_NAME" \
    --package-type Image \
    --role "$ROLE_ARN" \
    --timeout 300 \
    --memory-size 1024 \
    --code ImageUri="${REGISTRY}/${IMAGE}:${IMAGE_TAG}" \
    --environment "Variables={NODE_ENV=production,PORT=3001,DOCDB_URI=$DOCDB_URI,AZURE_OPENAI_API_KEY=$AZURE_OPENAI_API_KEY,AZURE_OPENAI_ENDPOINT=$AZURE_OPENAI_ENDPOINT,AZURE_OPENAI_API_VERSION=$AZURE_OPENAI_API_VERSION,CANADA_CA_SEARCH_URI=$CANADA_CA_SEARCH_URI,CANADA_CA_SEARCH_API_KEY=$CANADA_CA_SEARCH_API_KEY,JWT_SECRET_KEY=$JWT_SECRET_KEY,USER_AGENT=$USER_AGENT,GOOGLE_API_KEY=$GOOGLE_API_KEY,GOOGLE_SEARCH_ENGINE_ID=$GOOGLE_SEARCH_ENGINE_ID}" \
    --description "$GITHUB_REPOSITORY/pull/$PR_NUMBER - AI Answers PR Review Environment" 2>&1)
  
  if [ $? -ne 0 ]; then
    echo "Error: Failed to create Lambda function"
    echo "AWS Error details:"
    echo "$ERROR_OUTPUT" | grep -E "(Error|error|Invalid|invalid|not found|NotFound|AccessDenied|Forbidden)" || echo "$ERROR_OUTPUT"
    exit 1
  fi

  echo "Waiting for function to become active..."
  if ! aws lambda wait function-active --function-name "$FULL_FUNCTION_NAME" 2>/dev/null; then
    echo "Error: Function failed to become active"
    exit 1
  fi

  echo "Setting up function URL permissions..."
  if ! aws lambda add-permission \
    --function-name "$FULL_FUNCTION_NAME" \
    --statement-id FunctionURLAllowPublicAccess \
    --action lambda:InvokeFunctionUrl \
    --principal "*" \
    --function-url-auth-type NONE > /dev/null 2>&1; then
    echo "Error: Failed to add function URL permissions"
    exit 1
  fi

  echo "Creating function URL configuration..."
  if ! aws lambda create-function-url-config \
    --function-name "$FULL_FUNCTION_NAME" \
    --auth-type NONE > /dev/null 2>&1; then
    echo "Error: Failed to create function URL configuration"
    exit 1
  fi

  echo "Setting up logs..."
  aws logs create-log-group --log-group-name /aws/lambda/"$FULL_FUNCTION_NAME" 2>/dev/null || true
  if ! aws logs put-retention-policy --log-group-name /aws/lambda/"$FULL_FUNCTION_NAME" --retention-in-days 7 > /dev/null 2>&1; then
    echo "Warning: Failed to set log retention policy"
  fi
fi

echo "Lambda function $FULL_FUNCTION_NAME deployed successfully"