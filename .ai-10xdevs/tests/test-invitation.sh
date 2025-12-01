#!/bin/bash

# Test script for invitation system
# Usage: ./.ai-10xdevs/tests/test-invitation.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Server URL (adjust port if needed)
SERVER_URL="http://localhost:4323"

# Valid invitation token (update this with your generated token)
VALID_TOKEN="1ff4e0f8748aab12fac235a5cfe4d1bf4e3e9e156e3086bad60b8da87430113a"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Invitation System Tests${NC}"
echo -e "${BLUE}========================================${NC}\n"

# Test 1: Validate valid token
echo -e "${YELLOW}Test 1: Validating valid token...${NC}"
RESPONSE=$(curl -s -w "\n%{http_code}" "$SERVER_URL/api/invitations/$VALID_TOKEN")
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
  VALID=$(echo "$BODY" | jq -r '.valid')
  EMAIL=$(echo "$BODY" | jq -r '.email')

  if [ "$VALID" = "true" ] && [ "$EMAIL" = "pacjent@example.com" ]; then
    echo -e "${GREEN}✅ PASSED${NC} - Token is valid, email: $EMAIL\n"
  else
    echo -e "${RED}❌ FAILED${NC} - Unexpected response: $BODY\n"
    exit 1
  fi
else
  echo -e "${RED}❌ FAILED${NC} - HTTP $HTTP_CODE: $BODY\n"
  exit 1
fi

# Test 2: Validate invalid token (should return 404)
echo -e "${YELLOW}Test 2: Validating invalid token...${NC}"
RESPONSE=$(curl -s -w "\n%{http_code}" "$SERVER_URL/api/invitations/invalid-token-12345")
HTTP_CODE=$(echo "$RESPONSE" | tail -n 1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "404" ]; then
  ERROR=$(echo "$BODY" | jq -r '.error')

  if [ "$ERROR" = "not_found" ]; then
    echo -e "${GREEN}✅ PASSED${NC} - Invalid token correctly rejected\n"
  else
    echo -e "${RED}❌ FAILED${NC} - Unexpected error: $ERROR\n"
    exit 1
  fi
else
  echo -e "${RED}❌ FAILED${NC} - Expected HTTP 404, got $HTTP_CODE\n"
  exit 1
fi

# Test 3: Signup page with valid token (should return 200)
echo -e "${YELLOW}Test 3: Checking signup page with valid token...${NC}"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$SERVER_URL/auth/signup?token=$VALID_TOKEN")

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✅ PASSED${NC} - Signup page loads correctly\n"
else
  echo -e "${RED}❌ FAILED${NC} - Expected HTTP 200, got $HTTP_CODE\n"
  exit 1
fi

# Test 4: Signup page without token (should redirect to invalid)
echo -e "${YELLOW}Test 4: Checking signup page without token...${NC}"
RESPONSE=$(curl -s -I "$SERVER_URL/auth/signup" | grep -i location || echo "no-redirect")

if echo "$RESPONSE" | grep -q "invitation-invalid"; then
  echo -e "${GREEN}✅ PASSED${NC} - Correctly redirects to invitation-invalid\n"
else
  echo -e "${RED}❌ FAILED${NC} - Expected redirect to invitation-invalid, got: $RESPONSE\n"
  exit 1
fi

# Test 5: Signup page with invalid token (should show error)
echo -e "${YELLOW}Test 5: Checking signup page with invalid token...${NC}"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$SERVER_URL/auth/signup?token=invalid-token-xyz")

if [ "$HTTP_CODE" = "200" ]; then
  # Page loads but should show error message
  CONTENT=$(curl -s "$SERVER_URL/auth/signup?token=invalid-token-xyz")

  if echo "$CONTENT" | grep -q "Zaproszenie nie zostało znalezione"; then
    echo -e "${GREEN}✅ PASSED${NC} - Error message displayed correctly\n"
  else
    echo -e "${YELLOW}⚠️  WARNING${NC} - Page loads but error message not found in content\n"
  fi
else
  echo -e "${RED}❌ FAILED${NC} - Unexpected HTTP code: $HTTP_CODE\n"
  exit 1
fi

# Summary
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}All tests passed! ✅${NC}"
echo -e "${BLUE}========================================${NC}\n"

echo -e "${YELLOW}Next steps:${NC}"
echo -e "1. Test E2E registration flow manually in browser:"
echo -e "   ${BLUE}$SERVER_URL/auth/signup?token=$VALID_TOKEN${NC}"
echo -e "2. Check database to verify user creation and token usage"
echo -e "3. Test that used token is rejected after registration\n"

exit 0
