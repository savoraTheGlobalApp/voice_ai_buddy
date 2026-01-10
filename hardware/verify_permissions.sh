#!/bin/bash
# Update System Permission Verification Script
# Run this script to verify all permissions are correct

SERVICE_USER="${1:-laddu}"  # Default to 'laddu' if not provided
PRODUCTION_DIR="/opt/voice_ai_buddy"
STAGING_DIR="/opt/voice_ai_buddy_staging"
STATE_DIR="/var/lib/voice_ai_buddy"

echo "=== Update System Permission Verification ==="
echo "Service User: $SERVICE_USER"
echo ""

# Check if running as correct user
if [ "$USER" != "$SERVICE_USER" ]; then
    echo "⚠️  Warning: Running as $USER, but service runs as $SERVICE_USER"
    echo "   Some checks may not be accurate."
    echo ""
fi

# Function to check directory permissions
check_dir() {
    local path=$1
    local required_user=$2
    
    if [ ! -d "$path" ]; then
        echo "❌ $path - DOES NOT EXIST"
        return 1
    fi
    
    local owner=$(stat -c "%U" "$path" 2>/dev/null || stat -f "%Su" "$path" 2>/dev/null)
    local perms=$(stat -c "%a" "$path" 2>/dev/null || stat -f "%OLp" "$path" 2>/dev/null)
    
    if [ "$owner" = "$required_user" ]; then
        echo "✅ $path - Owner: $owner, Perms: $perms"
    else
        echo "❌ $path - Owner: $owner (expected: $required_user), Perms: $perms"
    fi
}

# Function to check file permissions
check_file() {
    local path=$1
    local required_user=$2
    
    if [ ! -f "$path" ]; then
        echo "⚠️  $path - DOES NOT EXIST (may be created later)"
        return 1
    fi
    
    local owner=$(stat -c "%U" "$path" 2>/dev/null || stat -f "%Su" "$path" 2>/dev/null)
    local perms=$(stat -c "%a" "$path" 2>/dev/null || stat -f "%OLp" "$path" 2>/dev/null)
    
    if [ "$owner" = "$required_user" ]; then
        echo "✅ $path - Owner: $owner, Perms: $perms"
    else
        echo "❌ $path - Owner: $owner (expected: $required_user), Perms: $perms"
    fi
}

# Function to check executable
check_executable() {
    local path=$1
    
    if [ -x "$path" ]; then
        echo "✅ $path - Executable"
    else
        echo "❌ $path - NOT EXECUTABLE or NOT FOUND"
    fi
}

# Check directories
echo "=== Directory Permissions ==="
check_dir "$PRODUCTION_DIR" "$SERVICE_USER"
check_dir "$STAGING_DIR" "$SERVICE_USER"
check_dir "$STATE_DIR" "$SERVICE_USER"
check_dir "$PRODUCTION_DIR/hardware" "$SERVICE_USER"
if [ -d "$PRODUCTION_DIR/hardware/venv" ]; then
    check_dir "$PRODUCTION_DIR/hardware/venv" "$SERVICE_USER"
else
    echo "⚠️  $PRODUCTION_DIR/hardware/venv - Does not exist (will be created by apply_update.py)"
fi
echo ""

# Check state files
echo "=== State Files ==="
check_file "$STATE_DIR/update_state.txt" "$SERVICE_USER"
check_file "$STATE_DIR/current_version.txt" "$SERVICE_USER"
check_file "$STATE_DIR/update.log" "$SERVICE_USER"
echo ""

# Check executables
echo "=== Required Executables ==="
check_executable "/usr/bin/python3"
check_executable "/usr/bin/git"
if [ -f "$PRODUCTION_DIR/hardware/venv/bin/python" ]; then
    check_executable "$PRODUCTION_DIR/hardware/venv/bin/python"
else
    echo "⚠️  $PRODUCTION_DIR/hardware/venv/bin/python - Does not exist (will be created by apply_update.py)"
fi
echo ""

# Check SSH key (if using SSH)
SSH_KEYS=(
    "$HOME/.ssh/id_ed25519_rpi_voice_toy"
    "$HOME/.ssh/id_rsa"
    "$HOME/.ssh/id_ed25519"
)

FOUND_KEY=false
for key in "${SSH_KEYS[@]}"; do
    if [ -f "$key" ]; then
        FOUND_KEY=true
        break
    fi
done

if [ "$FOUND_KEY" = true ]; then
    echo "=== SSH Keys ==="
    for key in "${SSH_KEYS[@]}"; do
        if [ -f "$key" ]; then
            perms=$(stat -c "%a" "$key" 2>/dev/null || stat -f "%OLp" "$key" 2>/dev/null)
            if [ "$perms" = "600" ] || [ "$perms" = "0600" ]; then
                echo "✅ $key - Perms: $perms (correct)"
            else
                echo "❌ $key - Perms: $perms (should be 600)"
            fi
        fi
    done
    echo ""
fi

# Check write permissions
echo "=== Write Permission Tests ==="
echo "Testing write access as $SERVICE_USER..."

# Test state directory write
if sudo -u "$SERVICE_USER" touch "$STATE_DIR/.test_write" 2>/dev/null; then
    sudo -u "$SERVICE_USER" rm -f "$STATE_DIR/.test_write" 2>/dev/null
    echo "✅ Can write to $STATE_DIR"
else
    echo "❌ Cannot write to $STATE_DIR"
fi

# Test staging directory write
if sudo -u "$SERVICE_USER" touch "$STAGING_DIR/.test_write" 2>/dev/null; then
    sudo -u "$SERVICE_USER" rm -f "$STAGING_DIR/.test_write" 2>/dev/null
    echo "✅ Can write to $STAGING_DIR"
else
    echo "❌ Cannot write to $STAGING_DIR"
fi

# Test production directory write
if sudo -u "$SERVICE_USER" touch "$PRODUCTION_DIR/.test_write" 2>/dev/null; then
    sudo -u "$SERVICE_USER" rm -f "$PRODUCTION_DIR/.test_write" 2>/dev/null
    echo "✅ Can write to $PRODUCTION_DIR"
else
    echo "❌ Cannot write to $PRODUCTION_DIR"
fi

echo ""
echo "=== Verification Complete ==="
echo ""
echo "If you see any ❌ errors, fix them with:"
echo "  sudo chown -R $SERVICE_USER:$SERVICE_USER <path>"
echo "  sudo chmod 600 <ssh-key>  # For SSH keys"
echo ""
echo "Quick fix all permissions:"
echo "  sudo chown -R $SERVICE_USER:$SERVICE_USER $STATE_DIR"
echo "  sudo chown -R $SERVICE_USER:$SERVICE_USER $STAGING_DIR"
echo "  sudo chown -R $SERVICE_USER:$SERVICE_USER $PRODUCTION_DIR"
echo ""

