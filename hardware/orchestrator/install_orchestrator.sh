#!/bin/bash
# Install the update orchestrator (fixed, never updated)

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}=== Installing Voice AI Buddy Update Orchestrator ===${NC}"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Error: This script must be run with sudo${NC}"
    exit 1
fi

ORCHESTRATOR_DIR="/opt/voice_ai_buddy_orchestrator"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Create orchestrator directory
echo "Creating orchestrator directory..."
mkdir -p "$ORCHESTRATOR_DIR"

# Copy orchestrator script
echo "Installing orchestrator script..."
cp "$SCRIPT_DIR/apply_update.py" "$ORCHESTRATOR_DIR/apply_update.py"
chmod +x "$ORCHESTRATOR_DIR/apply_update.py"

# Set ownership
CURRENT_USER="${SUDO_USER:-$USER}"
chown -R "$CURRENT_USER:$CURRENT_USER" "$ORCHESTRATOR_DIR"

echo -e "${GREEN}Orchestrator installed successfully!${NC}"
echo ""
echo "Orchestrator location: $ORCHESTRATOR_DIR"
echo ""
echo "Next steps:"
echo "1. Run migration script to migrate from current system to new system"
echo "2. Update service file to use new orchestrator"

