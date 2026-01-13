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

# Determine if we're using /opt/ or local installation
if [ -d "/opt/voice_ai_buddy" ]; then
    # Using /opt/ installation
    PRODUCTION_DIR="/opt/voice_ai_buddy"
    HARDWARE_DIR="$PRODUCTION_DIR/hardware"
    echo "Detected /opt/ installation"
else
    # Using local installation (legacy)
    HARDWARE_DIR="$SCRIPT_DIR"
    PRODUCTION_DIR="$(dirname "$HARDWARE_DIR")"
    echo "Using local installation (legacy mode)"
fi

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
echo "Production directory: $PRODUCTION_DIR"
echo "Hardware directory: $HARDWARE_DIR"
echo ""

# Check if shared virtual environment exists (hybrid system)
SHARED_VENV="/var/lib/voice_ai_buddy/venv"
if [ ! -d "$SHARED_VENV" ]; then
    echo -e "${RED}Error: Shared virtual environment not found at $SHARED_VENV${NC}"
    echo "The hybrid update system requires a shared venv at /var/lib/voice_ai_buddy/venv"
    echo "Please ensure the hybrid system is set up correctly."
    exit 1
fi

# Check if orchestrator exists (hybrid system)
ORCHESTRATOR_DIR="/opt/voice_ai_buddy_orchestrator"
if [ ! -d "$ORCHESTRATOR_DIR" ]; then
    echo -e "${RED}Error: Orchestrator directory not found at $ORCHESTRATOR_DIR${NC}"
    echo "The hybrid update system requires the orchestrator to be installed."
    echo "Please run the orchestrator installation script first."
    exit 1
fi

# Check if Python module can be imported from shared venv
echo "Verifying Python installation..."
if ! "$SHARED_VENV/bin/python" -c "import rpi_client" 2>/dev/null; then
    echo -e "${RED}Error: Cannot import rpi_client module from shared venv${NC}"
    echo "Please ensure the shared virtual environment is set up correctly."
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

echo "Creating systemd service file..."

# Replace placeholders in service file (hybrid system uses fixed paths for venv and orchestrator)
sed -e "s|REPLACE_USER|$CURRENT_USER|g" \
    -e "s|REPLACE_HARDWARE_DIR|$HARDWARE_DIR|g" \
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

