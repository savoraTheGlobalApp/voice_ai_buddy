# Voice AI Buddy - Complete Setup Guide

This guide walks you through setting up Voice AI Buddy on Raspberry Pi with automatic updates.

## Prerequisites

- Raspberry Pi with Raspberry Pi OS
- Internet connection
- GitHub repository with your code
- SSH access to the Pi (or physical access)

## Step-by-Step Setup

### Step 1: Initial Installation

1. **Clone or copy your repository to the Pi:**

   ```bash
   cd ~/Documents/startupWorld
   git clone <your-repo-url> voice_ai_buddy
   # Or if you already have it:
   cd voice_ai_buddy
   ```

2. **Run initial setup:**

   ```bash
   cd hardware
   ./setup.sh
   ```

   This will:
   - Install system dependencies
   - Create virtual environment
   - Install Python packages
   - Set up basic configuration

3. **Configure environment:**

   ```bash
   nano .env
   ```

   Set required variables:
   - `BACKEND_URL`: Your backend API URL
   - `USER_UID`: Firebase user ID
   - `USER_NAME`: Child's name
   - `USER_AGE`: Child's age

### Step 2: Migrate to /opt/ (Recommended)

For production installations, use `/opt/` directory:

```bash
cd hardware
sudo ./migrate_to_opt.sh
```

This will:
- Copy installation to `/opt/voice_ai_buddy`
- Create state and staging directories
- Initialize version tracking

### Step 3: Set Up Automatic Updates

1. **Install update system:**

   ```bash
   cd /opt/voice_ai_buddy/hardware
   ./install_update_system.sh
   ```

   You'll be prompted for:
   - GitHub repository URL (SSH or HTTPS)
   - Git branch to track (default: `main`)

2. **Configure Git credentials:**

   **Option A: SSH (Recommended)**
   
   ```bash
   # Generate SSH key if needed
   ssh-keygen -t ed25519 -C "rpi-updater"
   
   # Add public key to GitHub as deploy key (read-only)
   cat ~/.ssh/id_ed25519.pub
   # Copy and add to GitHub: Settings > Deploy keys > Add deploy key
   
   # Test connection
   ssh -T git@github.com
   ```

   **Option B: HTTPS with Personal Access Token**
   
   ```bash
   # Use token in repository URL
   # Format: https://TOKEN@github.com/username/repo.git
   ```

### Step 4: Install Main Application Service

```bash
cd /opt/voice_ai_buddy/hardware
./install_service.sh
```

This will:
- Install systemd service for main application
- Configure service to apply updates on boot
- Enable service to start on boot

### Step 5: Verify Installation

1. **Check services:**

   ```bash
   sudo systemctl status voice-ai-buddy.service
   sudo systemctl status voice-ai-buddy-updater.service
   ```

2. **Check logs:**

   ```bash
   # Main application logs
   sudo journalctl -u voice-ai-buddy.service -f
   
   # Update daemon logs
   sudo journalctl -u voice-ai-buddy-updater.service -f
   ```

3. **Check update state:**

   ```bash
   cat /var/lib/voice_ai_buddy/update_state.txt
   cat /var/lib/voice_ai_buddy/current_version.txt
   ```

## How Updates Work

1. **Background Process:**
   - Update daemon checks GitHub every hour
   - If new version found, downloads to staging
   - Sets state to `ready_to_apply`

2. **On Next Boot:**
   - Main service runs `apply_update.py` before starting
   - If update ready, applies it atomically
   - Installs/updates dependencies
   - Starts application with new code

3. **Safety Features:**
   - Creates backup before applying
   - Rolls back on failure
   - Handles interruptions gracefully
   - Non-blocking startup

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
sudo /usr/bin/python3 /opt/voice_ai_buddy/hardware/apply_update.py
sudo systemctl restart voice-ai-buddy.service
```

## Making Code Changes

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
     sudo /usr/bin/python3 /opt/voice_ai_buddy/hardware/apply_update.py
     sudo systemctl restart voice-ai-buddy.service
     ```

## Troubleshooting

### Service Won't Start

```bash
# Check status
sudo systemctl status voice-ai-buddy.service

# Check logs
sudo journalctl -u voice-ai-buddy.service -n 50

# Test manually
cd /opt/voice_ai_buddy/hardware
source venv/bin/activate
python -m rpi_client.main
```

### Updates Not Working

```bash
# Check updater status
sudo systemctl status voice-ai-buddy-updater.service

# Check update state
cat /var/lib/voice_ai_buddy/update_state.txt

# Check logs
sudo journalctl -u voice-ai-buddy-updater.service -n 50
cat /var/lib/voice_ai_buddy/update.log

# Test Git connection
cd /tmp
git ls-remote <your-repo-url> refs/heads/main
```

### Rollback to Previous Version

```bash
# Stop services
sudo systemctl stop voice-ai-buddy.service
sudo systemctl stop voice-ai-buddy-updater.service

# Restore backup (if exists)
sudo mv /opt/voice_ai_buddy_backup /opt/voice_ai_buddy

# Reset state
echo "idle" | sudo tee /var/lib/voice_ai_buddy/update_state.txt

# Restart services
sudo systemctl start voice-ai-buddy.service
sudo systemctl start voice-ai-buddy-updater.service
```

## Maintenance

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
cat /var/lib/voice_ai_buddy/current_version.txt
cd /opt/voice_ai_buddy
git log -1 --oneline
```

## Service Management

### Start/Stop Services

```bash
# Main application
sudo systemctl start voice-ai-buddy.service
sudo systemctl stop voice-ai-buddy.service
sudo systemctl restart voice-ai-buddy.service

# Update daemon
sudo systemctl start voice-ai-buddy-updater.service
sudo systemctl stop voice-ai-buddy-updater.service
sudo systemctl restart voice-ai-buddy-updater.service
```

### Enable/Disable Auto-Start

```bash
sudo systemctl enable voice-ai-buddy.service
sudo systemctl disable voice-ai-buddy.service
```

### View Logs

```bash
# Follow logs in real-time
sudo journalctl -u voice-ai-buddy.service -f
sudo journalctl -u voice-ai-buddy-updater.service -f

# View recent logs
sudo journalctl -u voice-ai-buddy.service -n 100
```

## Security Notes

1. **Git Credentials:**
   - Use SSH keys with read-only deploy keys
   - Don't use personal access tokens with full access
   - Rotate keys periodically

2. **File Permissions:**
   - State directory should be owned by service user
   - Production directory should have proper permissions

3. **Network:**
   - Updates require internet access
   - Consider firewall rules if needed

## Next Steps

- Monitor logs regularly
- Test updates in staging before production
- Keep backups of working versions
- Document any custom configurations

For more details, see [UPDATE_SYSTEM.md](./UPDATE_SYSTEM.md)

