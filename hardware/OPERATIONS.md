# Voice AI Buddy - Operations & Maintenance Guide

This guide covers day-to-day operations, maintenance, and troubleshooting for Voice AI Buddy after installation.

> **For installation instructions**, see [INSTALLATION.md](./INSTALLATION.md)

## Table of Contents

1. [How Updates Work](#how-updates-work)
2. [Service Management](#service-management)
3. [Service Installation & Configuration](#service-installation--configuration)
4. [Changing the Tracked Branch](#changing-the-tracked-branch)
5. [Making Code Changes](#making-code-changes)
6. [Maintenance Tasks](#maintenance-tasks)
7. [Troubleshooting](#troubleshooting)
8. [Security Notes](#security-notes)

---

## How Updates Work

### Update Process Flow

1. **Background Process:**
   - Update daemon (`voice-ai-buddy-updater.service`) checks GitHub every hour
   - If new version found, downloads to staging directory
   - Sets state to `ready_to_apply`

2. **On Next Boot:**
   - Main service runs orchestrator (`apply_update.py`) before starting
   - If update ready, applies it atomically using version directory swap
   - Installs/updates dependencies in shared venv
   - Starts application with new code

3. **Safety Features:**
   - Atomic symlink swap (no partial updates)
   - Automatic rollback on failure
   - Handles power interruptions gracefully
   - Non-blocking startup (continues even if update fails)

### Manual Update Application

If you want to apply an update immediately without rebooting:

```bash
# Check if update is ready
cat /var/lib/voice_ai_buddy/update_state.txt

# If state is "ready_to_apply", manually apply:
sudo /opt/voice_ai_buddy_orchestrator/apply_update.py

# Restart service to use new code
sudo systemctl restart voice-ai-buddy.service
```

---

## Service Management

### Main Application Service

**Start the service:**
```bash
sudo systemctl start voice-ai-buddy.service
```

**Stop the service:**
```bash
sudo systemctl stop voice-ai-buddy.service
```

**Restart the service:**
```bash
sudo systemctl restart voice-ai-buddy.service
```

**Check service status:**
```bash
sudo systemctl status voice-ai-buddy.service
```

**View logs:**
```bash
# Follow logs in real-time
sudo journalctl -u voice-ai-buddy.service -f

# View recent logs
sudo journalctl -u voice-ai-buddy.service -n 100

# View logs since boot
sudo journalctl -u voice-ai-buddy.service -b
```

**Enable/Disable auto-start on boot:**
```bash
# Enable (starts on boot)
sudo systemctl enable voice-ai-buddy.service

# Disable (doesn't start on boot)
sudo systemctl disable voice-ai-buddy.service
```

### Update Daemon Service

**Start the updater:**
```bash
sudo systemctl start voice-ai-buddy-updater.service
```

**Stop the updater:**
```bash
sudo systemctl stop voice-ai-buddy-updater.service
```

**Restart the updater:**
```bash
sudo systemctl restart voice-ai-buddy-updater.service
```

**View updater logs:**
```bash
sudo journalctl -u voice-ai-buddy-updater.service -f
```

**Check updater status:**
```bash
sudo systemctl status voice-ai-buddy-updater.service
```

---

## Service Installation & Configuration

> **Note:** This section is for reinstalling or reconfiguring services. For initial installation, follow [INSTALLATION.md](./INSTALLATION.md).

### Installing the Main Service

1. **Make scripts executable:**
   ```bash
   cd /opt/voice_ai_buddy/hardware
   chmod +x install_service.sh uninstall_service.sh
   ```

2. **Run installation script:**
   ```bash
   ./install_service.sh
   ```

The script will:
- Verify the shared virtual environment exists
- Check that the Python module can be imported
- Verify orchestrator is installed
- Create a systemd service file with correct paths
- Install the service to `/etc/systemd/system/`
- Enable the service to start on boot
- Optionally start the service immediately

### Service Configuration

The main service is configured with:

- **Auto-restart**: Service automatically restarts if it crashes (10 second delay)
- **Logging**: All output goes to systemd journal
- **Dependencies**: Waits for network and audio system to be ready
- **Resource limits**: Increased file descriptor limit for WebSocket connections
- **Security**: Runs with restricted privileges (not as root)
- **Update application**: Runs orchestrator before starting to apply pending updates

### Uninstalling the Service

To remove the main service:

```bash
cd /opt/voice_ai_buddy/hardware
./uninstall_service.sh
```

This will:
- Stop the service if running
- Disable auto-start
- Remove the service file
- Reload systemd

---

## Changing the Tracked Branch

If you want to track a different branch (e.g., switch from `main` to `dev` or `staging`):

1. **Edit the systemd service file:**
   ```bash
   sudo nano /etc/systemd/system/voice-ai-buddy-updater.service
   ```

2. **Find the line with `GITHUB_BRANCH` and change it:**
   ```ini
   Environment="GITHUB_BRANCH=dev"  # Change from "main" to your desired branch
   ```

3. **Reload systemd and restart the service:**
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl restart voice-ai-buddy-updater.service
   ```

4. **Verify the change:**
   ```bash
   sudo systemctl status voice-ai-buddy-updater.service
   # Check logs to confirm it's tracking the new branch
   sudo journalctl -u voice-ai-buddy-updater.service -n 20
   ```

**Note:** The update daemon will now check the new branch for updates. If you want to immediately switch to code from the new branch, you can manually trigger an update check:

```bash
sudo systemctl restart voice-ai-buddy-updater.service
# Wait for update to be staged, then reboot or manually apply
sudo /opt/voice_ai_buddy_orchestrator/apply_update.py
sudo systemctl restart voice-ai-buddy.service
```

---

## Making Code Changes

### Development Workflow

1. **On your development machine:**
   ```bash
   # Make changes
   git add .
   git commit -m "Your changes"
   git push origin main  # Or your tracked branch
   ```

2. **On Raspberry Pi:**
   - Update daemon will detect changes within 1 hour
   - Or restart updater to check immediately:
     ```bash
     sudo systemctl restart voice-ai-buddy-updater.service
     ```

3. **Update will be applied on next boot:**
   - Power cycle the Pi
   - Or manually apply:
     ```bash
     sudo /opt/voice_ai_buddy_orchestrator/apply_update.py
     sudo systemctl restart voice-ai-buddy.service
     ```

---

## Maintenance Tasks

### View Update History

```bash
cat /var/lib/voice_ai_buddy/update.log
```

### Manual Update Check

```bash
sudo systemctl restart voice-ai-buddy-updater.service
```

### Clear Update Logs

```bash
sudo truncate -s 0 /var/lib/voice_ai_buddy/update.log
```

### Check Current Version

```bash
# Check version file
cat /var/lib/voice_ai_buddy/current_version.txt

# Check Git commit
cd /opt/voice_ai_buddy
git log -1 --oneline
```

### Check Update State

```bash
cat /var/lib/voice_ai_buddy/update_state.txt
```

Possible states:
- `idle`: No update in progress
- `checking`: Checking for updates
- `downloading`: Downloading update
- `ready_to_apply`: Update ready, will be applied on next boot
- `applying`: Update being applied (should be brief)
- `failed`: Update failed

### Verify System Permissions

```bash
cd /opt/voice_ai_buddy/hardware
./verify_permissions.sh
```

---

## Troubleshooting

### Service Won't Start

1. **Check service status:**
   ```bash
   sudo systemctl status voice-ai-buddy.service
   ```

2. **Check logs for errors:**
   ```bash
   sudo journalctl -u voice-ai-buddy.service -n 50
   ```

3. **Verify .env file:**
   ```bash
   cat /var/lib/voice_ai_buddy/.env
   ```

4. **Test manually:**
   ```bash
   /var/lib/voice_ai_buddy/venv/bin/python -m rpi_client.main
   ```

5. **Check permissions:**
   ```bash
   cd /opt/voice_ai_buddy/hardware
   ./verify_permissions.sh
   ```

### Service Starts But Crashes Immediately

1. **Check if `.env` file exists and is configured correctly:**
   ```bash
   cat /var/lib/voice_ai_buddy/.env
   ```

2. **Verify all dependencies are installed:**
   ```bash
   /var/lib/voice_ai_buddy/venv/bin/pip install -r /opt/voice_ai_buddy/hardware/requirements.txt
   ```

3. **Test manually:**
   ```bash
   /var/lib/voice_ai_buddy/venv/bin/python -m rpi_client.main
   ```

4. **Check file permissions:**
   ```bash
   ls -la /var/lib/voice_ai_buddy/venv/bin/python
   ls -la /var/lib/voice_ai_buddy/.env
   ```

### Service Doesn't Start on Boot

1. **Verify service is enabled:**
   ```bash
   sudo systemctl is-enabled voice-ai-buddy.service
   ```

2. **If not enabled, enable it:**
   ```bash
   sudo systemctl enable voice-ai-buddy.service
   ```

3. **Check if there are dependency issues:**
   ```bash
   sudo systemctl list-dependencies voice-ai-buddy.service
   ```

### Updates Not Working

1. **Check updater status:**
   ```bash
   sudo systemctl status voice-ai-buddy-updater.service
   ```

2. **Check update state:**
   ```bash
   cat /var/lib/voice_ai_buddy/update_state.txt
   ```

3. **Check logs:**
   ```bash
   sudo journalctl -u voice-ai-buddy-updater.service -n 50
   cat /var/lib/voice_ai_buddy/update.log
   ```

4. **Test Git connection:**
   ```bash
   cd /tmp
   # Get repo URL from service file
   grep GITHUB_REPO_URL /etc/systemd/system/voice-ai-buddy-updater.service
   git ls-remote <your-repo-url> refs/heads/main
   ```

5. **Verify orchestrator:**
   ```bash
   ls -la /opt/voice_ai_buddy_orchestrator/apply_update.py
   ```

### Permission Issues

Run verification script:
```bash
cd /opt/voice_ai_buddy/hardware
./verify_permissions.sh
```

Fix permissions if needed:
```bash
# Replace <your-user> with your actual username (e.g., laddu)
sudo chown -R <your-user>:<your-user> /opt/voice_ai_buddy
sudo chown -R <your-user>:<your-user> /var/lib/voice_ai_buddy
sudo chown -R <your-user>:<your-user> /opt/voice_ai_buddy_orchestrator
sudo chown -R <your-user>:<your-user> /opt/voice_ai_buddy_v1
sudo chown -R <your-user>:<your-user> /opt/voice_ai_buddy_v2
```

### Rollback to Previous Version

The version directory system provides automatic rollback. If an update fails, the orchestrator will automatically revert to the previous version. To manually rollback:

1. **Stop services:**
   ```bash
   sudo systemctl stop voice-ai-buddy.service
   sudo systemctl stop voice-ai-buddy-updater.service
   ```

2. **Check which version is active:**
   ```bash
   ls -la /opt/voice_ai_buddy
   # Should show symlink to v1 or v2
   ```

3. **Manually swap versions (if needed):**
   ```bash
   # If currently on v2, switch to v1
   sudo rm /opt/voice_ai_buddy
   sudo ln -sf /opt/voice_ai_buddy_v1 /opt/voice_ai_buddy
   ```

4. **Reset state:**
   ```bash
   echo "idle" | sudo tee /var/lib/voice_ai_buddy/update_state.txt
   ```

5. **Restart services:**
   ```bash
   sudo systemctl start voice-ai-buddy-updater.service
   sudo systemctl start voice-ai-buddy.service
   ```

---

## Security Notes

1. **Git Credentials:**
   - Use SSH keys with read-only deploy keys
   - Don't use personal access tokens with full access
   - Rotate keys periodically

2. **File Permissions:**
   - State directory should be owned by service user
   - Production directory should have proper permissions
   - SSH keys should have 600 permissions

3. **Network:**
   - Updates require internet access
   - Consider firewall rules if needed

4. **Service User:**
   - The service runs as the user who installed it (not root)
   - This provides better security isolation

---

## Additional Resources

- **Installation Guide**: See [INSTALLATION.md](./INSTALLATION.md) for complete installation instructions
- **Update System Details**: See [UPDATE_SYSTEM.md](./UPDATE_SYSTEM.md) for detailed update system documentation
- **Service Configuration**: Service files are in `/etc/systemd/system/`

---

## Notes

- Logs are available via `journalctl` (systemd's logging system)
- The service automatically restarts on failure with a 10-second delay
- Network and audio system must be ready before the service starts
- Updates are applied atomically using version directory swaps
- The orchestrator is fixed and never updated (located at `/opt/voice_ai_buddy_orchestrator/`)
