# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# ── Stage 2: Production ──────────────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

# Fuso horário da clínica (GMT-3). node:alpine usa UTC por padrão, o que
# quebraria a lógica de horário de atendimento e feriados.
ENV TZ=America/Recife
RUN apk add --no-cache tzdata

# Apenas dependências de produção
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copia o build compilado
COPY --from=builder /app/dist ./dist

# Cria diretórios de runtime
RUN mkdir -p data logs

EXPOSE 3000

CMD ["node", "dist/index.js"]
