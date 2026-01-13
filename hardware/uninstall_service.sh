#!/bin/bash
# Uninstallation script for Voice AI Buddy systemd service

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}=== Voice AI Buddy Service Uninstallation ===${NC}"
echo ""

# Check if service exists
if [ ! -f "/etc/systemd/system/voice-ai-buddy.service" ]; then
    echo -e "${YELLOW}Service is not installed.${NC}"
    exit 0
fi

# Check if service is running
if systemctl is-active --quiet voice-ai-buddy.service; then
    echo "Stopping service..."
    sudo systemctl stop voice-ai-buddy.service
fi

# Disable service
echo "Disabling service..."
sudo systemctl disable voice-ai-buddy.service

# Remove service file
echo "Removing service file..."
sudo rm -f /etc/systemd/system/voice-ai-buddy.service

# Reload systemd daemon
echo "Reloading systemd daemon..."
sudo systemctl daemon-reload
sudo systemctl reset-failed

echo ""
echo -e "${GREEN}Service uninstalled successfully!${NC}"
echo ""

