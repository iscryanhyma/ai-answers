#!/bin/bash
set -euo pipefail

LANG="$1"
PR_NUMBER="$2"
FUNCTION_NAME="$3"
REGISTRY="$4"
IMAGE="$5"
ROLE_ARN="$6"

FULL_FUNCTION_NAME="${FUNCTION_NAME}-${PR_NUMBER}-${LANG}"
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

# Check if the function already exists
if aws lambda get-function --function-name "$FULL_FUNCTION_NAME" > /dev/null 2>&1; then
  echo "Function exists. Updating code and environment variables..."
  
  aws lambda update-function-code \
    --function-name "$FULL_FUNCTION_NAME" \
    --image-uri "${REGISTRY}/${IMAGE}:${IMAGE_TAG}" > /dev/null 2>&1
    
  aws lambda update-function-configuration \
    --function-name "$FULL_FUNCTION_NAME" \
    --environment "Variables={NODE_ENV=production,PORT=3001,DOCDB_URI=$DOCDB_URI,AZURE_OPENAI_API_KEY=$AZURE_OPENAI_API_KEY,AZURE_OPENAI_ENDPOINT=$AZURE_OPENAI_ENDPOINT,AZURE_OPENAI_API_VERSION=$AZURE_OPENAI_API_VERSION,CANADA_CA_SEARCH_URI=$CANADA_CA_SEARCH_URI,CANADA_CA_SEARCH_API_KEY=$CANADA_CA_SEARCH_API_KEY,JWT_SECRET_KEY=$JWT_SECRET_KEY,USER_AGENT=$USER_AGENT,GOOGLE_API_KEY=$GOOGLE_API_KEY,GOOGLE_SEARCH_ENGINE_ID=$GOOGLE_SEARCH_ENGINE_ID}" > /dev/null 2>&1
else
  echo "Function does not exist. Creating new Lambda function..."
  
  aws lambda create-function \
    --function-name "$FULL_FUNCTION_NAME" \
    --package-type Image \
    --role "$ROLE_ARN" \
    --timeout 30 \
    --memory-size 1024 \
    --code ImageUri="${REGISTRY}/${IMAGE}:${IMAGE_TAG}" \
    --environment "Variables={NODE_ENV=production,PORT=3001,DOCDB_URI=$DOCDB_URI,AZURE_OPENAI_API_KEY=$AZURE_OPENAI_API_KEY,AZURE_OPENAI_ENDPOINT=$AZURE_OPENAI_ENDPOINT,AZURE_OPENAI_API_VERSION=$AZURE_OPENAI_API_VERSION,CANADA_CA_SEARCH_URI=$CANADA_CA_SEARCH_URI,CANADA_CA_SEARCH_API_KEY=$CANADA_CA_SEARCH_API_KEY,JWT_SECRET_KEY=$JWT_SECRET_KEY,USER_AGENT=$USER_AGENT,GOOGLE_API_KEY=$GOOGLE_API_KEY,GOOGLE_SEARCH_ENGINE_ID=$GOOGLE_SEARCH_ENGINE_ID}" \
    --description "$GITHUB_REPOSITORY/pull/$PR_NUMBER - AI Answers PR Review Environment" > /dev/null 2>&1

  echo "Waiting for function to become active..."
  aws lambda wait function-active --function-name "$FULL_FUNCTION_NAME" > /dev/null 2>&1

  echo "Setting up function URL..."
  aws lambda add-permission \
    --function-name "$FULL_FUNCTION_NAME" \
    --statement-id FunctionURLAllowPublicAccess \
    --action lambda:InvokeFunctionUrl \
    --principal "*" \
    --function-url-auth-type NONE > /dev/null 2>&1

  echo "Creating function URL configuration..."
  aws lambda create-function-url-config \
    --function-name "$FULL_FUNCTION_NAME" \
    --auth-type NONE > /dev/null 2>&1

  echo "Setting up logs..."
  aws logs create-log-group --log-group-name /aws/lambda/"$FULL_FUNCTION_NAME" || true > /dev/null 2>&1
  aws logs put-retention-policy --log-group-name /aws/lambda/"$FULL_FUNCTION_NAME" --retention-in-days 7 > /dev/null 2>&1
fi

echo "Lambda function $FULL_FUNCTION_NAME deployed successfully"