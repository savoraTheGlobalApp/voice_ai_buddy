# Automatic Update System

This document describes the automatic update system for Voice AI Buddy on Raspberry Pi.

## Overview

The update system automatically fetches code changes from GitHub and applies them on the next boot, ensuring:
- **Fast startup**: Updates don't block application startup
- **Safe updates**: Atomic updates with rollback capability
- **Background operation**: Updates download silently in the background
- **Interruption handling**: Gracefully handles power loss during updates

## Architecture

### Directory Structure

```
/opt/voice_ai_buddy/              # Production application
/opt/voice_ai_buddy_staging/       # Staging area for updates
/var/lib/voice_ai_buddy/           # State files (version, state, logs)
  ├── current_version.txt          # Current Git commit hash
  ├── update_state.txt             # Current update state
  ├── update_lock                  # Lock file for concurrent operations
  ├── update.log                   # Update operation logs
  └── backup/                      # Temporary backup during updates (auto-cleaned)
```

### Components

1. **Update Daemon** (`rpi_client.update_daemon`)
   - Runs as a systemd service
   - Checks for updates periodically (default: 1 hour)
   - Downloads updates to staging directory
   - Manages update state

2. **Update Application Script** (`apply_update.py`)
   - Runs on boot before main application
   - Atomically applies staged updates
   - Handles dependency installation
   - Performs rollback on failure

3. **Update Manager** (`rpi_client.updater`)
   - Core update logic
   - Git operations
   - State management
   - Version tracking

## Update States

- `idle`: No update in progress
- `checking`: Checking for updates
- `downloading`: Downloading update to staging
- `ready_to_apply`: Update staged, ready for next boot
- `applying`: Update being applied (on boot)
- `completed`: Update applied successfully
- `failed`: Update failed

## Installation

### Step 1: Install to /opt/

**Option A: Direct Installation (Recommended for New Installations)**

For new Raspberry Pi installations, clone directly to `/opt/`:

```bash
# Clone the repository to /opt/voice_ai_buddy
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

### Step 3: Install Update System

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

### Step 4: Install Main Service

```bash
cd /opt/voice_ai_buddy/hardware
./install_service.sh
```

The main service will now:
- Apply updates on boot (if available)
- Start the application with latest code

## How It Works

### Update Flow

1. **Background Check** (Update Daemon)
   - Waits 60 seconds after boot
   - Checks GitHub for latest commit hash
   - Compares with current version
   - If update available:
     - Downloads to staging directory
     - Sets state to `ready_to_apply`

2. **Boot Sequence** (Main Service)
   - `ExecStartPre` runs `apply_update.py`
   - If state is `ready_to_apply`:
     - Creates backup of current production → `/var/lib/voice_ai_buddy/backup/`
     - Clears production directory (preserves `venv` and `.env`)
     - Copies staging contents to production (atomic)
     - Restores local files (`.env`) from backup
     - Fixes ownership of production directory
     - Creates/updates virtual environment if needed
     - Installs/updates dependencies from `requirements.txt`
     - Updates version file
     - Sets state to `completed`
     - Cleans up backup
   - Starts main application

3. **Error Handling**
   - If update fails: Rollback to backup
   - If interrupted: Detect on next boot and recover
   - State file tracks progress

### Version Tracking

- Current version stored in `/var/lib/voice_ai_buddy/current_version.txt`
- Version is Git commit hash (e.g., `a1b2c3d4...`)
- Only downloads if commit hash differs

## Configuration

### Environment Variables

Set in systemd service file or environment:

- `GITHUB_REPO_URL`: Repository URL (required)
- `GITHUB_BRANCH`: Branch to track (default: `main`)

### Changing the Tracked Branch

To change which branch is tracked after installation:

1. Edit the systemd service file:
   ```bash
   sudo nano /etc/systemd/system/voice-ai-buddy-updater.service
   ```

2. Update the `GITHUB_BRANCH` environment variable:
   ```ini
   Environment="GITHUB_BRANCH=dev"  # Change to your desired branch
   ```

3. Reload and restart:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl restart voice-ai-buddy-updater.service
   ```

4. Verify:
   ```bash
   sudo systemctl status voice-ai-buddy-updater.service
   sudo journalctl -u voice-ai-buddy-updater.service -n 20
   ```

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
# Trigger update check (if daemon is running)
sudo systemctl restart voice-ai-buddy-updater.service
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

3. Manually apply update:
   ```bash
   sudo /usr/bin/python3 /opt/voice_ai_buddy/hardware/apply_update.py
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

### Rollback to Previous Version

If update causes issues:

1. Stop services:
   ```bash
   sudo systemctl stop voice-ai-buddy.service
   sudo systemctl stop voice-ai-buddy-updater.service
   ```

2. Restore from backup (if exists):
   ```bash
   # Backup is located at /var/lib/voice_ai_buddy/backup/
   # Note: This is only available if an update was in progress
   # If backup exists, manually copy it back:
   sudo rm -rf /opt/voice_ai_buddy/*
   sudo cp -r /var/lib/voice_ai_buddy/backup/* /opt/voice_ai_buddy/
   sudo chown -R <service-user>:<service-user> /opt/voice_ai_buddy
   ```

3. Reset state:
   ```bash
   echo "idle" | sudo tee /var/lib/voice_ai_buddy/update_state.txt
   ```

4. Restart services:
   ```bash
   sudo systemctl start voice-ai-buddy.service
   sudo systemctl start voice-ai-buddy-updater.service
   ```

## Best Practices

1. **Test Updates**: Test updates in staging before deploying to production
2. **Git Tags**: Use Git tags for version releases
3. **Branch Strategy**: Use `main` for stable, `dev` for testing
4. **Backup**: Keep backups of working versions
5. **Monitoring**: Monitor update logs regularly
6. **Credentials**: Use SSH keys with read-only deploy keys for security

## Security Considerations

1. **Git Credentials**: Use SSH keys or read-only deploy keys
2. **Permissions**: State directory should be owned by service user
3. **Validation**: Consider adding signature verification for updates
4. **Network**: Updates require network access to GitHub

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

## Notes

- Updates are applied on **next boot**, not during current session
- Update daemon runs in background, non-blocking
- Main application starts immediately, updates happen silently
- Failed updates automatically rollback
- Interrupted updates are detected and recovered on next boot
- **Preserved during updates**: Virtual environment (`hardware/venv`) and local configuration (`hardware/.env`) are preserved to avoid recreation and maintain settings
- **Dependencies**: Dependencies are automatically synced with `requirements.txt` after each update

