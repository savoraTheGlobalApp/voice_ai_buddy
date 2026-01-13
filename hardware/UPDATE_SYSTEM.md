# Automatic Update System - Complete Guide

This document provides a comprehensive guide to the automatic update system for Voice AI Buddy on Raspberry Pi.

The system uses a hybrid architecture with version directories, symlinks, and shared resources for atomic, power-loss-safe updates.

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Installation](#installation)
4. [Configuration](#configuration)
5. [How It Works](#how-it-works)
6. [Managing Environment Variables](#managing-environment-variables)
7. [Changing Tracked Branch](#changing-tracked-branch)
8. [Testing & Power Cut Recovery](#testing--power-cut-recovery)
9. [Monitoring](#monitoring)
10. [Troubleshooting](#troubleshooting)
11. [Service Management](#service-management)

---

## Overview

The update system automatically fetches code changes from GitHub and applies them atomically on the next boot, ensuring:

- ✅ **Atomic updates**: Symlink swap is a single operation, no partial states
- ✅ **Power loss safe**: Old version always intact, can rollback instantly
- ✅ **Fast startup**: Updates don't block application startup
- ✅ **Background operation**: Updates download silently in the background
- ✅ **Interruption handling**: Gracefully handles power loss during any phase
- ✅ **State validation**: Handles partial writes and invalid states

## Architecture

### Directory Structure

```
/opt/voice_ai_buddy/                    # Production (symlink to v1 or v2)
├── hardware/                          # Application code
│   ├── .env → /var/lib/voice_ai_buddy/.env  # Symlink to shared .env
│   └── venv → /var/lib/voice_ai_buddy/venv  # Symlink to shared venv

/opt/voice_ai_buddy_v1/                 # Version 1 directory
├── hardware/
│   ├── .env → /var/lib/voice_ai_buddy/.env
│   └── venv → /var/lib/voice_ai_buddy/venv

/opt/voice_ai_buddy_v2/                 # Version 2 directory
├── hardware/
│   ├── .env → /var/lib/voice_ai_buddy/.env
│   └── venv → /var/lib/voice_ai_buddy/venv

/opt/voice_ai_buddy_staging/            # Staging area for updates
└── (no .env or venv - excluded during copy)

/opt/voice_ai_buddy_orchestrator/       # Fixed orchestrator (never updated)
└── apply_update.py                     # Orchestrator script

/var/lib/voice_ai_buddy/                # Shared resources and state
├── .env                                # Shared environment file (EDIT THIS)
├── venv/                               # Shared virtual environment
├── current_version.txt                 # Current Git commit hash
├── update_state.txt                    # Current update state
├── update_lock                         # Lock file for concurrent operations
└── update.log                          # Update operation logs
```

### Components

1. **Update Daemon** (`voice-ai-buddy-updater.service`)
   - Runs as a systemd service
   - Checks for updates periodically (default: 1 hour)
   - Downloads updates to staging directory
   - Manages update state

2. **Orchestrator** (`/opt/voice_ai_buddy_orchestrator/apply_update.py`)
   - **Fixed script** that never gets updated
   - Runs on boot before main application
   - Atomically applies staged updates using symlink swap
   - Handles dependency installation
   - Performs recovery on interruption

3. **Update Manager** (`rpi_client.updater`)
   - Core update logic
   - Git operations
   - State management
   - Version tracking

## Update States

The system has **7 possible states**:

| State | Description | Recovery |
|-------|-------------|----------|
| `idle` | No update in progress | Safe state |
| `checking` | Checking for updates | Auto-recovery (removes stale lock) |
| `downloading` | Downloading update to staging | Auto-recovery (removes stale lock) |
| `ready_to_apply` | Update staged, ready for next boot | Safe state |
| `applying` | Update being applied (on boot) | Auto-recovery (orchestrator) |
| `completed` | Update applied successfully | Safe state |
| `failed` | Update failed | Auto-recovery (checks staging) |

## Installation

### Step 1: Install to /opt/

For new Raspberry Pi installations, clone directly to `/opt/`:

```bash
# Clone the repository
sudo git clone <your-repo-url> /opt/voice_ai_buddy

# Or clone a specific branch:
sudo git clone -b <branch-name> <your-repo-url> /opt/voice_ai_buddy
```

**Example:**
```bash
# Using SSH
sudo git clone git@github.com:username/voice_ai_buddy.git /opt/voice_ai_buddy

# Using HTTPS
sudo git clone https://github.com/username/voice_ai_buddy.git /opt/voice_ai_buddy
```

Then run the post-installation setup script:

```bash
cd /opt/voice_ai_buddy/hardware
sudo ./setup_opt_installation.sh
```

This will:
- Set proper ownership of the cloned repository
- Create state and staging directories
- Initialize version tracking

### Step 2: Run Setup

After installation, run setup:

```bash
cd /opt/voice_ai_buddy/hardware
./setup.sh
```

This installs system dependencies, creates virtual environment, and installs Python packages.

### Step 3: Install Orchestrator

```bash
cd /opt/voice_ai_buddy/hardware/orchestrator
sudo chmod +x install_orchestrator.sh
sudo ./install_orchestrator.sh
```

This installs the orchestrator to `/opt/voice_ai_buddy_orchestrator/` (fixed location, never updated).

### Step 4: Migrate to Version Directory System

```bash
cd /opt/voice_ai_buddy/hardware/orchestrator
sudo chmod +x migrate_to_hybrid.sh
sudo ./migrate_to_hybrid.sh
```

This will:
1. Create v1 from current production
2. Create v2 directory for future updates
3. Move venv to `/var/lib/voice_ai_buddy/venv` (shared)
4. Move .env to `/var/lib/voice_ai_buddy/.env` (shared)
5. Create symlink: `/opt/voice_ai_buddy` → `v1`
6. Create symlinks in v1 for shared resources

**Important:** The migration script will ask for confirmation before proceeding.

### Step 5: Install Update System

```bash
cd /opt/voice_ai_buddy/hardware
./install_update_system.sh
```

You'll be prompted for:
- GitHub repository URL (SSH or HTTPS)
- Git branch to track (default: `main`)
- SSH private key path (if using SSH URL)
  - The script will automatically check and fix key permissions (should be 600)
  - Uses absolute path to avoid issues

### Step 6: Install Main Service

```bash
cd /opt/voice_ai_buddy/hardware
./install_service.sh
```

The main service will now:
- Apply updates on boot (if available) using orchestrator
- Start the application with latest code
- Use shared venv from `/var/lib/voice_ai_buddy/venv`

## Configuration

### Environment Variables

Set in systemd service file:

- `GITHUB_REPO_URL`: Repository URL (required)
- `GITHUB_BRANCH`: Branch to track (default: `main`)
- `GIT_SSH_COMMAND`: SSH command for authentication (if using SSH)

### Update Check Interval

Default: 1 hour (3600 seconds)

To change, modify `check_interval` in `rpi_client/updater.py`:

```python
self.check_interval = 3600  # Change to desired interval
```

### Initial Delay

Default: 60 seconds after boot before first check

To change, modify `initial_delay` in `rpi_client/updater.py`:

```python
self.initial_delay = 60  # Change to desired delay
```

## How It Works

### Update Flow

1. **Background Check** (Update Daemon)
   - Waits 60 seconds after boot
   - Checks GitHub for latest commit hash on tracked branch
   - Compares with current version
   - If update available:
     - Sets state to `downloading`
     - Downloads to staging directory (`git fetch` + `git reset`)
     - Verifies staging version matches expected
     - Sets state to `ready_to_apply`

2. **Boot Sequence** (Orchestrator)
   - `ExecStartPre` runs orchestrator (`/opt/voice_ai_buddy_orchestrator/apply_update.py`)
   - If state is `ready_to_apply`:
     - Sets state to `applying`
     - Determines target version (v1 or v2, whichever is NOT active)
     - Copies staging to target version (excluding venv and .env)
     - Creates symlink to shared .env in target version
     - Validates target version
     - Updates shared venv dependencies
     - **Atomically swaps symlink** (`/opt/voice_ai_buddy` → target version)
     - Updates version file
     - Sets state to `completed`
   - Starts main application

3. **Error Handling**
   - If update fails: Rollback to previous version (swap symlink back)
   - If interrupted: Detect on next boot and recover
   - State validation handles partial writes and invalid states

### Version Tracking

- Current version stored in `/var/lib/voice_ai_buddy/current_version.txt`
- Version is Git commit hash (e.g., `a1b2c3d4...`)
- Only downloads if commit hash differs

### Atomic Updates

The system uses **symlink swapping** for true atomicity:

1. Old version (v1) remains untouched
2. New version (v2) is built separately
3. Symlink swap is a single atomic operation
4. Either old or new version is active, never corrupted
5. Can rollback instantly by changing symlink

## Managing Environment Variables

### Where to Edit .env File

**✅ Edit the shared `.env` file:**

```bash
sudo nano /var/lib/voice_ai_buddy/.env
```

**❌ Don't edit these locations** (they're symlinks):
- `/opt/voice_ai_buddy/hardware/.env` → Symlink
- `/opt/voice_ai_buddy_v1/hardware/.env` → Symlink
- `/opt/voice_ai_buddy_v2/hardware/.env` → Symlink

### How Changes Are Reflected

1. **Edit shared `.env`**: `/var/lib/voice_ai_buddy/.env`
2. **Changes are immediate**: All symlinks point to the same file
3. **No restart needed**: Application reads from symlink
4. **Works for all versions**: v1, v2, and current production all use the same file

### Verifying Symlinks

```bash
# Check that symlinks exist
ls -la /opt/voice_ai_buddy/hardware/.env
ls -la /opt/voice_ai_buddy_v1/hardware/.env
ls -la /opt/voice_ai_buddy_v2/hardware/.env

# All should show: .env -> /var/lib/voice_ai_buddy/.env
```

### Restart Service (if needed)

```bash
sudo systemctl restart voice-ai-buddy.service
```

## Changing Tracked Branch

### Step 1: Edit the Updater Service File

```bash
sudo nano /etc/systemd/system/voice-ai-buddy-updater.service
```

Find the line with `GITHUB_BRANCH` and change it:

```ini
# Before
Environment="GITHUB_BRANCH=main"

# After (example)
Environment="GITHUB_BRANCH=feature/rpi_streaming_chat_and_TTS"
```

### Step 2: Reload and Restart

```bash
sudo systemctl daemon-reload
sudo systemctl restart voice-ai-buddy-updater.service
```

### Step 3: Update Staging Directory

```bash
cd /opt/voice_ai_buddy_staging
sudo git fetch origin --prune
sudo git checkout -f feature/rpi_streaming_chat_and_TTS
```

### Step 4: Verify

```bash
# Check service is using new branch
sudo systemctl show voice-ai-buddy-updater.service | grep GITHUB_BRANCH

# Check logs
sudo journalctl -u voice-ai-buddy-updater.service -n 20
```

### What Happens Next

1. Updater checks new branch every hour (or immediately after restart)
2. If branch has new commits, downloads to staging
3. On next boot, orchestrator applies the update
4. Production code switches to the new branch

## Testing & Power Cut Recovery

### Power Cut Recovery Coverage

| State | Recovery | How It Works |
|-------|----------|--------------|
| `checking` | ✅ Covered | Removes stale lock (>60s old), resets to `idle` |
| `downloading` | ✅ Covered | Removes stale lock (>60s old), resets to `idle` |
| `applying` | ✅ Covered | Orchestrator detects on next boot, attempts recovery |
| `ready_to_apply` | ✅ Safe | No recovery needed (safe state) |
| `completed` | ✅ Safe | No recovery needed (safe state) |
| `failed` | ✅ Covered | Checks if staging is valid, resets if valid |
| `idle` | ✅ Safe | No recovery needed (safe state) |

### Testing Power Cut During Apply Phase

**Method 1: Simulate Power Cut (Recommended)**

```bash
# 1. Ensure state is ready_to_apply
cat /var/lib/voice_ai_buddy/update_state.txt

# 2. Trigger orchestrator manually
sudo /opt/voice_ai_buddy_orchestrator/apply_update.py

# 3. In another terminal, quickly interrupt it
sudo pkill -f "apply_update.py"

# 4. Check state (should be "applying")
cat /var/lib/voice_ai_buddy/update_state.txt

# 5. Reboot to test recovery
sudo reboot

# 6. After reboot, check logs
sudo journalctl -u voice-ai-buddy.service -n 50 | grep -i orchestrator
```

**Method 2: Actual Power Cut**

1. Ensure state is `ready_to_apply`
2. Run `sudo reboot`
3. Immediately unplug power (within 1-2 seconds)
4. Reconnect power and check recovery

### Testing Partial State Writes

The system handles partial state writes (e.g., "appl" instead of "applying"):

```bash
# Create partial state
echo "appl" | sudo tee /var/lib/voice_ai_buddy/update_state.txt

# Run orchestrator
sudo /opt/voice_ai_buddy_orchestrator/apply_update.py

# Check logs - should detect and fix
sudo journalctl -u voice-ai-buddy.service -n 20
```

## Monitoring

### Check Update Daemon Status

```bash
sudo systemctl status voice-ai-buddy-updater.service
```

### View Update Logs

```bash
# Real-time logs
sudo journalctl -u voice-ai-buddy-updater.service -f

# Recent logs
sudo journalctl -u voice-ai-buddy-updater.service -n 100

# Update operation log
cat /var/lib/voice_ai_buddy/update.log
```

### Check Update State

```bash
cat /var/lib/voice_ai_buddy/update_state.txt
cat /var/lib/voice_ai_buddy/current_version.txt
```

### Manual Update Check

```bash
# Trigger update check
sudo systemctl restart voice-ai-buddy-updater.service
```

### Verify System Type

```bash
# Check if using version directory system (should be symlink)
ls -la /opt/voice_ai_buddy
# Should show: /opt/voice_ai_buddy -> /opt/voice_ai_buddy_v1
```

## Troubleshooting

### Update Daemon Not Running

1. Check service status:
   ```bash
   sudo systemctl status voice-ai-buddy-updater.service
   ```

2. Check logs:
   ```bash
   sudo journalctl -u voice-ai-buddy-updater.service -n 50
   ```

3. Verify Git credentials:
   - For SSH: Ensure SSH key is configured
   - For HTTPS: May need credentials in URL or Git credential helper

### Updates Not Being Applied

1. Check if update is staged:
   ```bash
   cat /var/lib/voice_ai_buddy/update_state.txt
   ```

2. If state is `ready_to_apply`, check main service logs:
   ```bash
   sudo journalctl -u voice-ai-buddy.service -n 50
   ```

3. Manually trigger orchestrator:
   ```bash
   sudo /opt/voice_ai_buddy_orchestrator/apply_update.py
   ```

### Git Authentication Issues

**SSH Method (Recommended):**
```bash
# Generate SSH key if needed
ssh-keygen -t ed25519 -C "rpi-updater"

# Add to GitHub as deploy key (read-only access)
cat ~/.ssh/id_ed25519.pub

# Test connection
ssh -T git@github.com
```

**Important:** If your SSH key has a passphrase, the update daemon will not be able to use it automatically. For deploy keys used by automated services, it's recommended to:
- Remove the passphrase from the deploy key (Option 1 - Recommended for deploy keys)
- Or use a passphrase-less deploy key specifically for this purpose

**HTTPS Method:**
```bash
# Use personal access token in URL
# Format: https://TOKEN@github.com/username/repo.git
# Or configure Git credential helper
git config --global credential.helper store
```

### Stale Lock File

If update is stuck, remove lock file:

```bash
sudo rm /var/lib/voice_ai_buddy/update_lock
```

### Branch Not Found Error

```bash
# Verify branch exists on remote
cd /opt/voice_ai_buddy_staging
sudo git ls-remote --heads origin | grep <branch-name>

# If not found, check available branches
sudo git ls-remote --heads origin

# Update service file with correct branch name
sudo nano /etc/systemd/system/voice-ai-buddy-updater.service
```

### Production Code Not Updating

```bash
# Check update state
cat /var/lib/voice_ai_buddy/update_state.txt

# If ready_to_apply, reboot to apply
sudo reboot

# Or manually trigger orchestrator
sudo /opt/voice_ai_buddy_orchestrator/apply_update.py
sudo systemctl restart voice-ai-buddy.service
```

### Symlink Issues

If symlinks are missing or broken:

```bash
# Check current symlink
ls -la /opt/voice_ai_buddy

# Recreate if needed (orchestrator should handle this, but if needed)
sudo rm /opt/voice_ai_buddy
sudo ln -s /opt/voice_ai_buddy_v1 /opt/voice_ai_buddy
sudo chown -h laddu:laddu /opt/voice_ai_buddy
```

### Rollback to Previous Version

Rollback is instant using symlink swap:

```bash
# Check which version is active
ls -la /opt/voice_ai_buddy

# Swap to other version
sudo rm /opt/voice_ai_buddy
sudo ln -s /opt/voice_ai_buddy_v1 /opt/voice_ai_buddy  # or v2
sudo chown -h laddu:laddu /opt/voice_ai_buddy

# Restart service
sudo systemctl restart voice-ai-buddy.service
```

## Service Management

### Start/Stop Update Daemon

```bash
sudo systemctl start voice-ai-buddy-updater.service
sudo systemctl stop voice-ai-buddy-updater.service
sudo systemctl restart voice-ai-buddy-updater.service
```

### Enable/Disable Auto-Start

```bash
sudo systemctl enable voice-ai-buddy-updater.service
sudo systemctl disable voice-ai-buddy-updater.service
```

### Main Service

```bash
sudo systemctl start voice-ai-buddy.service
sudo systemctl stop voice-ai-buddy.service
sudo systemctl restart voice-ai-buddy.service
sudo systemctl status voice-ai-buddy.service
```

## Best Practices

1. **Test Updates**: Test updates in staging before deploying to production
2. **Git Tags**: Use Git tags for version releases
3. **Branch Strategy**: Use `main` for stable, feature branches for testing
4. **Backup**: Keep backups of working versions
5. **Monitoring**: Monitor update logs regularly
6. **Credentials**: Use SSH keys with read-only deploy keys for security
7. **Edit .env Once**: Always edit `/var/lib/voice_ai_buddy/.env` (shared file)
8. **Let Orchestrator Handle Updates**: Don't manually edit production code

## Security Considerations

1. **Git Credentials**: Use SSH keys or read-only deploy keys
2. **Permissions**: State directory should be owned by service user
3. **Network**: Updates require network access to GitHub
4. **Orchestrator**: Fixed location, never updated, always available for recovery

## Maintenance

### Clean Up Old Backups

Backups are automatically cleaned up after successful updates. If you need to manually clean up:

```bash
sudo rm -rf /var/lib/voice_ai_buddy/backup
```

### Clear Update Logs

```bash
sudo truncate -s 0 /var/lib/voice_ai_buddy/update.log
```

### Reset Update State

```bash
echo "idle" | sudo tee /var/lib/voice_ai_buddy/update_state.txt
```

## Notes

- Updates are applied on **next boot**, not during current session
- Update daemon runs in background, non-blocking
- Main application starts immediately, updates happen silently
- Failed updates automatically rollback
- Interrupted updates are detected and recovered on next boot
- **Shared resources**: Virtual environment and `.env` are shared across all versions
- **Atomic updates**: Symlink swap ensures no partial states
- **State validation**: Handles partial writes and invalid states automatically
