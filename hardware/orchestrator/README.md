# Update Orchestrator

This is the **fixed orchestrator** for the Voice AI Buddy update system. It is **never updated** and handles all orchestration logic.

## Architecture

The orchestrator uses a **hybrid approach** with:
- **Version directories** (`v1`, `v2`) for atomic updates
- **Symlinks** for instant rollback
- **Shared resources** (venv, .env) in `/var/lib/voice_ai_buddy/`

## Installation

### Step 1: Install Orchestrator

```bash
cd hardware/orchestrator
sudo ./install_orchestrator.sh
```

This installs the orchestrator to `/opt/voice_ai_buddy_orchestrator/`

### Step 2: Migrate from Current System

```bash
sudo ./migrate_to_hybrid.sh
```

This will:
- Create v1 from current production
- Create v2 directory
- Move venv and .env to shared location
- Create symlink from `/opt/voice_ai_buddy` to v1

### Step 3: Update Service File

Update the service file to use the new orchestrator:

```bash
# Edit service file
sudo nano /etc/systemd/system/voice-ai-buddy.service

# Change ExecStartPre to:
ExecStartPre=/usr/bin/python3 /opt/voice_ai_buddy_orchestrator/apply_update.py || true

# Change ExecStart to use shared venv:
ExecStart=/var/lib/voice_ai_buddy/venv/bin/python -m rpi_client.main

# Reload and restart
sudo systemctl daemon-reload
sudo systemctl restart voice-ai-buddy.service
```

## How It Works

### Normal Update Flow

1. Update daemon downloads to staging
2. Sets state to `ready_to_apply`
3. On boot, orchestrator:
   - Validates staging
   - Copies staging → v2 (excluding venv, .env)
   - Validates v2
   - Updates shared venv
   - Atomically swaps symlink to v2
   - Sets state to `completed`

### Power Loss Recovery

The orchestrator handles all power loss scenarios:

- **During copy**: v1 still active, retry on next boot
- **During swap**: Symlink swap is atomic, either v1 or v2 active
- **After swap**: Validates active version, completes or rolls back

### Rollback

To rollback to previous version:

```bash
# Check which version is active
ls -l /opt/voice_ai_buddy

# Swap to other version
sudo ln -sf /opt/voice_ai_buddy_v1 /opt/voice_ai_buddy
# or
sudo ln -sf /opt/voice_ai_buddy_v2 /opt/voice_ai_buddy

# Restart service
sudo systemctl restart voice-ai-buddy.service
```

## Directory Structure

```
/opt/voice_ai_buddy_orchestrator/     # Orchestrator (fixed, never updated)
  └── apply_update.py

/opt/voice_ai_buddy → symlink         # Points to v1 or v2

/opt/voice_ai_buddy_v1/               # Version 1
/opt/voice_ai_buddy_v2/               # Version 2

/var/lib/voice_ai_buddy/
  ├── venv/                           # Shared virtual environment
  ├── .env                            # Shared environment file
  ├── update_state.txt                  # Update state
  └── current_version.txt              # Current version
```

## Safety Features

1. **Atomic Operations**: Symlink swap is atomic
2. **Validation**: Validates at every step
3. **Rollback**: Instant rollback by changing symlink
4. **Recovery**: Handles all power loss scenarios
5. **Fixed Orchestrator**: Never updated, always available

## Troubleshooting

### Check Active Version

```bash
ls -l /opt/voice_ai_buddy
```

### Check State

```bash
cat /var/lib/voice_ai_buddy/update_state.txt
```

### Manual Recovery

If system is stuck:

```bash
# Check which version is valid
/opt/voice_ai_buddy_orchestrator/apply_update.py

# Or manually swap
sudo ln -sf /opt/voice_ai_buddy_v1 /opt/voice_ai_buddy
echo "idle" | sudo tee /var/lib/voice_ai_buddy/update_state.txt
```

