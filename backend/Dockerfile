# Dockerfile for backend deployment (optional)
# Useful for platforms that support Docker or if you want more control

FROM python:3.11-slim

WORKDIR /app

# Install ffmpeg for pydub audio processing (required for mobile-optimized audio)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Expose port (will be overridden by platform)
EXPOSE 8000

# Use gunicorn for production
CMD ["gunicorn", "main:app", "-w", "4", "-k", "uvicorn.workers.UvicornWorker", "--bind", "0.0.0.0:8000"]

