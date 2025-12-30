# Systemd Service Setup for Voice AI Buddy

This guide explains how to set up the Voice AI Buddy client to automatically start on boot using systemd.

## Prerequisites

1. **Virtual Environment**: Ensure you have run `setup.sh` to create the virtual environment
2. **Configuration**: Ensure `.env` file is properly configured
3. **Permissions**: You need sudo access to install systemd services

## Installation

### Step 1: Make scripts executable

```bash
cd hardware
chmod +x install_service.sh uninstall_service.sh
```

### Step 2: Run installation script

```bash
./install_service.sh
```

The script will:
- Verify the virtual environment exists
- Check that the Python module can be imported
- Create a systemd service file with correct paths
- Install the service to `/etc/systemd/system/`
- Enable the service to start on boot
- Optionally start the service immediately

## Service Management

### Start the service
```bash
sudo systemctl start voice-ai-buddy.service
```

### Stop the service
```bash
sudo systemctl stop voice-ai-buddy.service
```

### Restart the service
```bash
sudo systemctl restart voice-ai-buddy.service
```

### Check service status
```bash
sudo systemctl status voice-ai-buddy.service
```

### View logs
```bash
# Follow logs in real-time
sudo journalctl -u voice-ai-buddy.service -f

# View recent logs
sudo journalctl -u voice-ai-buddy.service -n 100

# View logs since boot
sudo journalctl -u voice-ai-buddy.service -b
```

### Enable/Disable auto-start on boot
```bash
# Enable (starts on boot)
sudo systemctl enable voice-ai-buddy.service

# Disable (doesn't start on boot)
sudo systemctl disable voice-ai-buddy.service
```

## Uninstallation

To remove the service:

```bash
cd hardware
./uninstall_service.sh
```

This will:
- Stop the service if running
- Disable auto-start
- Remove the service file
- Reload systemd

## Service Configuration

The service is configured with:

- **Auto-restart**: Service automatically restarts if it crashes (10 second delay)
- **Logging**: All output goes to systemd journal
- **Dependencies**: Waits for network and audio system to be ready
- **Resource limits**: Increased file descriptor limit for WebSocket connections
- **Security**: Runs with restricted privileges

## Troubleshooting

### Service won't start

1. Check service status:
   ```bash
   sudo systemctl status voice-ai-buddy.service
   ```

2. Check logs for errors:
   ```bash
   sudo journalctl -u voice-ai-buddy.service -n 50
   ```

3. Verify virtual environment:
   ```bash
   cd hardware
   source venv/bin/activate
   python -m rpi_client.main
   ```

4. Check file permissions:
   ```bash
   ls -la hardware/venv/bin/python
   ls -la hardware/.env
   ```

### Service starts but crashes immediately

1. Check if `.env` file exists and is configured correctly
2. Verify all dependencies are installed:
   ```bash
   cd hardware
   source venv/bin/activate
   pip install -r requirements.txt
   ```

3. Test manually:
   ```bash
   cd hardware
   source venv/bin/activate
   python -m rpi_client.main
   ```

### Service doesn't start on boot

1. Verify service is enabled:
   ```bash
   sudo systemctl is-enabled voice-ai-buddy.service
   ```

2. If not enabled, enable it:
   ```bash
   sudo systemctl enable voice-ai-buddy.service
   ```

3. Check if there are dependency issues:
   ```bash
   sudo systemctl list-dependencies voice-ai-buddy.service
   ```

## Notes

- The service runs as the user who installed it (not root)
- Logs are available via `journalctl` (systemd's logging system)
- The service automatically restarts on failure with a 10-second delay
- Network and audio system must be ready before the service starts

