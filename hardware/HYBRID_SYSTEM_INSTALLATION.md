# Hybrid Update System Installation Guide

This guide explains how to install and migrate to the new hybrid update system.

## Overview

The hybrid system provides:
- ✅ **Atomic updates** (symlink swap)
- ✅ **Power loss safe** (old version always intact)
- ✅ **Instant rollback** (change symlink)
- ✅ **Fixed orchestrator** (never updated, always works)

## Prerequisites

- Current system installed and working
- Access to `/opt/` directory (sudo required)
- Backup of important data (just in case)

## Installation Steps

### Step 1: Install Orchestrator

```bash
cd /opt/voice_ai_buddy/hardware/orchestrator
sudo chmod +x install_orchestrator.sh
sudo ./install_orchestrator.sh
```

This installs the orchestrator to `/opt/voice_ai_buddy_orchestrator/`

### Step 2: Migrate to Hybrid System

```bash
cd /opt/voice_ai_buddy/hardware/orchestrator
sudo chmod +x migrate_to_hybrid.sh
sudo ./migrate_to_hybrid.sh
```

This will:
1. Create v1 from current production
2. Create v2 directory for future updates
3. Move venv to `/var/lib/voice_ai_buddy/venv`
4. Move .env to `/var/lib/voice_ai_buddy/.env`
5. Create symlink: `/opt/voice_ai_buddy` → `v1`
6. Backup old `apply_update.py` to `apply_update_old.py`

**Important:** The migration script will ask for confirmation before proceeding.

### Step 3: Update Service File

Edit the service file:

```bash
sudo nano /etc/systemd/system/voice-ai-buddy.service
```

Change these lines:

**Old:**
```ini
ExecStartPre=/usr/bin/python3 /opt/voice_ai_buddy/hardware/apply_update.py || true
ExecStart=REPLACE_VENV_BIN/python -m rpi_client.main
```

**New:**
```ini
ExecStartPre=/usr/bin/python3 /opt/voice_ai_buddy_orchestrator/apply_update.py || true
ExecStart=/var/lib/voice_ai_buddy/venv/bin/python -m rpi_client.main
```

**Also update WorkingDirectory:**
```ini
WorkingDirectory=/opt/voice_ai_buddy/hardware
```

Reload and restart:

```bash
sudo systemctl daemon-reload
sudo systemctl restart voice-ai-buddy.service
```

### Step 4: Verify Installation

```bash
# Check symlink
ls -l /opt/voice_ai_buddy

# Should show: /opt/voice_ai_buddy -> /opt/voice_ai_buddy_v1

# Check shared resources
ls -la /var/lib/voice_ai_buddy/

# Should show: venv, .env, update_state.txt, etc.

# Check service status
sudo systemctl status voice-ai-buddy.service

# Check orchestrator
ls -la /opt/voice_ai_buddy_orchestrator/
```

### Step 5: Test Update System

1. Make a test change in your repository
2. Push to GitHub
3. Wait for update daemon to detect (check logs)
4. Reboot to apply update
5. Verify update was applied

## Rollback to Old System

If you need to rollback to the old system:

```bash
# 1. Stop services
sudo systemctl stop voice-ai-buddy.service
sudo systemctl stop voice-ai-buddy-updater.service

# 2. Remove symlink and restore old structure
sudo rm /opt/voice_ai_buddy
sudo mv /opt/voice_ai_buddy_v1 /opt/voice_ai_buddy

# 3. Move venv and .env back
sudo mv /var/lib/voice_ai_buddy/venv /opt/voice_ai_buddy/hardware/venv
sudo mv /var/lib/voice_ai_buddy/.env /opt/voice_ai_buddy/hardware/.env

# 4. Restore old service file
sudo nano /etc/systemd/system/voice-ai-buddy.service
# Change ExecStartPre back to old path
# Change ExecStart back to old venv path

# 5. Reload and restart
sudo systemctl daemon-reload
sudo systemctl restart voice-ai-buddy.service
```

## Directory Structure After Migration

```
/opt/
  ├── voice_ai_buddy → symlink to voice_ai_buddy_v1
  ├── voice_ai_buddy_v1/          # Version 1 (current)
  │   ├── hardware/
  │   │   ├── rpi_client/
  │   │   ├── venv → symlink to /var/lib/voice_ai_buddy/venv
  │   │   └── .env → symlink to /var/lib/voice_ai_buddy/.env
  │   └── ...
  ├── voice_ai_buddy_v2/          # Version 2 (for updates)
  └── voice_ai_buddy_orchestrator/ # Orchestrator (fixed)
      └── apply_update.py

/var/lib/voice_ai_buddy/
  ├── venv/                        # Shared virtual environment
  ├── .env                         # Shared environment file
  ├── update_state.txt
  └── current_version.txt
```

## Troubleshooting

### Issue: Symlink not working

```bash
# Check symlink
ls -l /opt/voice_ai_buddy

# Recreate if needed
sudo rm /opt/voice_ai_buddy
sudo ln -sf /opt/voice_ai_buddy_v1 /opt/voice_ai_buddy
```

### Issue: Application can't find venv

```bash
# Check if shared venv exists
ls -la /var/lib/voice_ai_buddy/venv/bin/python

# Check symlink in v1
ls -la /opt/voice_ai_buddy_v1/hardware/venv

# Recreate symlink if needed
sudo ln -sf /var/lib/voice_ai_buddy/venv /opt/voice_ai_buddy_v1/hardware/venv
```

### Issue: Update not applying

```bash
# Check state
cat /var/lib/voice_ai_buddy/update_state.txt

# Check orchestrator logs
sudo journalctl -u voice-ai-buddy.service | grep -i orchestrator

# Manually run orchestrator
sudo /usr/bin/python3 /opt/voice_ai_buddy_orchestrator/apply_update.py
```

## Benefits of New System

1. **Atomic Updates**: Symlink swap is atomic, no partial states
2. **Power Loss Safe**: Old version always intact, can rollback instantly
3. **Validation**: Validates at every step
4. **Fixed Orchestrator**: Never updated, always available for recovery
5. **Shared Resources**: venv and .env in one place, not duplicated

## Next Steps

After installation:
1. Test the update system thoroughly
2. Monitor logs for any issues
3. Once confident, you can remove old backup files:
   ```bash
   sudo rm /opt/voice_ai_buddy_v1/hardware/apply_update_old.py
   ```

