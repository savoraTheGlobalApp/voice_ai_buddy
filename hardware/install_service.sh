#!/bin/bash
# Installation script for Voice AI Buddy systemd service
# This script installs and enables the service to start on boot

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HARDWARE_DIR="$SCRIPT_DIR"
PROJECT_ROOT="$(dirname "$HARDWARE_DIR")"

echo -e "${GREEN}=== Voice AI Buddy Service Installation ===${NC}"
echo ""

# Check if running as root (we need sudo for systemd operations)
if [ "$EUID" -eq 0 ]; then
    echo -e "${RED}Error: Do not run this script as root. It will use sudo when needed.${NC}"
    exit 1
fi

# Get current user
CURRENT_USER="$USER"
CURRENT_HOME="$HOME"

echo "Installing service for user: $CURRENT_USER"
echo "Project directory: $PROJECT_ROOT"
echo "Hardware directory: $HARDWARE_DIR"
echo ""

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

# Check if .env file exists
if [ ! -f "$HARDWARE_DIR/.env" ]; then
    echo -e "${YELLOW}Warning: .env file not found at $HARDWARE_DIR/.env${NC}"
    echo "The service may not work correctly without proper configuration."
    echo ""
    echo "Continue anyway? (y/n)"
    read -r response
    if [ "$response" != "y" ] && [ "$response" != "Y" ]; then
        echo "Installation cancelled."
        exit 1
    fi
fi

# Create systemd service file with correct paths
SERVICE_FILE="$HARDWARE_DIR/voice-ai-buddy.service"
TEMP_SERVICE_FILE="/tmp/voice-ai-buddy.service.$$"
VENV_BIN="$HARDWARE_DIR/venv/bin"

echo "Creating systemd service file..."

# Replace placeholders in service file
sed -e "s|REPLACE_USER|$CURRENT_USER|g" \
    -e "s|REPLACE_HARDWARE_DIR|$HARDWARE_DIR|g" \
    -e "s|REPLACE_VENV_BIN|$VENV_BIN|g" \
    "$SERVICE_FILE" > "$TEMP_SERVICE_FILE"

# Verify the service file paths are correct
if ! grep -q "$HARDWARE_DIR" "$TEMP_SERVICE_FILE"; then
    echo -e "${RED}Error: Failed to update service file paths${NC}"
    exit 1
fi

# Copy service file to systemd directory
SYSTEMD_SERVICE="/etc/systemd/system/voice-ai-buddy.service"
echo "Installing service file to $SYSTEMD_SERVICE..."

sudo cp "$TEMP_SERVICE_FILE" "$SYSTEMD_SERVICE"
sudo chmod 644 "$SYSTEMD_SERVICE"
rm "$TEMP_SERVICE_FILE"

# Reload systemd daemon
echo "Reloading systemd daemon..."
sudo systemctl daemon-reload

# Enable service to start on boot
echo "Enabling service to start on boot..."
sudo systemctl enable voice-ai-buddy.service

# Check if user wants to start the service now
echo ""
echo -e "${GREEN}Service installed successfully!${NC}"
echo ""
echo "Service status:"
sudo systemctl status voice-ai-buddy.service --no-pager -l || true
echo ""
echo "What would you like to do?"
echo "1. Start the service now"
echo "2. Just enable it (it will start on next boot)"
read -r choice

case $choice in
    1)
        echo "Starting service..."
        sudo systemctl start voice-ai-buddy.service
        sleep 2
        echo ""
        echo "Service status:"
        sudo systemctl status voice-ai-buddy.service --no-pager -l
        echo ""
        echo -e "${GREEN}Service started!${NC}"
        echo "To view logs: sudo journalctl -u voice-ai-buddy.service -f"
        ;;
    2)
        echo -e "${GREEN}Service enabled. It will start automatically on next boot.${NC}"
        ;;
    *)
        echo -e "${YELLOW}Service installed but not started.${NC}"
        echo "To start it manually: sudo systemctl start voice-ai-buddy.service"
        ;;
esac

echo ""
echo "=== Installation Complete ==="
echo ""
echo "Useful commands:"
echo "  Start service:    sudo systemctl start voice-ai-buddy.service"
echo "  Stop service:     sudo systemctl stop voice-ai-buddy.service"
echo "  Restart service:  sudo systemctl restart voice-ai-buddy.service"
echo "  View logs:        sudo journalctl -u voice-ai-buddy.service -f"
echo "  Check status:     sudo systemctl status voice-ai-buddy.service"
echo "  Disable service:  sudo systemctl disable voice-ai-buddy.service"
echo ""

