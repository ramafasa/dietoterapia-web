#!/bin/bash

# Test script for POST /api/auth/signup endpoint
# This script creates a test invitation and then tests the signup flow

echo "🧪 Testing POST /api/auth/signup endpoint"
echo ""

# Base URL (adjust if needed)
BASE_URL="http://localhost:4323"

# Step 1: Create test invitation (requires dietitian to be logged in)
echo "Step 1: Creating test invitation..."
echo "Note: This requires manual creation via /api/dietitian/invitations or direct DB insert"
echo ""

# For now, we'll use a manually created invitation token
# Replace this with actual token from database
TEST_TOKEN="test-invitation-token-12345"
TEST_EMAIL="patient-test@example.com"

echo "Using test token: $TEST_TOKEN"
echo "Using test email: $TEST_EMAIL"
echo ""

# Step 2: Test signup with valid data
echo "Step 2: Testing signup with valid data..."
echo ""

VALID_PAYLOAD=$(cat <<EOF
{
  "invitationToken": "$TEST_TOKEN",
  "email": "$TEST_EMAIL",
  "password": "SecurePassword123",
  "firstName": "Jan",
  "lastName": "Kowalski",
  "age": 35,
  "gender": "male",
  "consents": [
    {
      "type": "data_processing",
      "text": "Zgadzam się na przetwarzanie moich danych osobowych",
      "accepted": true
    },
    {
      "type": "health_data",
      "text": "Zgadzam się na przetwarzanie moich danych zdrowotnych",
      "accepted": true
    }
  ]
}
EOF
)

echo "Request payload:"
echo "$VALID_PAYLOAD" | jq .
echo ""

RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
  -X POST \
  -H "Content-Type: application/json" \
  -d "$VALID_PAYLOAD" \
  "$BASE_URL/api/auth/signup")

HTTP_BODY=$(echo "$RESPONSE" | sed -e 's/HTTP_STATUS\:.*//g')
HTTP_STATUS=$(echo "$RESPONSE" | tr -d '\n' | sed -e 's/.*HTTP_STATUS://')

echo "Response status: $HTTP_STATUS"
echo "Response body:"
echo "$HTTP_BODY" | jq .
echo ""

# Step 3: Test signup with missing required consent
echo "Step 3: Testing signup with missing required consent (should fail with 422)..."
echo ""

INVALID_PAYLOAD=$(cat <<EOF
{
  "invitationToken": "$TEST_TOKEN",
  "email": "$TEST_EMAIL",
  "password": "SecurePassword123",
  "firstName": "Jan",
  "lastName": "Kowalski",
  "consents": [
    {
      "type": "data_processing",
      "text": "Zgadzam się na przetwarzanie moich danych osobowych",
      "accepted": true
    }
  ]
}
EOF
)

RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
  -X POST \
  -H "Content-Type: application/json" \
  -d "$INVALID_PAYLOAD" \
  "$BASE_URL/api/auth/signup")

HTTP_BODY=$(echo "$RESPONSE" | sed -e 's/HTTP_STATUS\:.*//g')
HTTP_STATUS=$(echo "$RESPONSE" | tr -d '\n' | sed -e 's/.*HTTP_STATUS://')

echo "Response status: $HTTP_STATUS (expected: 422)"
echo "Response body:"
echo "$HTTP_BODY" | jq .
echo ""

# Step 4: Test signup with invalid invitation token
echo "Step 4: Testing signup with invalid invitation token (should fail with 400)..."
echo ""

INVALID_TOKEN_PAYLOAD=$(cat <<EOF
{
  "invitationToken": "invalid-token-99999",
  "email": "newpatient@example.com",
  "password": "SecurePassword123",
  "firstName": "Anna",
  "lastName": "Nowak",
  "consents": [
    {
      "type": "data_processing",
      "text": "Zgadzam się na przetwarzanie moich danych osobowych",
      "accepted": true
    },
    {
      "type": "health_data",
      "text": "Zgadzam się na przetwarzanie moich danych zdrowotnych",
      "accepted": true
    }
  ]
}
EOF
)

RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
  -X POST \
  -H "Content-Type: application/json" \
  -d "$INVALID_TOKEN_PAYLOAD" \
  "$BASE_URL/api/auth/signup")

HTTP_BODY=$(echo "$RESPONSE" | sed -e 's/HTTP_STATUS\:.*//g')
HTTP_STATUS=$(echo "$RESPONSE" | tr -d '\n' | sed -e 's/.*HTTP_STATUS://')

echo "Response status: $HTTP_STATUS (expected: 400)"
echo "Response body:"
echo "$HTTP_BODY" | jq .
echo ""

echo "✅ Test completed!"
echo ""
echo "Manual verification needed:"
echo "1. Create a real invitation token in the database"
echo "2. Run this script with the real token"
echo "3. Verify user was created in database"
echo "4. Verify session cookie was set"
echo "5. Verify audit log entries were created"
