#!/bin/bash
# Installation script for Voice AI Buddy update system
# Sets up automatic updates from GitHub

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Voice AI Buddy Update System Installation ===${NC}"
echo ""

# Check if running as root (we need sudo for systemd operations)
if [ "$EUID" -eq 0 ]; then
    echo -e "${RED}Error: Do not run this script as root. It will use sudo when needed.${NC}"
    exit 1
fi

# Get current user
CURRENT_USER="$USER"
CURRENT_HOME="$HOME"

# Configuration
PRODUCTION_DIR="/opt/voice_ai_buddy"
STAGING_DIR="/opt/voice_ai_buddy_staging"
STATE_DIR="/var/lib/voice_ai_buddy"
HARDWARE_DIR="$PRODUCTION_DIR/hardware"

echo "Installing update system for user: $CURRENT_USER"
echo "Production directory: $PRODUCTION_DIR"
echo ""

# Check if production directory exists
if [ ! -d "$PRODUCTION_DIR" ]; then
    echo -e "${RED}Error: Production directory not found: $PRODUCTION_DIR${NC}"
    echo "Please run migrate_to_opt.sh first to migrate your installation."
    exit 1
fi

# Check if virtual environment exists
if [ ! -d "$HARDWARE_DIR/venv" ]; then
    echo -e "${RED}Error: Virtual environment not found at $HARDWARE_DIR/venv${NC}"
    echo "Please run setup.sh first to create the virtual environment."
    exit 1
fi

# Check if Python module can be imported
echo "Verifying Python installation..."
if ! "$HARDWARE_DIR/venv/bin/python" -c "import rpi_client" 2>/dev/null; then
    echo -e "${RED}Error: Cannot import rpi_client module${NC}"
    echo "Please ensure the virtual environment is set up correctly."
    exit 1
fi

# Get GitHub repository URL
echo ""
echo "GitHub Repository Configuration"
echo "================================"
if [ -z "$GITHUB_REPO_URL" ]; then
    echo "Enter your GitHub repository URL (SSH or HTTPS):"
    echo "Example: git@github.com:username/voice_ai_buddy.git"
    echo "Or: https://github.com/username/voice_ai_buddy.git"
    read -r REPO_URL
    if [ -z "$REPO_URL" ]; then
        echo -e "${RED}Error: Repository URL is required${NC}"
        exit 1
    fi
else
    REPO_URL="$GITHUB_REPO_URL"
    echo "Using GITHUB_REPO_URL from environment: $REPO_URL"
fi

# Get branch (default: main)
echo ""
echo "Enter Git branch to track (default: main):"
read -r BRANCH
BRANCH=${BRANCH:-main}

# Ensure directories exist
echo ""
echo "Creating directories..."
sudo mkdir -p "$STATE_DIR"
sudo mkdir -p "$STAGING_DIR"
sudo chown -R "$CURRENT_USER:$CURRENT_USER" "$STATE_DIR"
sudo chown -R "$CURRENT_USER:$CURRENT_USER" "$STAGING_DIR"

# Initialize state files if they don't exist
if [ ! -f "$STATE_DIR/update_state.txt" ]; then
    echo "idle" | sudo tee "$STATE_DIR/update_state.txt" > /dev/null
    sudo chown "$CURRENT_USER:$CURRENT_USER" "$STATE_DIR/update_state.txt"
fi

# Initialize version file if production has git
if [ -d "$PRODUCTION_DIR/.git" ]; then
    cd "$PRODUCTION_DIR"
    CURRENT_VERSION=$(git rev-parse HEAD 2>/dev/null || echo "")
    if [ -n "$CURRENT_VERSION" ] && [ ! -f "$STATE_DIR/current_version.txt" ]; then
        echo "$CURRENT_VERSION" | sudo tee "$STATE_DIR/current_version.txt" > /dev/null
        sudo chown "$CURRENT_USER:$CURRENT_USER" "$STATE_DIR/current_version.txt"
        echo "Initialized version: $CURRENT_VERSION"
    fi
fi

# Create systemd service file for updater
SERVICE_FILE="$HARDWARE_DIR/voice-ai-buddy-updater.service"
TEMP_SERVICE_FILE="/tmp/voice-ai-buddy-updater.service.$$"
VENV_BIN="$HARDWARE_DIR/venv/bin"

echo ""
echo "Creating systemd service file for updater..."

# Replace placeholders in service file
sed -e "s|REPLACE_USER|$CURRENT_USER|g" \
    -e "s|REPLACE_PRODUCTION_DIR|$PRODUCTION_DIR|g" \
    -e "s|REPLACE_VENV_BIN|$VENV_BIN|g" \
    -e "s|REPLACE_REPO_URL|$REPO_URL|g" \
    -e "s|REPLACE_BRANCH|$BRANCH|g" \
    "$SERVICE_FILE" > "$TEMP_SERVICE_FILE"

# Copy service file to systemd directory
SYSTEMD_SERVICE="/etc/systemd/system/voice-ai-buddy-updater.service"
echo "Installing updater service file to $SYSTEMD_SERVICE..."

sudo cp "$TEMP_SERVICE_FILE" "$SYSTEMD_SERVICE"
sudo chmod 644 "$SYSTEMD_SERVICE"
rm "$TEMP_SERVICE_FILE"

# Reload systemd daemon
echo "Reloading systemd daemon..."
sudo systemctl daemon-reload

# Enable updater service
echo "Enabling updater service..."
sudo systemctl enable voice-ai-buddy-updater.service

# Check if user wants to start the updater service now
echo ""
echo -e "${GREEN}Update system installed successfully!${NC}"
echo ""
echo "What would you like to do?"
echo "1. Start the updater service now"
echo "2. Just enable it (it will start on next boot)"
read -r choice

case $choice in
    1)
        echo "Starting updater service..."
        sudo systemctl start voice-ai-buddy-updater.service
        sleep 2
        echo ""
        echo "Updater service status:"
        sudo systemctl status voice-ai-buddy-updater.service --no-pager -l
        echo ""
        echo -e "${GREEN}Updater service started!${NC}"
        echo "To view logs: sudo journalctl -u voice-ai-buddy-updater.service -f"
        ;;
    2)
        echo -e "${GREEN}Updater service enabled. It will start automatically on next boot.${NC}"
        ;;
    *)
        echo -e "${YELLOW}Updater service installed but not started.${NC}"
        echo "To start it manually: sudo systemctl start voice-ai-buddy-updater.service"
        ;;
esac

echo ""
echo "=== Installation Complete ==="
echo ""
echo "Useful commands:"
echo "  Start updater:    sudo systemctl start voice-ai-buddy-updater.service"
echo "  Stop updater:     sudo systemctl stop voice-ai-buddy-updater.service"
echo "  View logs:        sudo journalctl -u voice-ai-buddy-updater.service -f"
echo "  Check status:     sudo systemctl status voice-ai-buddy-updater.service"
echo ""
echo "Note: Updates will be applied automatically on next boot if available."
echo ""

