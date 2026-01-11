#!/bin/bash
# Diagnostic script to check if update system is properly configured

echo "=== Voice AI Buddy Update System Diagnostic ==="
echo ""

# Check if orchestrator exists
ORCHESTRATOR="/opt/voice_ai_buddy_orchestrator/apply_update.py"
if [ -f "$ORCHESTRATOR" ]; then
    echo "✓ Orchestrator installed: $ORCHESTRATOR"
else
    echo "✗ Orchestrator NOT found: $ORCHESTRATOR"
    echo "  Run: cd hardware/orchestrator && sudo ./install_orchestrator.sh"
fi

# Check service file
SERVICE_FILE="/etc/systemd/system/voice-ai-buddy.service"
if [ -f "$SERVICE_FILE" ]; then
    echo ""
    echo "Service file content (ExecStartPre line):"
    grep "ExecStartPre" "$SERVICE_FILE" || echo "  No ExecStartPre found!"
    
    if grep -q "voice_ai_buddy_orchestrator" "$SERVICE_FILE"; then
        echo "✓ Service file uses orchestrator"
    else
        echo "✗ Service file does NOT use orchestrator"
        echo "  Should have: ExecStartPre=/usr/bin/python3 /opt/voice_ai_buddy_orchestrator/apply_update.py || true"
    fi
else
    echo "✗ Service file not found: $SERVICE_FILE"
fi

# Check state
STATE_FILE="/var/lib/voice_ai_buddy/update_state.txt"
if [ -f "$STATE_FILE" ]; then
    STATE=$(cat "$STATE_FILE" | tr -d '\n')
    echo ""
    echo "Current update state: $STATE"
else
    echo ""
    echo "State file not found: $STATE_FILE"
fi

# Check version directories
echo ""
echo "Version directories:"
[ -d "/opt/voice_ai_buddy_v1" ] && echo "  ✓ v1 exists" || echo "  ✗ v1 missing"
[ -d "/opt/voice_ai_buddy_v2" ] && echo "  ✓ v2 exists" || echo "  ✗ v2 missing"

# Check symlink
echo ""
if [ -L "/opt/voice_ai_buddy" ]; then
    LINK_TARGET=$(readlink -f "/opt/voice_ai_buddy")
    echo "✓ Production symlink exists: /opt/voice_ai_buddy -> $LINK_TARGET"
else
    echo "✗ Production symlink missing or not a symlink"
fi

# Check staging
echo ""
if [ -d "/opt/voice_ai_buddy_staging" ]; then
    echo "✓ Staging directory exists"
    if [ -d "/opt/voice_ai_buddy_staging/.git" ]; then
        echo "  ✓ Staging is a git repository"
    else
        echo "  ✗ Staging is NOT a git repository"
    fi
else
    echo "✗ Staging directory missing"
fi

# Check shared resources
echo ""
echo "Shared resources:"
[ -d "/var/lib/voice_ai_buddy/venv" ] && echo "  ✓ Shared venv exists" || echo "  ✗ Shared venv missing"
[ -f "/var/lib/voice_ai_buddy/.env" ] && echo "  ✓ Shared .env exists" || echo "  ✗ Shared .env missing"

# Test orchestrator manually
echo ""
echo "=== Testing Orchestrator ==="
if [ -f "$ORCHESTRATOR" ]; then
    echo "Running orchestrator manually..."
    sudo /usr/bin/python3 "$ORCHESTRATOR"
    echo ""
    echo "New state after test:"
    [ -f "$STATE_FILE" ] && cat "$STATE_FILE" || echo "  (no state file)"
else
    echo "Cannot test - orchestrator not installed"
fi

echo ""
echo "=== Diagnostic Complete ==="

