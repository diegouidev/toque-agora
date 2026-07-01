#!/bin/sh
# Entrypoint do backend: aplica as migrações antes de subir a API.
set -e

echo "[entrypoint] Aguardando o banco e aplicando migrações..."

# Espera o Postgres aceitar conexão (o compose já tem depends_on healthy, mas
# garantimos aqui com algumas tentativas — robusto contra corrida de startup).
i=0
until python -c "
import asyncio, sys
from app.database import engine
async def ping():
    async with engine.connect() as c:
        await c.exec_driver_sql('SELECT 1')
asyncio.run(ping())
" 2>/dev/null; do
  i=$((i + 1))
  if [ "$i" -ge 30 ]; then
    echo "[entrypoint] Banco não respondeu a tempo." >&2
    break
  fi
  sleep 1
done

# Banco LEGADO: já tem as tabelas do app (ex. 'users') mas não tem 'alembic_version'
# (foi criado por create_all antes do Alembic). Nesse caso, marca na revisão BASELINE
# (não em head!) — o baseline representa o schema pré-Alembic; o 'upgrade head' abaixo
# aplica então as migrações incrementais (colunas/tabelas novas).
# ATENÇÃO: usar 'stamp head' aqui é um BUG — marca tudo como migrado sem rodar os ALTERs,
# deixando o banco sem as colunas novas (ex.: users.is_active) e quebrando o startup.
BASELINE_REV="892f4e6e2e3a"
LEGACY=$(python -c "
import asyncio
from sqlalchemy import text
from app.database import engine
async def check():
    async with engine.connect() as c:
        has_users = (await c.exec_driver_sql(\"SELECT to_regclass('public.users')\")).scalar()
        has_ver = (await c.exec_driver_sql(\"SELECT to_regclass('public.alembic_version')\")).scalar()
        print('1' if (has_users and not has_ver) else '0')
asyncio.run(check())
" 2>/dev/null || echo "0")

if [ "$LEGACY" = "1" ]; then
  echo "[entrypoint] Banco legado detectado — marcando na baseline ($BASELINE_REV)."
  alembic stamp "$BASELINE_REV"
fi

echo "[entrypoint] alembic upgrade head"
alembic upgrade head

echo "[entrypoint] Iniciando a API."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
