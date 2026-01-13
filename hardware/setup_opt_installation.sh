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

# Create staging directory and clone repository
echo "Setting up staging directory: $STAGING_DIR..."

# Check if staging directory already exists and has content
if [ -d "$STAGING_DIR/.git" ]; then
    echo "Staging directory already contains a git repository, skipping initial clone."
    chown -R "$CURRENT_USER:$CURRENT_USER" "$STAGING_DIR"
else
    # Get repository URL from production directory
    REPO_URL=""
    if [ -d "$PRODUCTION_DIR/.git" ]; then
        cd "$PRODUCTION_DIR"
        REPO_URL=$(git remote get-url origin 2>/dev/null || echo "")
        BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
    fi
    
    if [ -n "$REPO_URL" ]; then
        echo "Cloning repository to staging directory..."
        echo "Repository: $REPO_URL"
        echo "Branch: $BRANCH"
        
        # Remove staging directory if it exists but is empty/invalid
        if [ -d "$STAGING_DIR" ]; then
            rm -rf "$STAGING_DIR"
        fi
        
        # Clone to staging (as root, but use user's SSH config if SSH URL)
        if [[ "$REPO_URL" == git@* ]]; then
            # For SSH URLs, we need to use the user's SSH keys
            # Try to find SSH key in user's home directory
            USER_HOME=$(eval echo ~$CURRENT_USER)
            SSH_KEY=""
            
            # First, check for deploy keys (keys with "rpi", "voice", "deploy" in name)
            # These are likely the correct keys for this use case
            if [ -d "$USER_HOME/.ssh" ]; then
                for key in "$USER_HOME/.ssh"/*; do
                    if [ -f "$key" ] && [[ ! "$key" =~ \.(pub|bak)$ ]]; then
                        keyname=$(basename "$key")
                        if [[ "$keyname" =~ (rpi|voice|deploy) ]]; then
                            SSH_KEY="$key"
                            echo "Found deploy key: $keyname"
                            break
                        fi
                    fi
                done
            fi
            
            # If no deploy key found, check for common SSH key locations
            if [ -z "$SSH_KEY" ]; then
                for key in "$USER_HOME/.ssh/id_ed25519_rpi_voice_toy" "$USER_HOME/.ssh/id_ed25519" "$USER_HOME/.ssh/id_rsa"; do
                    if [ -f "$key" ]; then
                        SSH_KEY="$key"
                        break
                    fi
                done
            fi
            
            if [ -n "$SSH_KEY" ]; then
                echo "Using SSH key: $SSH_KEY"
                # Clone using user's SSH key
                GIT_SSH_COMMAND="ssh -i $SSH_KEY -o StrictHostKeyChecking=no" \
                    git clone --branch "$BRANCH" --depth 1 "$REPO_URL" "$STAGING_DIR" 2>&1 || {
                    echo -e "${YELLOW}Warning: Could not clone to staging directory automatically.${NC}"
                    echo "SSH authentication may have failed. Error details above."
                    echo "This is okay - the update service will clone it on first run."
                    echo "Creating empty staging directory instead..."
                    mkdir -p "$STAGING_DIR"
                }
            else
                echo -e "${YELLOW}Warning: No SSH key found for user $CURRENT_USER.${NC}"
                echo "Trying to clone anyway (may fail if SSH key is required)..."
                git clone --branch "$BRANCH" --depth 1 "$REPO_URL" "$STAGING_DIR" 2>&1 || {
                    echo -e "${YELLOW}Could not clone to staging directory automatically.${NC}"
                    echo "This is okay - the update service will clone it on first run."
                    echo "Creating empty staging directory instead..."
                    mkdir -p "$STAGING_DIR"
                }
            fi
        else
            # For HTTPS URLs, clone normally
            git clone --branch "$BRANCH" --depth 1 "$REPO_URL" "$STAGING_DIR" 2>&1 || {
                echo -e "${YELLOW}Warning: Could not clone to staging directory automatically.${NC}"
                echo "This is okay - the update service will clone it on first run."
                echo "Creating empty staging directory instead..."
                mkdir -p "$STAGING_DIR"
            }
        fi
        
        # Set ownership
        chown -R "$CURRENT_USER:$CURRENT_USER" "$STAGING_DIR"
        echo "Staging directory initialized."
    else
        echo -e "${YELLOW}Warning: Could not detect repository URL from production directory.${NC}"
        echo "Creating empty staging directory - update service will clone on first run."
        mkdir -p "$STAGING_DIR"
        chown -R "$CURRENT_USER:$CURRENT_USER" "$STAGING_DIR"
    fi
fi

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
echo "4. Install orchestrator (required for update system):"
echo "   cd orchestrator"
echo "   sudo ./install_orchestrator.sh"
echo ""
echo "5. Migrate to version directory system:"
echo "   sudo ./migrate_to_hybrid.sh"
echo ""
echo "6. Install update system:"
echo "   cd .."
echo "   ./install_update_system.sh"
echo ""
echo "7. Install main service:"
echo "   ./install_service.sh"
echo ""
echo "=== Setup Complete ==="
echo ""
echo "Note: After migration, .env and venv will be in /var/lib/voice_ai_buddy/"
echo "Edit .env at: /var/lib/voice_ai_buddy/.env"
echo ""

