# ============================================================
# Stage 1: Build Frontend Assets
# ============================================================
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# ============================================================
# Stage 2: Production Python Container
# ============================================================
FROM python:3.11-slim AS production

# Install OS audio libraries required by libsndfile
RUN apt-get update && apt-get install -y --no-install-recommends \
    libsndfile1 \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python requirements
COPY backend/requirements-backend.txt /app/backend/requirements-backend.txt
RUN pip install --no-cache-dir -r /app/backend/requirements-backend.txt

# Copy ONNX models, source code, and backend
COPY models/onnx_export /app/models/onnx_export
COPY src /app/src
COPY backend /app/backend

# Copy built frontend assets into the container
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# Set production environment variables
ENV PYTHONUNBUFFERED=1 \
    PORT=8000 \
    HOST=0.0.0.0

EXPOSE 8000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:${PORT}/api/health || exit 1

# Start the unified FastAPI + Static Frontend application
CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT}"]
