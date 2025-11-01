#!/bin/bash
# Start backend server
# Usage: ./start-backend.sh

cd backend

# Activate virtual environment if it exists
if [ -d "venv" ]; then
    source venv/bin/activate
fi

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "Warning: .env file not found. Please create it from .env.example"
fi

# Run backend
python main.py

