# ---- deps ----
FROM node:20-slim AS deps
WORKDIR /app
COPY package.json ./
RUN npm install

# ---- builder ----
FROM node:20-slim AS builder
WORKDIR /app
# NEXT_PUBLIC_* é inlined no build, então precisa estar disponível aqui.
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- runner ----
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
# Output standalone do Next: traz apenas o necessário.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
