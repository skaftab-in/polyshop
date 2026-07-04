# Lightweight Python base. slim keeps the image small.
FROM python:3.12-slim

WORKDIR /app

# Copy deps first so Docker can cache the pip install layer
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .

EXPOSE 8000

# uvicorn is the ASGI server that runs FastAPI
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
