FROM python:3.11-slim

# Install system dependencies including poppler for pdf2image
RUN apt-get update && apt-get install -y poppler-utils build-essential libpq-dev python3-dev && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application
COPY . .

# Listen on 8000 inside the container only (not published to the host).
# Host/NSG 8000 = Coolify UI; container 8000 = FastAPI on the Docker network — no clash.
# Port 80 inside the app container often fails (no CAP_NET_BIND_SERVICE) → unhealthy deploy.
EXPOSE 8000
ENV PORT=8000

# Multi-worker defaults for Azure D4as-class (4 vCPU). Semaphores are per-process;
# with WEB_CONCURRENCY=2, 3+3 AI / 2+2 file ≈ prior single-worker 5/4 budget.
ENV WEB_CONCURRENCY=2
ENV AI_SEMAPHORE_LIMIT=3
ENV FILE_SEMAPHORE_LIMIT=2

# Shell form so ${WEB_CONCURRENCY} / ${PORT} expand (Coolify/Azure may override CMD).
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT} --workers ${WEB_CONCURRENCY}
