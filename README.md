# 🎧 TOQUE AGORA — A sua Playlist preferida

Web app de player de música que faz **streaming de áudio sob demanda de dentro de arquivos
`.rar`/`.zip`**, sem descompactar o arquivo inteiro no disco. Com login, quotas por usuário,
capas embutidas e player estilo Spotify (mobile-first).

Como funciona: você envia um `.rar`/`.zip` com MP3s → cada subpasta vira uma "banda" → ao dar
Play, o back-end extrai **apenas aquela faixa** para a memória e transmite por HTTP com suporte a
`Range` (seek). Imagens dentro do arquivo viram capa da banda.

## Stack

- **Back-end:** Python + FastAPI (async/streaming), `rarfile` (usa `unar`/`unrar`), JWT em cookie.
- **Front-end:** Next.js (App Router) + Tailwind — player estilo Spotify.
- **Banco:** PostgreSQL.
- **Proxy:** Caddy (domínio único: front + API sob `/api`).
- **Infra:** `docker-compose` (caddy + front + back + postgres + volume dos arquivos).

## Arquitetura

```
Navegador ─► Cloudflare Tunnel ─► Caddy :8080 ─┬─ /api/*  ─► backend  (FastAPI)
                                               └─ /*      ─► frontend (Next.js)
                                                              backend ─► postgres
```

Tudo passa por um único domínio (sem CORS). A autenticação usa **cookie HttpOnly+Secure**, então
não há token em URLs (nem no `<audio>`/capa).

## Rodando local (WSL2 / Ubuntu)

```bash
cp .env.example .env
# Para teste local em HTTP, no .env: DEBUG=true e COOKIE_SECURE=false
docker compose up --build
```

Acesse **http://localhost:8080** (porta do Caddy). Login com `ADMIN_EMAIL`/`ADMIN_PASSWORD`.

> **WSL2:** mantenha `RARS_HOST_PATH` no filesystem do Linux (`./data/rars`); evite `/mnt/c`.

## Produção via Cloudflare Tunnel (play.diegodev.app.br)

1. No `.env`: `DEBUG=false`, `COOKIE_SECURE=true`, e gere o segredo:
   `JWT_SECRET=$(openssl rand -hex 32)`. Troque `ADMIN_PASSWORD`/`POSTGRES_PASSWORD`.
2. `docker compose up --build -d`.
2b. **Aplique as migrações** (cria/atualiza o schema sem perder dados):
   ```bash
   docker compose exec backend alembic upgrade head
   ```
   > Alternativa automática: defina `RUN_MIGRATIONS_ON_STARTUP=true` no `.env` para o backend
   > rodar `alembic upgrade head` sozinho a cada start.
   >
   > Banco que **já existia** antes do Alembic (criado por `create_all`): rode uma vez
   > `docker compose exec backend alembic stamp head` para marcá-lo como migrado **sem recriar** —
   > seus dados ficam intactos.
3. Configure o Cloudflare Tunnel apontando o hostname para o Caddy:
   ```bash
   cloudflared tunnel create toqueagora
   # No config do tunnel (~/.cloudflared/config.yml ou painel):
   #   ingress:
   #     - hostname: play.diegodev.app.br
   #       service: http://localhost:8080      # Caddy (se cloudflared roda no host)
   #     - service: http_status:404
   cloudflared tunnel route dns toqueagora play.diegodev.app.br
   cloudflared tunnel run toqueagora
   ```
   > Se rodar o `cloudflared` em container, aponte para `http://caddy:8080` na mesma rede.
   > **Não** versione o token do tunnel no repositório.
4. Abra `https://play.diegodev.app.br`.

## Segurança (implementado)

- Autenticação por **cookie HttpOnly+Secure** (sem token em URL).
- **Rate-limit** no login (5 tentativas / 5 min → 429).
- Senha mínima de **8** caracteres; `JWT_SECRET` obrigatório em produção (app recusa subir com o
  default quando `DEBUG=false`).
- Upload valida **magic bytes** (não só a extensão).
- `/docs` e `/redoc` desativados em produção (`DEBUG=false`).
- Isolamento por usuário (cada um vê só a própria coleção; admin vê tudo) e **quotas** por GB.
- **Migrations com Alembic** — schema versionado; evoluir tabelas sem dropar o banco
  (`alembic upgrade head`). Em DEBUG o schema é criado automaticamente (sem migração).
- **Player persistente** — fila, faixa e posição são salvas no navegador; ao recarregar, retoma
  de onde parou (pausado).

## Rotas principais

| Método | Rota | Descrição |
| --- | --- | --- |
| `POST` | `/api/auth/login` / `logout` | Login (seta cookie) / logout |
| `GET` | `/api/auth/me` | Usuário logado + uso de quota |
| `POST/GET/PATCH/DELETE` | `/api/users…` | Admin: CRUD de usuários e quota |
| `POST` | `/api/upload` | Envia `.rar`/`.zip` (multi, com quota) |
| `POST` | `/api/upload/chunk` | Envia um pedaço (<100 MB) — passa pelo proxy/Cloudflare |
| `POST` | `/api/upload/complete` | Finaliza o upload em pedaços e indexa as bandas |
| `POST` | `/api/upload/abort` | Cancela o upload em pedaços (limpa o temporário) |
| `GET` | `/api/admin/overview` | Admin: totais, stats por usuário e mais tocadas |
| `GET` | `/api/bands` | Bandas do usuário |
| `GET` | `/api/bands/{id}/tracks` | Faixas de uma banda |
| `GET` | `/api/bands/{id}/cover` | Capa da banda (de dentro do arquivo) |
| `PATCH` | `/api/bands/{id}` | Renomeia a banda (dono/admin) |
| `PATCH` | `/api/tracks/{id}` | Renomeia a faixa (dono/admin) |
| `GET` | `/api/stream/{track_id}` | Streaming da faixa (Range/206) |
| `DELETE` | `/api/archives/{id}` | Exclui o arquivo (disco + banco) |
| `GET` | `/api/search?q=` | Busca bandas e faixas por nome |
| `POST` | `/api/history/{track_id}` | Registra uma reprodução (tocadas recentemente) |
| `GET` | `/api/history` | Bandas tocadas recentemente |
| `PUT/DELETE/GET` | `/api/favorites…` | Curtir/descurtir e listar curtidas |
| `GET/POST/DELETE` | `/api/playlists…` | CRUD de playlists, faixas e ordem |
| `GET` | `/api/playlists/shared` | Playlists compartilhadas comigo |
| `POST/GET/DELETE` | `/api/playlists/{id}/share…` | Compartilhar com usuário / listar / remover |
