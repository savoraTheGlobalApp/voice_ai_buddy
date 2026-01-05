#!/bin/bash
# Post-installation setup script for /opt/ installation
# Run this after cloning the repository to /opt/voice_ai_buddy
# This script sets up directories, permissions, and initializes version tracking

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Voice AI Buddy /opt/ Installation Setup ===${NC}"
echo ""

# Check if running as root (we need sudo for /opt/ operations)
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Error: This script must be run with sudo${NC}"
    exit 1
fi

# Configuration
PRODUCTION_DIR="/opt/voice_ai_buddy"
STAGING_DIR="/opt/voice_ai_buddy_staging"
STATE_DIR="/var/lib/voice_ai_buddy"

# Detect current user (the one who invoked sudo)
CURRENT_USER="${SUDO_USER:-$USER}"

# If SUDO_USER is not set, try to get the actual user
if [ -z "$SUDO_USER" ]; then
    # Try to get the user who invoked sudo
    CURRENT_USER=$(logname 2>/dev/null || echo "$USER")
fi

echo "Setting up for user: $CURRENT_USER"
echo "Production directory: $PRODUCTION_DIR"
echo ""

# Check if production directory exists
if [ ! -d "$PRODUCTION_DIR" ]; then
    echo -e "${RED}Error: Production directory not found: $PRODUCTION_DIR${NC}"
    echo "Please clone the repository to /opt/voice_ai_buddy first."
    echo ""
    echo "Example command:"
    echo "  sudo git clone <your-repo-url> /opt/voice_ai_buddy"
    exit 1
fi

# Set ownership of production directory
echo "Setting ownership of production directory..."
chown -R "$CURRENT_USER:$CURRENT_USER" "$PRODUCTION_DIR"

# Create state directory
echo "Creating state directory: $STATE_DIR..."
mkdir -p "$STATE_DIR"
chown -R "$CURRENT_USER:$CURRENT_USER" "$STATE_DIR"

# Create staging directory
echo "Creating staging directory: $STAGING_DIR..."
mkdir -p "$STAGING_DIR"
chown -R "$CURRENT_USER:$CURRENT_USER" "$STAGING_DIR"

# Initialize version file if production has git
if [ -d "$PRODUCTION_DIR/.git" ]; then
    echo "Initializing version file..."
    cd "$PRODUCTION_DIR"
    CURRENT_VERSION=$(git rev-parse HEAD 2>/dev/null || echo "")
    if [ -n "$CURRENT_VERSION" ]; then
        echo "$CURRENT_VERSION" > "$STATE_DIR/current_version.txt"
        chown "$CURRENT_USER:$CURRENT_USER" "$STATE_DIR/current_version.txt"
        echo "Current version: $CURRENT_VERSION"
    fi
fi

# Initialize state file
echo "idle" > "$STATE_DIR/update_state.txt"
chown "$CURRENT_USER:$CURRENT_USER" "$STATE_DIR/update_state.txt"

echo ""
echo -e "${GREEN}Setup completed successfully!${NC}"
echo ""
echo "Next steps (run as user $CURRENT_USER, not as root):"
echo ""
echo "1. Switch to the hardware directory:"
echo "   cd $PRODUCTION_DIR/hardware"
echo ""
echo "2. Run setup to install dependencies:"
echo "   ./setup.sh"
echo ""
echo "3. Configure environment:"
echo "   nano .env"
echo "   # Set BACKEND_URL, USER_UID, USER_NAME, USER_AGE"
echo ""
echo "4. Install update system:"
echo "   ./install_update_system.sh"
echo ""
echo "5. Install main service:"
echo "   ./install_service.sh"
echo ""
echo "=== Setup Complete ==="
echo ""

