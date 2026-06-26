FROM python:3.12-slim

# `unrar` é essencial: a lib `rarfile` delega a extração ao binário externo.
# `unar` fica como fallback alternativo.
RUN apt-get update \
    && apt-get install -y --no-install-recommends unrar-free unar \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY alembic ./alembic
COPY alembic.ini ./alembic.ini
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

EXPOSE 8000

# Aplica migrações (alembic) e então sobe a API.
CMD ["./entrypoint.sh"]
