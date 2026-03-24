FROM python:3.12-slim

WORKDIR /app

# Install dependencies first for better layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source
COPY bot/ ./bot/

# Data volume mount point
RUN mkdir -p /app/data

ENV PYTHONUNBUFFERED=1 \
    DB_PATH=/app/data/bot.db \
    LOG_LEVEL=INFO \
    REMINDER_MINUTES=30

CMD ["python", "-m", "bot.main"]
