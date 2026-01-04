#!/bin/bash
# Migration script to move application from ~/Documents/startupWorld/ to /opt/voice_ai_buddy
# This script should be run once to migrate existing installations

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Voice AI Buddy Migration to /opt/ ===${NC}"
echo ""

# Check if running as root (we need sudo for /opt/ operations)
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Error: This script must be run with sudo${NC}"
    exit 1
fi

# Source and destination paths
SOURCE_DIR="/home/laddu/Documents/startupWorld/voice_ai_buddy"
DEST_DIR="/opt/voice_ai_buddy"
STATE_DIR="/var/lib/voice_ai_buddy"

# Check if source exists
if [ ! -d "$SOURCE_DIR" ]; then
    echo -e "${YELLOW}Source directory not found: $SOURCE_DIR${NC}"
    echo "If your repository is in a different location, please update this script."
    exit 1
fi

# Check if destination already exists
if [ -d "$DEST_DIR" ]; then
    echo -e "${YELLOW}Destination directory already exists: $DEST_DIR${NC}"
    echo "Do you want to overwrite it? (y/n)"
    read -r response
    if [ "$response" != "y" ] && [ "$response" != "Y" ]; then
        echo "Migration cancelled."
        exit 1
    fi
    echo "Removing existing destination..."
    rm -rf "$DEST_DIR"
fi

# Get the user who owns the source directory
SOURCE_OWNER=$(stat -c '%U' "$SOURCE_DIR")
echo "Source directory owner: $SOURCE_OWNER"

# Copy files to /opt/
echo "Copying files to $DEST_DIR..."
cp -r "$SOURCE_DIR" "$DEST_DIR"

# Set ownership
echo "Setting ownership to $SOURCE_OWNER..."
chown -R "$SOURCE_OWNER:$SOURCE_OWNER" "$DEST_DIR"

# Create state directory
echo "Creating state directory: $STATE_DIR..."
mkdir -p "$STATE_DIR"
chown -R "$SOURCE_OWNER:$SOURCE_OWNER" "$STATE_DIR"

# Create staging directory
STAGING_DIR="/opt/voice_ai_buddy_staging"
echo "Creating staging directory: $STAGING_DIR..."
mkdir -p "$STAGING_DIR"
chown -R "$SOURCE_OWNER:$SOURCE_OWNER" "$STAGING_DIR"

# Initialize version file if production has git
if [ -d "$DEST_DIR/.git" ]; then
    echo "Initializing version file..."
    cd "$DEST_DIR"
    CURRENT_VERSION=$(git rev-parse HEAD 2>/dev/null || echo "")
    if [ -n "$CURRENT_VERSION" ]; then
        echo "$CURRENT_VERSION" > "$STATE_DIR/current_version.txt"
        chown "$SOURCE_OWNER:$SOURCE_OWNER" "$STATE_DIR/current_version.txt"
        echo "Current version: $CURRENT_VERSION"
    fi
fi

# Initialize state file
echo "idle" > "$STATE_DIR/update_state.txt"
chown "$SOURCE_OWNER:$SOURCE_OWNER" "$STATE_DIR/update_state.txt"

echo ""
echo -e "${GREEN}Migration completed successfully!${NC}"
echo ""
echo "Next steps:"
echo "1. Update your service files to use /opt/voice_ai_buddy"
echo "2. Run install_service.sh to reinstall services"
echo "3. Configure GITHUB_REPO_URL in your environment"
echo ""

