# Power Cut Testing Guide

This guide explains how to test the update system's resilience to power cuts during different phases of the update process.

## Overview

The update system has **7 possible states**:
1. `idle` - No update in progress
2. `checking` - Checking for updates from GitHub
3. `downloading` - Downloading update to staging directory
4. `ready_to_apply` - Update staged, ready for next boot
5. `applying` - Update being applied (on boot)
6. `completed` - Update applied successfully
7. `failed` - Update failed

## Power Cut Recovery Coverage

| State | Recovery Coverage | How It Works |
|-------|------------------|--------------|
| `checking` | ✅ **Covered** | Removes stale lock (>60s old), resets to `idle` |
| `downloading` | ✅ **Covered** | Removes stale lock (>60s old), resets to `idle` |
| `applying` | ✅ **Covered** | Orchestrator detects on next boot, attempts recovery |
| `ready_to_apply` | ✅ **Safe** | No recovery needed (safe state) |
| `completed` | ✅ **Safe** | No recovery needed (safe state) |
| `failed` | ✅ **Covered** | Checks if staging is valid, resets if valid |
| `idle` | ✅ **Safe** | No recovery needed (safe state) |

## Testing Power Cut During Apply Phase

### Prerequisites

1. Ensure update state is `ready_to_apply`:
   ```bash
   cat /var/lib/voice_ai_buddy/update_state.txt
   # Should show: ready_to_apply
   ```

2. Verify staging directory has valid update:
   ```bash
   ls -la /opt/voice_ai_buddy_staging/
   # Should show a valid git repository
   ```

### Method 1: Simulate Power Cut During Apply (Recommended)

This method simulates a power cut by interrupting the orchestrator during execution:

1. **Trigger the orchestrator manually** (don't reboot yet):
   ```bash
   sudo /opt/voice_ai_buddy_orchestrator/apply_update.py
   ```

2. **While it's running**, quickly interrupt it:
   ```bash
   # In another terminal, find the process and kill it
   sudo pkill -f "apply_update.py"
   # OR use Ctrl+C if running in foreground
   ```

3. **Check the state** - it should be `applying`:
   ```bash
   cat /var/lib/voice_ai_buddy/update_state.txt
   # Should show: applying
   ```

4. **Reboot** to test recovery:
   ```bash
   sudo reboot
   ```

5. **After reboot**, check logs:
   ```bash
   # Check orchestrator logs (it runs on boot)
   sudo journalctl -u voice-ai-buddy-hybrid.service -n 50 | grep -i orchestrator
   
   # Check update state
   cat /var/lib/voice_ai_buddy/update_state.txt
   # Should be: idle, completed, or failed (with recovery attempted)
   ```

### Method 2: Actual Power Cut (Physical Test)

**⚠️ WARNING: This requires physically unplugging the Raspberry Pi during boot!**

1. **Ensure state is `ready_to_apply`**:
   ```bash
   cat /var/lib/voice_ai_buddy/update_state.txt
   ```

2. **Start the reboot**:
   ```bash
   sudo reboot
   ```

3. **Immediately unplug power** (within 1-2 seconds of reboot starting)

4. **Reconnect power** and wait for boot

5. **Check recovery**:
   ```bash
   # Check orchestrator logs
   sudo journalctl -u voice-ai-buddy-hybrid.service -n 100
   
   # Check update state
   cat /var/lib/voice_ai_buddy/update_state.txt
   
   # Verify production directory
   ls -la /opt/voice_ai_buddy/
   ```

### Method 3: Using Systemd to Delay Apply (Advanced)

You can modify the service to add a delay, giving you time to cut power:

1. **Edit the service file**:
   ```bash
   sudo nano /etc/systemd/system/voice-ai-buddy-hybrid.service
   ```

2. **Add a sleep before orchestrator**:
   ```ini
   ExecStartPre=/bin/sleep 5
   ExecStartPre=/usr/bin/python3 /opt/voice_ai_buddy_orchestrator/apply_update.py
   ```

3. **Reload and reboot**:
   ```bash
   sudo systemctl daemon-reload
   sudo reboot
   ```

4. **Unplug during the 5-second delay** (or during orchestrator execution)

## Testing Other States

### Testing Power Cut During `checking` State

1. **Manually set state to `checking`**:
   ```bash
   echo "checking" | sudo tee /var/lib/voice_ai_buddy/update_state.txt
   ```

2. **Create a stale lock file** (older than 60 seconds):
   ```bash
   echo "$(date +%s)" | sudo tee /var/lib/voice_ai_buddy/update_lock
   # Wait 61 seconds, or manually set mtime:
   sudo touch -t 202001010000 /var/lib/voice_ai_buddy/update_lock
   ```

3. **Restart updater service**:
   ```bash
   sudo systemctl restart voice-ai-buddy-updater.service
   ```

4. **Check logs** - should detect and remove stale lock:
   ```bash
   sudo journalctl -u voice-ai-buddy-updater.service -n 20
   ```

### Testing Power Cut During `downloading` State

1. **Manually set state to `downloading`**:
   ```bash
   echo "downloading" | sudo tee /var/lib/voice_ai_buddy/update_state.txt
   ```

2. **Create a stale lock file**:
   ```bash
   echo "$(date +%s)" | sudo tee /var/lib/voice_ai_buddy/update_lock
   sudo touch -t 202001010000 /var/lib/voice_ai_buddy/update_lock
   ```

3. **Restart updater service**:
   ```bash
   sudo systemctl restart voice-ai-buddy-updater.service
   ```

4. **Check logs** - should detect and reset to `idle`:
   ```bash
   sudo journalctl -u voice-ai-buddy-updater.service -n 20
   cat /var/lib/voice_ai_buddy/update_state.txt
   # Should be: idle
   ```

## Testing Partial State Writes

The system now handles partial state writes (e.g., "appl" instead of "applying"):

1. **Manually create a partial state**:
   ```bash
   echo "appl" | sudo tee /var/lib/voice_ai_buddy/update_state.txt
   ```

2. **Run orchestrator**:
   ```bash
   sudo /opt/voice_ai_buddy_orchestrator/apply_update.py
   ```

3. **Check logs** - should detect and fix:
   ```bash
   sudo journalctl -u voice-ai-buddy-hybrid.service -n 20
   # Should show: "Detected partial state 'appl', interpreting as 'applying'"
   ```

4. **Verify state was fixed**:
   ```bash
   cat /var/lib/voice_ai_buddy/update_state.txt
   # Should be: applying (or idle if recovery succeeded)
   ```

## Testing Invalid States

1. **Create an invalid state**:
   ```bash
   echo "invalid_state_xyz" | sudo tee /var/lib/voice_ai_buddy/update_state.txt
   ```

2. **Run orchestrator**:
   ```bash
   sudo /opt/voice_ai_buddy_orchestrator/apply_update.py
   ```

3. **Check logs** - should reset to `idle`:
   ```bash
   sudo journalctl -u voice-ai-buddy-hybrid.service -n 20
   # Should show: "Unknown state 'invalid_state_xyz', resetting to idle"
   ```

4. **Verify state was reset**:
   ```bash
   cat /var/lib/voice_ai_buddy/update_state.txt
   # Should be: idle
   ```

## Expected Recovery Behavior

### During `applying` State Recovery

When power is cut during `applying`, on next boot the orchestrator will:

1. **Detect interrupted state** (`applying`)
2. **Validate active version**:
   - If valid → Reset to `idle` (update likely completed)
   - If invalid → Attempt rollback to other version
3. **If rollback fails** → Try to restore from staging
4. **If all fails** → Set state to `failed`

### Recovery Success Indicators

✅ **Successful recovery**:
- State becomes `idle` or `completed`
- Production directory has valid code
- Application starts normally

❌ **Recovery failed**:
- State becomes `failed`
- Production directory may be empty or invalid
- Application may not start

## Verification Commands

After any power cut test, verify:

```bash
# 1. Check update state
cat /var/lib/voice_ai_buddy/update_state.txt

# 2. Check current version
cat /var/lib/voice_ai_buddy/current_version.txt

# 3. Verify production directory
ls -la /opt/voice_ai_buddy/
ls -la /opt/voice_ai_buddy/hardware/

# 4. Check active version (hybrid system)
ls -la /opt/voice_ai_buddy  # Should be a symlink to v1 or v2
ls -la /opt/voice_ai_buddy_v1/
ls -la /opt/voice_ai_buddy_v2/

# 5. Check orchestrator logs
sudo journalctl -u voice-ai-buddy-hybrid.service -n 100 | grep -i orchestrator

# 6. Check updater logs
sudo journalctl -u voice-ai-buddy-updater.service -n 50

# 7. Verify application is running
sudo systemctl status voice-ai-buddy-hybrid.service
```

## Troubleshooting Failed Recovery

If recovery fails:

1. **Check orchestrator logs**:
   ```bash
   sudo journalctl -u voice-ai-buddy-hybrid.service -n 200
   ```

2. **Manually inspect state**:
   ```bash
   cat /var/lib/voice_ai_buddy/update_state.txt
   ls -la /var/lib/voice_ai_buddy/
   ```

3. **Check version directories**:
   ```bash
   ls -la /opt/voice_ai_buddy_v1/
   ls -la /opt/voice_ai_buddy_v2/
   ```

4. **If staging is valid, manually reset**:
   ```bash
   # Check staging
   ls -la /opt/voice_ai_buddy_staging/
   
   # If valid, reset state
   echo "ready_to_apply" | sudo tee /var/lib/voice_ai_buddy/update_state.txt
   
   # Reboot to retry
   sudo reboot
   ```

## Notes

- **Atomic writes**: State writes use atomic file operations (write to temp, then rename), so partial writes are rare but still possible
- **Lock files**: Stale lock files (>60 seconds old) are automatically removed during recovery
- **State validation**: Invalid or partial states are automatically detected and corrected
- **Hybrid system**: Uses version directories (v1, v2) and symlinks for true atomic updates
