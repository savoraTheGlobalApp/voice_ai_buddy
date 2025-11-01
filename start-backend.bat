@echo off
REM Start backend server for Windows
REM Usage: start-backend.bat

cd backend

REM Activate virtual environment if it exists
if exist venv\Scripts\activate.bat (
    call venv\Scripts\activate.bat
)

REM Check if .env exists
if not exist .env (
    echo Warning: .env file not found. Please create it from .env.example
)

REM Run backend
python main.py

