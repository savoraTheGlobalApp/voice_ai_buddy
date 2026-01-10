# Update System: Process, Permissions, and Verification

This document explains the complete update system process, required permissions, and how to verify them on your Raspberry Pi.

## Update System Process Flow

### 1. Background Update Check (Update Daemon)

**Service:** `voice-ai-buddy-updater.service`  
**User:** Service user (e.g., `laddu`)  
**Runs:** Continuously in background, checks every 1 hour

**Process:**
1. Waits 60 seconds after boot
2. Checks GitHub for latest commit hash
3. Compares with current version
4. If update available:
   - Sets state to `downloading`
   - Updates staging directory (git fetch + reset)
   - Sets state to `ready_to_apply`
5. Repeats every hour

### 2. Update Application (On Boot)

**Service:** `voice-ai-buddy.service` (ExecStartPre)  
**User:** Service user (e.g., `laddu`)  
**Runs:** Before main application starts on boot

**Process:**
1. Checks if state is `ready_to_apply`
2. If yes:
   - Creates backup of production → `/var/lib/voice_ai_buddy/backup/`
   - Removes old production directory
   - Copies staging to production
   - Restores local files (.env) from backup
   - Fixes ownership of production directory
   - Creates/updates virtual environment
   - Installs dependencies
   - Sets state to `completed`
3. If anything fails:
   - Rolls back from backup
   - Sets state to `failed`

### 3. Main Application Start

**Service:** `voice-ai-buddy.service` (ExecStart)  
**User:** Service user (e.g., `laddu`)  
**Runs:** After update application completes

**Process:**
- Starts main application using venv Python

## Directory Structure

```
/opt/voice_ai_buddy/                    # Production application
  ├── hardware/
  │   ├── venv/                         # Virtual environment (created by apply_update.py)
  │   ├── rpi_client/
  │   │   ├── updater.py
  │   │   └── update_daemon.py
  │   └── apply_update.py
  └── .git/                             # Git repository

/opt/voice_ai_buddy_staging/            # Staging area (persistent)
  ├── hardware/
  │   └── rpi_client/
  └── .git/                             # Git repository

/var/lib/voice_ai_buddy/                 # State directory
  ├── update_state.txt                  # Current state (idle, checking, downloading, etc.)
  ├── current_version.txt               # Current Git commit hash
  ├── update_lock                       # Lock file for concurrent operations
  ├── update.log                        # Update operation logs
  └── backup/                           # Backup of production (created during update)
```

## Required Permissions

### 1. Update Daemon (`voice-ai-buddy-updater.service`)

**User:** Service user (e.g., `laddu`)  
**Python:** `/usr/bin/python3` (system Python)

**Required Permissions:**

| Path | Permission | Operation | Why |
|------|-----------|-----------|-----|
| `/var/lib/voice_ai_buddy/` | Read/Write | Create/read/write state files | Track update state and version |
| `/opt/voice_ai_buddy_staging/` | Read/Write | Git operations (fetch, reset) | Update staging directory |
| `/opt/voice_ai_buddy/` | Read | Read current version | Compare with latest version |
| `~/.ssh/id_*` (SSH key) | Read (600) | Git SSH authentication | Access GitHub repository |
| `/usr/bin/python3` | Execute | Run Python | Execute updater daemon |
| `/usr/bin/git` | Execute | Git commands | Fetch updates from GitHub |

**Note:** The updater does NOT need:
- Write access to `/opt/voice_ai_buddy/` (production)
- Access to venv (uses system Python)
- Write access to create directories in `/opt/` (staging already exists)

### 2. Apply Update Script (`apply_update.py`)

**User:** Service user (e.g., `laddu`)  
**Python:** `/usr/bin/python3` (system Python)  
**Runs:** Via `ExecStartPre` in main service

**Required Permissions:**

| Path | Permission | Operation | Why |
|------|-----------|-----------|-----|
| `/var/lib/voice_ai_buddy/` | Read/Write | Read/write state files | Track update progress |
| `/var/lib/voice_ai_buddy/backup/` | Read/Write | Create/remove backup | Backup and rollback |
| `/opt/voice_ai_buddy_staging/` | Read | Read staging directory | Source for update |
| `/opt/voice_ai_buddy/` | Read/Write | Remove and recreate | Apply update |
| `/opt/voice_ai_buddy/hardware/venv/` | Read/Write | Create/update venv | Setup virtual environment |
| `/usr/bin/python3` | Execute | Run Python | Execute apply script |
| `/usr/bin/git` | Execute | Git commands | Get version info |
| `/usr/bin/pip` or venv pip | Execute | Install packages | Install dependencies |

**Note:** The script CANNOT:
- Create directories in `/opt/` (must already exist)
- Delete directories in `/opt/` (can only remove contents)

### 3. Main Application Service (`voice-ai-buddy.service`)

**User:** Service user (e.g., `laddu`)  
**Python:** `/opt/voice_ai_buddy/hardware/venv/bin/python` (venv Python)

**Required Permissions:**

| Path | Permission | Operation | Why |
|------|-----------|-----------|-----|
| `/opt/voice_ai_buddy/` | Read | Read application code | Run application |
| `/opt/voice_ai_buddy/hardware/venv/bin/python` | Execute | Run Python | Execute application |
| `/opt/voice_ai_buddy/hardware/.env` | Read | Read configuration | Application config |

## Permission Verification Script

Run this script on your Raspberry Pi to verify all permissions:

```bash
#!/bin/bash
# Update System Permission Verification Script

SERVICE_USER="laddu"  # Change to your service user
PRODUCTION_DIR="/opt/voice_ai_buddy"
STAGING_DIR="/opt/voice_ai_buddy_staging"
STATE_DIR="/var/lib/voice_ai_buddy"

echo "=== Update System Permission Verification ==="
echo "Service User: $SERVICE_USER"
echo ""

# Check if running as correct user
if [ "$USER" != "$SERVICE_USER" ]; then
    echo "⚠️  Warning: Running as $USER, but service runs as $SERVICE_USER"
    echo "   Some checks may not be accurate. Consider running as: sudo -u $SERVICE_USER"
    echo ""
fi

# Function to check directory permissions
check_dir() {
    local path=$1
    local required_user=$2
    local required_perms=$3
    
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
check_dir "$PRODUCTION_DIR" "$SERVICE_USER" "755"
check_dir "$STAGING_DIR" "$SERVICE_USER" "755"
check_dir "$STATE_DIR" "$SERVICE_USER" "755"
check_dir "$PRODUCTION_DIR/hardware" "$SERVICE_USER" "755"
check_dir "$PRODUCTION_DIR/hardware/venv" "$SERVICE_USER" "755" 2>/dev/null || echo "⚠️  $PRODUCTION_DIR/hardware/venv - Does not exist (will be created by apply_update.py)"
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
check_executable "$PRODUCTION_DIR/hardware/venv/bin/python" 2>/dev/null || echo "⚠️  $PRODUCTION_DIR/hardware/venv/bin/python - Does not exist (will be created by apply_update.py)"
echo ""

# Check SSH key (if using SSH)
if [ -f "$HOME/.ssh/id_ed25519_rpi_voice_toy" ] || [ -f "$HOME/.ssh/id_rsa" ] || [ -f "$HOME/.ssh/id_ed25519" ]; then
    echo "=== SSH Keys ==="
    for key in "$HOME/.ssh/id_ed25519_rpi_voice_toy" "$HOME/.ssh/id_rsa" "$HOME/.ssh/id_ed25519"; do
        if [ -f "$key" ]; then
            local perms=$(stat -c "%a" "$key" 2>/dev/null || stat -f "%OLp" "$key" 2>/dev/null)
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
```

## Quick Permission Fix Commands

If verification shows permission issues, use these commands:

```bash
# Set service user (change to your actual user)
SERVICE_USER="laddu"

# Fix state directory
sudo chown -R $SERVICE_USER:$SERVICE_USER /var/lib/voice_ai_buddy
sudo chmod 755 /var/lib/voice_ai_buddy

# Fix staging directory
sudo chown -R $SERVICE_USER:$SERVICE_USER /opt/voice_ai_buddy_staging
sudo chmod 755 /opt/voice_ai_buddy_staging

# Fix production directory
sudo chown -R $SERVICE_USER:$SERVICE_USER /opt/voice_ai_buddy
sudo chmod 755 /opt/voice_ai_buddy

# Fix SSH key permissions (if using SSH)
chmod 600 ~/.ssh/id_ed25519_rpi_voice_toy  # or your SSH key path
```

## Common Permission Issues and Solutions

### Issue 1: "Permission denied" when updater tries to write to staging

**Symptom:** Updater service fails with permission errors

**Solution:**
```bash
sudo chown -R $SERVICE_USER:$SERVICE_USER /opt/voice_ai_buddy_staging
```

### Issue 2: "Permission denied" when apply_update.py tries to create backup

**Symptom:** Update fails during backup creation

**Solution:**
```bash
sudo chown -R $SERVICE_USER:$SERVICE_USER /var/lib/voice_ai_buddy
```

### Issue 3: "Permission denied" when trying to remove production directory

**Symptom:** Update fails when removing old production

**Solution:**
```bash
sudo chown -R $SERVICE_USER:$SERVICE_USER /opt/voice_ai_buddy
```

### Issue 4: SSH authentication fails

**Symptom:** Updater can't fetch from GitHub

**Solution:**
```bash
# Fix SSH key permissions
chmod 600 ~/.ssh/id_ed25519_rpi_voice_toy  # or your key path

# Verify SSH key is accessible by service user
sudo -u $SERVICE_USER ssh -i ~/.ssh/id_ed25519_rpi_voice_toy -T git@github.com
```

### Issue 5: Virtual environment creation fails

**Symptom:** apply_update.py fails to create venv

**Solution:**
```bash
# Ensure production directory is writable
sudo chown -R $SERVICE_USER:$SERVICE_USER /opt/voice_ai_buddy

# Manually create venv if needed (as service user)
sudo -u $SERVICE_USER python3 -m venv /opt/voice_ai_buddy/hardware/venv
```

## Service User Detection

The update system detects the service user in this order:
1. `SUDO_USER` environment variable (when run with sudo)
2. `USER` environment variable
3. Current process UID (fallback)

To verify which user the services run as:

```bash
# Check updater service
sudo systemctl show voice-ai-buddy-updater.service | grep User

# Check main service
sudo systemctl show voice-ai-buddy.service | grep User
```

## Testing Permissions

Test each component's permissions:

```bash
# Test as service user
SERVICE_USER="laddu"

# Test updater can write to state directory
sudo -u $SERVICE_USER touch /var/lib/voice_ai_buddy/.test
sudo -u $SERVICE_USER rm /var/lib/voice_ai_buddy/.test

# Test updater can write to staging
sudo -u $SERVICE_USER touch /opt/voice_ai_buddy_staging/.test
sudo -u $SERVICE_USER rm /opt/voice_ai_buddy_staging/.test

# Test apply_update can write to production
sudo -u $SERVICE_USER touch /opt/voice_ai_buddy/.test
sudo -u $SERVICE_USER rm /opt/voice_ai_buddy/.test

# Test git operations
sudo -u $SERVICE_USER git -C /opt/voice_ai_buddy_staging status
```

## Summary

**Key Points:**
1. **Updater service** uses system Python, doesn't need venv
2. **All directories** must be owned by service user
3. **SSH keys** must have 600 permissions
4. **State directory** (`/var/lib/voice_ai_buddy`) must be writable
5. **Staging directory** must be writable (but directory itself must exist)
6. **Production directory** must be writable (but directory itself must exist)
7. **Backup directory** is created in state directory (no /opt/ permission needed)

**Critical:** The service user CANNOT create directories in `/opt/`, so staging and production directories must already exist (created by setup scripts with sudo).

