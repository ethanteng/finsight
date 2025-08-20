#!/bin/bash

# Fast Deploy Script for Website Pages
# This script triggers the fast deploy workflow for quick website updates

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Triggering Fast Deploy for Website Pages${NC}"

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    echo -e "${YELLOW}GitHub CLI (gh) is not installed. Please install it first:${NC}"
    echo "https://cli.github.com/"
    exit 1
fi

# Check if user is authenticated
if ! gh auth status &> /dev/null; then
    echo -e "${YELLOW}Please authenticate with GitHub CLI first:${NC}"
    echo "gh auth login"
    exit 1
fi

# Get the current repository
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)

if [ -z "$REPO" ]; then
    echo -e "${YELLOW}Could not determine repository. Please run this from a git repository.${NC}"
    exit 1
fi

echo "Repository: $REPO"

# Trigger the fast deploy workflow
echo -e "${GREEN}Triggering fast deploy workflow...${NC}"
gh workflow run "fast-deploy.yml" --repo "$REPO" --field force_deploy=true

echo -e "${GREEN}✅ Fast deploy workflow triggered successfully!${NC}"
echo -e "${YELLOW}Check the Actions tab to monitor progress:${NC}"
echo "https://github.com/$REPO/actions"
