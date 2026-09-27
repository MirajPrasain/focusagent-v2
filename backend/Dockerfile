# Multi-stage build for Python FastAPI application
FROM python:3.12-slim as builder

# Set working directory
WORKDIR /app

# Install build tools for packages that compile native extensions
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Production stage
FROM python:3.12-slim

# Set working directory
WORKDIR /app

# Copy Python packages from builder
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Copy application code
COPY . .

# Create necessary directories if they don't exist
RUN mkdir -p /app/logs

# Expose port (Render will provide PORT env variable)
EXPOSE 8000

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV PORT=8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD python -c "import os, urllib.request; urllib.request.urlopen(f\"http://localhost:{os.environ.get('PORT', '8000')}/\", timeout=5)" || exit 1

# Run the application with uvicorn
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1
