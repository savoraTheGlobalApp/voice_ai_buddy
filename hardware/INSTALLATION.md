# Complete Installation Guide for New Raspberry Pi

This guide provides step-by-step instructions for installing Voice AI Buddy on a fresh Raspberry Pi with the automatic update system.

## Prerequisites

- Raspberry Pi with Raspberry Pi OS installed
- Internet connection
- GitHub repository with your code
- SSH access to the Pi (or physical access with keyboard/monitor)

## Complete Installation Steps

### Step 1: Clone Repository to /opt/

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

### Step 2: Run Post-Installation Setup

```bash
cd /opt/voice_ai_buddy/hardware
sudo ./setup_opt_installation.sh
```

This will:
- Set proper ownership of the cloned repository
- Create state and staging directories
- Initialize version tracking

### Step 3: Install System Dependencies and Python Packages

```bash
cd /opt/voice_ai_buddy/hardware
./setup.sh
```

This will:
- Install system dependencies (portaudio, ffmpeg, etc.)
- Create virtual environment
- Install Python packages from requirements.txt
- Set up basic configuration

### Step 4: Configure Environment Variables

```bash
# Edit .env file
nano /opt/voice_ai_buddy/hardware/.env
```

Set required variables:
- `BACKEND_URL`: Your backend API URL
- `FIREBASE_CREDENTIALS_PATH`: Path to Firebase service account key
- `USER_UID`: Firebase user ID
- `USER_NAME`: Child's name
- `USER_AGE`: Child's age

**Note:** After migration (Step 6), the .env file will be moved to `/var/lib/voice_ai_buddy/.env` and you'll edit it there.

### Step 5: Install Orchestrator

```bash
cd /opt/voice_ai_buddy/hardware/orchestrator
sudo chmod +x install_orchestrator.sh
sudo ./install_orchestrator.sh
```

This installs the orchestrator to `/opt/voice_ai_buddy_orchestrator/` (fixed location, never updated).

### Step 6: Migrate to Version Directory System

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

**Important:** 
- The migration script will ask for confirmation before proceeding
- After migration, edit .env at: `/var/lib/voice_ai_buddy/.env`

### Step 7: Install Update System

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

### Step 8: Install Main Service

```bash
cd /opt/voice_ai_buddy/hardware
./install_service.sh
```

The main service will now:
- Apply updates on boot (if available) using orchestrator
- Start the application with latest code
- Use shared venv from `/var/lib/voice_ai_buddy/venv`

### Step 9: Verify Installation

```bash
# Check service status
sudo systemctl status voice-ai-buddy.service
sudo systemctl status voice-ai-buddy-updater.service

# Check update system
cd /opt/voice_ai_buddy/hardware
./verify_permissions.sh

# View logs
sudo journalctl -u voice-ai-buddy.service -f
```

## Quick Reference

### Installation Order

1. Clone repository → `/opt/voice_ai_buddy`
2. Run `setup_opt_installation.sh` (as root)
3. Run `setup.sh` (as user)
4. Configure `.env` file
5. Install orchestrator → `orchestrator/install_orchestrator.sh`
6. Migrate to version system → `orchestrator/migrate_to_hybrid.sh`
7. Install update system → `install_update_system.sh`
8. Install main service → `install_service.sh`

### Important Paths After Installation

- **Code**: `/opt/voice_ai_buddy` (symlink to v1 or v2)
- **Shared .env**: `/var/lib/voice_ai_buddy/.env` (EDIT THIS)
- **Shared venv**: `/var/lib/voice_ai_buddy/venv`
- **Orchestrator**: `/opt/voice_ai_buddy_orchestrator/apply_update.py`
- **Version directories**: `/opt/voice_ai_buddy_v1/`, `/opt/voice_ai_buddy_v2/`

### Service Management

```bash
# Start/Stop services
sudo systemctl start voice-ai-buddy.service
sudo systemctl stop voice-ai-buddy.service
sudo systemctl restart voice-ai-buddy.service

# View logs
sudo journalctl -u voice-ai-buddy.service -f
sudo journalctl -u voice-ai-buddy-updater.service -f

# Check status
sudo systemctl status voice-ai-buddy.service
```

## Troubleshooting

### Service Not Starting

1. Check logs: `sudo journalctl -u voice-ai-buddy.service -n 50`
2. Verify .env file: `cat /var/lib/voice_ai_buddy/.env`
3. Check permissions: `./verify_permissions.sh`

### Update System Not Working

1. Check updater service: `sudo systemctl status voice-ai-buddy-updater.service`
2. Check update state: `cat /var/lib/voice_ai_buddy/update_state.txt`
3. Verify orchestrator: `ls -la /opt/voice_ai_buddy_orchestrator/apply_update.py`

### Permission Issues

Run verification script:
```bash
cd /opt/voice_ai_buddy/hardware
./verify_permissions.sh
```

Fix permissions if needed:
```bash
sudo chown -R <your-user>:<your-user> /opt/voice_ai_buddy
sudo chown -R <your-user>:<your-user> /var/lib/voice_ai_buddy
sudo chown -R <your-user>:<your-user> /opt/voice_ai_buddy_orchestrator
```

## Next Steps

After installation:
1. Test the application manually: `/var/lib/voice_ai_buddy/venv/bin/python -m rpi_client.main`
2. Configure .env file: `nano /var/lib/voice_ai_buddy/.env`
3. Enable services to start on boot (already enabled by install scripts)
4. Monitor logs for any issues

## Documentation

- **Operations & Maintenance**: See `OPERATIONS.md` for day-to-day operations, service management, and troubleshooting
- **Update System**: See `UPDATE_SYSTEM.md` for detailed update system documentation
