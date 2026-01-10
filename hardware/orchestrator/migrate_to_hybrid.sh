#!/bin/bash
# Migrate from current update system to hybrid robust system

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}=== Migrating to Hybrid Update System ===${NC}"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Error: This script must be run with sudo${NC}"
    exit 1
fi

CURRENT_USER="${SUDO_USER:-$USER}"
PRODUCTION_DIR="/opt/voice_ai_buddy"
PRODUCTION_V1="/opt/voice_ai_buddy_v1"
PRODUCTION_V2="/opt/voice_ai_buddy_v2"
STATE_DIR="/var/lib/voice_ai_buddy"
SHARED_VENV="$STATE_DIR/venv"
SHARED_ENV="$STATE_DIR/.env"

echo "This script will:"
echo "1. Backup current production to v1"
echo "2. Create v2 directory for future updates"
echo "3. Move venv and .env to shared location"
echo "4. Create symlink from /opt/voice_ai_buddy to v1"
echo ""
read -p "Continue? (y/n): " confirm
if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
    echo "Migration cancelled"
    exit 0
fi

# Step 1: Backup current production to v1
echo ""
echo "Step 1: Creating v1 from current production..."
if [ -d "$PRODUCTION_DIR" ]; then
    if [ -d "$PRODUCTION_V1" ]; then
        echo -e "${YELLOW}Warning: v1 already exists, removing...${NC}"
        rm -rf "$PRODUCTION_V1"
    fi
    
    # Copy production to v1 (excluding venv and .env - we'll move those separately)
    echo "Copying production to v1..."
    cp -r "$PRODUCTION_DIR" "$PRODUCTION_V1"
    
    # Remove venv and .env from v1 (they'll be in shared location)
    if [ -d "$PRODUCTION_V1/hardware/venv" ]; then
        rm -rf "$PRODUCTION_V1/hardware/venv"
    fi
    if [ -f "$PRODUCTION_V1/hardware/.env" ]; then
        rm -f "$PRODUCTION_V1/hardware/.env"
    fi
    
    echo -e "${GREEN}v1 created successfully${NC}"
else
    echo -e "${RED}Error: Production directory not found: $PRODUCTION_DIR${NC}"
    exit 1
fi

# Step 2: Create v2 directory
echo ""
echo "Step 2: Creating v2 directory..."
mkdir -p "$PRODUCTION_V2"
chown -R "$CURRENT_USER:$CURRENT_USER" "$PRODUCTION_V2"
echo -e "${GREEN}v2 directory created${NC}"

# Step 3: Move venv and .env to shared location
echo ""
echo "Step 3: Moving shared resources..."

# Move venv
if [ -d "$PRODUCTION_DIR/hardware/venv" ]; then
    if [ -d "$SHARED_VENV" ]; then
        echo -e "${YELLOW}Warning: Shared venv already exists, backing up...${NC}"
        mv "$SHARED_VENV" "${SHARED_VENV}.backup.$(date +%s)"
    fi
    echo "Moving venv to shared location..."
    mv "$PRODUCTION_DIR/hardware/venv" "$SHARED_VENV"
    chown -R "$CURRENT_USER:$CURRENT_USER" "$SHARED_VENV"
    echo -e "${GREEN}Venv moved to shared location${NC}"
else
    echo -e "${YELLOW}Warning: No venv found in production, will be created on first update${NC}"
fi

# Move .env
if [ -f "$PRODUCTION_DIR/hardware/.env" ]; then
    if [ -f "$SHARED_ENV" ]; then
        echo -e "${YELLOW}Warning: Shared .env already exists, backing up...${NC}"
        cp "$SHARED_ENV" "${SHARED_ENV}.backup.$(date +%s)"
    fi
    echo "Moving .env to shared location..."
    cp "$PRODUCTION_DIR/hardware/.env" "$SHARED_ENV"
    chown "$CURRENT_USER:$CURRENT_USER" "$SHARED_ENV"
    echo -e "${GREEN}.env moved to shared location${NC}"
else
    echo -e "${YELLOW}Warning: No .env found in production${NC}"
fi

# Step 4: Create symlink
echo ""
echo "Step 4: Creating symlink..."
if [ -L "$PRODUCTION_DIR" ] || [ -d "$PRODUCTION_DIR" ]; then
    if [ -L "$PRODUCTION_DIR" ]; then
        echo "Removing existing symlink..."
        rm "$PRODUCTION_DIR"
    else
        echo -e "${YELLOW}Warning: Production directory exists but is not a symlink${NC}"
        echo "Backing up to production.old..."
        mv "$PRODUCTION_DIR" "${PRODUCTION_DIR}.old"
    fi
fi

echo "Creating symlink to v1..."
ln -sf "$PRODUCTION_V1" "$PRODUCTION_DIR"
chown -h "$CURRENT_USER:$CURRENT_USER" "$PRODUCTION_DIR"
echo -e "${GREEN}Symlink created${NC}"

# Step 5: Backup old apply_update.py
echo ""
echo "Step 5: Backing up old update script..."
if [ -f "$PRODUCTION_V1/hardware/apply_update.py" ]; then
    cp "$PRODUCTION_V1/hardware/apply_update.py" "$PRODUCTION_V1/hardware/apply_update_old.py"
    echo -e "${GREEN}Old script backed up to apply_update_old.py${NC}"
fi

# Step 6: Update application to use shared venv and .env
echo ""
echo "Step 6: Creating symlinks in v1 for shared resources..."
# Create symlinks in v1 to shared resources (for compatibility)
if [ -d "$SHARED_VENV" ] && [ ! -d "$PRODUCTION_V1/hardware/venv" ]; then
    ln -sf "$SHARED_VENV" "$PRODUCTION_V1/hardware/venv"
    echo "Created venv symlink in v1"
fi

if [ -f "$SHARED_ENV" ] && [ ! -f "$PRODUCTION_V1/hardware/.env" ]; then
    ln -sf "$SHARED_ENV" "$PRODUCTION_V1/hardware/.env"
    echo "Created .env symlink in v1"
fi

echo ""
echo -e "${GREEN}=== Migration Complete! ===${NC}"
echo ""
echo "Summary:"
echo "- v1 created from current production: $PRODUCTION_V1"
echo "- v2 directory created: $PRODUCTION_V2"
echo "- Shared venv: $SHARED_VENV"
echo "- Shared .env: $SHARED_ENV"
echo "- Symlink: $PRODUCTION_DIR -> $PRODUCTION_V1"
echo ""
echo "Next steps:"
echo "1. Update service file to use new orchestrator"
echo "2. Test the system"
echo "3. Remove old backup files if everything works"

