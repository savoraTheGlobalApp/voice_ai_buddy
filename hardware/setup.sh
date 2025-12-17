#!/bin/bash
# Setup script for RPi Voice AI Buddy client
# Run this script once to set up the environment

set -e  # Exit on error

echo "=== RPi Voice AI Buddy Setup ==="
echo ""

# Check if running on Raspberry Pi
if [ ! -f /proc/device-tree/model ] || ! grep -q "Raspberry Pi" /proc/device-tree/model; then
    echo "Warning: This script is designed for Raspberry Pi. Continue anyway? (y/n)"
    read -r response
    if [ "$response" != "y" ]; then
        exit 1
    fi
fi

# Check Python version
if ! command -v python3 &> /dev/null; then
    echo "Error: Python 3 is not installed"
    exit 1
fi

PYTHON_VERSION=$(python3 --version | cut -d' ' -f2 | cut -d'.' -f1,2)
echo "Found Python $PYTHON_VERSION"

# Update system packages
echo ""
echo "Updating system packages..."
sudo apt update
sudo apt upgrade -y

# Install system dependencies
echo ""
echo "Installing system dependencies..."
sudo apt install -y \
    portaudio19-dev \
    python3-pyaudio \
    ffmpeg \
    python3-pip \
    python3-venv

# Create virtual environment
echo ""
echo "Creating virtual environment..."
if [ ! -d "venv" ]; then
    python3 -m venv venv
    echo "Virtual environment created"
else
    echo "Virtual environment already exists"
fi

# Activate virtual environment
echo ""
echo "Activating virtual environment..."
source venv/bin/activate

# Upgrade pip
echo ""
echo "Upgrading pip..."
pip install --upgrade pip

# Install Python dependencies
echo ""
echo "Installing Python dependencies..."
pip install -r requirements.txt

# Check for .env file
echo ""
if [ ! -f ".env" ]; then
    echo "Creating .env file from .env.example..."
    cp .env.example .env
    echo ""
    echo "⚠️  IMPORTANT: Please edit .env file with your configuration:"
    echo "   - BACKEND_URL: Your Railway backend URL"
    echo "   - FIREBASE_CREDENTIALS_PATH: Path to service account key"
    echo "   - USER_UID: Firebase user ID"
    echo "   - USER_NAME: Child's name"
    echo "   - USER_AGE: Child's age"
    echo ""
    echo "Run: nano .env"
else
    echo ".env file already exists"
fi

# Test audio devices
echo ""
echo "Testing audio devices..."
python3 -c "
from rpi_client.audio_handler import AudioHandler
try:
    ah = AudioHandler()
    devices = ah.list_devices()
    print(f'\nFound {len(devices)} audio devices:')
    for d in devices:
        in_channels = d['max_input_channels']
        out_channels = d['max_output_channels']
        print(f\"  [{d['index']}] {d['name']} (in: {in_channels}, out: {out_channels})\")
except Exception as e:
    print(f'Error listing audio devices: {e}')
    print('This is OK if audio hardware is not connected yet')
"

# Check Firebase credentials
echo ""
if [ -f "../backend/service-account-key.json" ]; then
    echo "✓ Found Firebase credentials at ../backend/service-account-key.json"
elif [ -f "service-account-key.json" ]; then
    echo "✓ Found Firebase credentials at service-account-key.json"
else
    echo "⚠️  Firebase credentials not found. Please ensure service-account-key.json is available."
fi

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "1. Edit .env file with your configuration: nano .env"
echo "2. Test the client: python3 -m rpi_client.main"
echo "3. (Optional) Set up systemd service for auto-start"
echo ""
echo "For more information, see README.md"

