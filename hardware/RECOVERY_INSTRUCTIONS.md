# Recovery Instructions for Corrupted Production

## Current Issue

Your production directory is corrupted:
- `.git` directory is empty
- `.env` file is empty  
- `venv` is corrupted
- Update state is stuck at "applying"

## Immediate Recovery Steps

### Step 1: Check if Backup Exists

```bash
ls -la /var/lib/voice_ai_buddy/backup/
```

If backup exists, proceed with Step 2A. If not, go to Step 2B.

### Step 2A: Restore from Backup (Recommended)

```bash
# Stop services
sudo systemctl stop voice-ai-buddy.service
sudo systemctl stop voice-ai-buddy-updater.service

# Clear corrupted production (preserve venv and .env if they exist)
cd /opt/voice_ai_buddy
sudo rm -rf .git hardware/rpi_client hardware/*.py hardware/*.md hardware/*.sh hardware/*.service
# Keep venv and .env if they exist

# Restore from backup
sudo cp -r /var/lib/voice_ai_buddy/backup/* /opt/voice_ai_buddy/

# Fix ownership
sudo chown -R $(whoami):$(whoami) /opt/voice_ai_buddy

# Verify git repository
cd /opt/voice_ai_buddy
git status  # Should work now

# Reset state
echo "idle" | sudo tee /var/lib/voice_ai_buddy/update_state.txt

# Restart services
sudo systemctl start voice-ai-buddy-updater.service
sudo systemctl start voice-ai-buddy.service
```

### Step 2B: Restore from Staging (If No Backup)

```bash
# Stop services
sudo systemctl stop voice-ai-buddy.service
sudo systemctl stop voice-ai-buddy-updater.service

# Clear corrupted production
cd /opt/voice_ai_buddy
sudo rm -rf .git hardware/rpi_client hardware/*.py hardware/*.md hardware/*.sh hardware/*.service

# Restore from staging
sudo cp -r /opt/voice_ai_buddy_staging/* /opt/voice_ai_buddy/

# Fix ownership
sudo chown -R $(whoami):$(whoami) /opt/voice_ai_buddy

# Restore .env if it exists in backup
if [ -f "/var/lib/voice_ai_buddy/backup/hardware/.env" ]; then
    sudo cp /var/lib/voice_ai_buddy/backup/hardware/.env /opt/voice_ai_buddy/hardware/.env
    sudo chown $(whoami):$(whoami) /opt/voice_ai_buddy/hardware/.env
fi

# Verify git repository
cd /opt/voice_ai_buddy
git status  # Should work now

# Reset state
echo "idle" | sudo tee /var/lib/voice_ai_buddy/update_state.txt

# Recreate venv if needed
cd /opt/voice_ai_buddy/hardware
if [ ! -d "venv" ] || [ ! -f "venv/bin/python" ]; then
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
    deactivate
fi

# Restart services
sudo systemctl start voice-ai-buddy-updater.service
sudo systemctl start voice-ai-buddy.service
```

### Step 2C: Fresh Clone (Last Resort)

If both backup and staging are corrupted:

```bash
# Stop services
sudo systemctl stop voice-ai-buddy.service
sudo systemctl stop voice-ai-buddy-updater.service

# Backup your .env file if it has important data
if [ -f "/opt/voice_ai_buddy/hardware/.env" ]; then
    cp /opt/voice_ai_buddy/hardware/.env ~/.env.backup
fi

# Remove corrupted production
sudo rm -rf /opt/voice_ai_buddy

# Clone fresh
sudo git clone <your-repo-url> /opt/voice_ai_buddy
# Or if using branch:
sudo git clone -b <branch-name> <your-repo-url> /opt/voice_ai_buddy

# Set ownership
sudo chown -R $(whoami):$(whoami) /opt/voice_ai_buddy

# Restore .env if you backed it up
if [ -f ~/.env.backup ]; then
    cp ~/.env.backup /opt/voice_ai_buddy/hardware/.env
fi

# Run setup
cd /opt/voice_ai_buddy/hardware
./setup.sh

# Reset state
echo "idle" | sudo tee /var/lib/voice_ai_buddy/update_state.txt

# Update version file
cd /opt/voice_ai_buddy
git rev-parse HEAD | sudo tee /var/lib/voice_ai_buddy/current_version.txt

# Restart services
sudo systemctl start voice-ai-buddy-updater.service
sudo systemctl start voice-ai-buddy.service
```

## Verify Recovery

After recovery, verify everything works:

```bash
# Check git repository
cd /opt/voice_ai_buddy
git status
git log -1

# Check .env file
cat hardware/.env  # Should have content

# Check venv
source hardware/venv/bin/activate
python --version
pip list
deactivate

# Check services
sudo systemctl status voice-ai-buddy.service
sudo systemctl status voice-ai-buddy-updater.service

# Check update state
cat /var/lib/voice_ai_buddy/update_state.txt  # Should be "idle"
```

## Prevention

The updated code now includes validation that will:
1. Detect corrupted production on recovery
2. Automatically restore from backup if available
3. Fall back to staging if backup doesn't exist
4. Set state appropriately

After applying the fix, future power loss scenarios will be handled automatically.

