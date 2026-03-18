FROM python:3.11-slim AS builder

WORKDIR /build
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

FROM python:3.11-slim

RUN groupadd -r appuser && useradd -r -g appuser appuser
WORKDIR /app

COPY --from=builder /install /usr/local
COPY --chown=appuser:appuser . .

USER appuser
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
