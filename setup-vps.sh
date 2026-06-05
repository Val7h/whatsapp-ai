#!/usr/bin/env bash
# =============================================================================
# setup-vps.sh — Instalação completa do WhatsApp AI · Clínica CTO
# =============================================================================
# Uso:  sudo bash setup-vps.sh
# Req.: Ubuntu 22.04 / 24.04 LTS · 2 GB RAM · 20 GB disco
# =============================================================================
set -euo pipefail

# ── Cores para output ─────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $*"; }
info() { echo -e "${CYAN}[→]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
fail() { echo -e "${RED}[✗]${NC} $*"; exit 1; }
section() { echo -e "\n${BOLD}${CYAN}══════════════════════════════════════════${NC}"; \
             echo -e "${BOLD}${CYAN}  $*${NC}"; \
             echo -e "${BOLD}${CYAN}══════════════════════════════════════════${NC}\n"; }

# ── Verificações básicas ──────────────────────────────────────────────────────
[[ $EUID -ne 0 ]] && fail "Execute como root: sudo bash setup-vps.sh"
[[ $(uname -s) != "Linux" ]] && fail "Este script é somente para Linux (Ubuntu)."

# ── Configurações ─────────────────────────────────────────────────────────────
INSTALL_DIR="/opt/whatsapp-ai"
COMPOSE_VERSION="2.27.0"

# Credenciais — usa env vars se já definidas, gera aleatórias caso contrário
ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}"
WEBHOOK_SECRET="${WEBHOOK_SECRET:-meu-segredo-cto-$(openssl rand -hex 8)}"
EVOLUTION_API_KEY="${EVOLUTION_API_KEY:-cto-evolution-key-$(openssl rand -hex 8)}"
N8N_USER="${N8N_USER:-admin@clinicacto.com.br}"
N8N_PASSWORD="${N8N_PASSWORD:-Admin$(openssl rand -hex 4 | tr '[:lower:]' '[:upper:]' | head -c 6)}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-evolution$(openssl rand -hex 8)}"
PUBLIC_IP="${PUBLIC_IP:-}"

# =============================================================================
section "Bem-vindo ao instalador WhatsApp AI · Clínica CTO"
# =============================================================================

echo -e "${BOLD}Este script irá instalar:${NC}"
echo "  • Docker Engine"
echo "  • Redis 7, PostgreSQL 15"
echo "  • WhatsApp AI backend (Node.js 22 / TypeScript)"
echo "  • Evolution API v2 (3 instâncias WhatsApp)"
echo "  • n8n (automação)"
echo ""
warn "Certifique-se de que as portas 8080 e 5678 estão liberadas no firewall."
echo ""

# ── Validar ANTHROPIC_API_KEY ─────────────────────────────────────────────────
[[ -z "$ANTHROPIC_API_KEY" ]] && fail "Defina ANTHROPIC_API_KEY antes de executar o script."

# ── Detectar IP público ────────────────────────────────────────────────────────
info "Detectando IP público..."
if [[ -z "$PUBLIC_IP" ]]; then
  PUBLIC_IP=$(curl -sf https://api.ipify.org || curl -sf https://ifconfig.me || echo "2.25.147.8")
fi
log "IP público: $PUBLIC_IP"

echo ""
echo -e "${BOLD}Credenciais:${NC}"
echo "  WEBHOOK_SECRET   : $WEBHOOK_SECRET"
echo "  EVOLUTION_API_KEY: $EVOLUTION_API_KEY"
echo "  n8n login        : $N8N_USER / $N8N_PASSWORD"
echo ""

# =============================================================================
section "1 / 7 · Atualizando sistema e instalando dependências"
# =============================================================================

apt-get update -qq
apt-get install -y -qq \
  ca-certificates curl gnupg lsb-release \
  apt-transport-https software-properties-common \
  git jq openssl qrencode 2>/dev/null || true

log "Pacotes base instalados."

# =============================================================================
section "2 / 7 · Instalando Docker Engine"
# =============================================================================

if command -v docker &>/dev/null; then
  log "Docker já instalado: $(docker --version)"
else
  info "Adicionando repositório Docker..."
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg

  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    | tee /etc/apt/sources.list.d/docker.list > /dev/null

  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin
  systemctl enable docker --now
  log "Docker instalado: $(docker --version)"
fi

# Docker Compose plugin
if ! docker compose version &>/dev/null; then
  info "Instalando Docker Compose plugin..."
  ARCH=$(dpkg --print-architecture)
  curl -SL "https://github.com/docker/compose/releases/download/v${COMPOSE_VERSION}/docker-compose-linux-${ARCH}" \
    -o /usr/local/lib/docker/cli-plugins/docker-compose
  mkdir -p /usr/local/lib/docker/cli-plugins
  curl -SL "https://github.com/docker/compose/releases/download/v${COMPOSE_VERSION}/docker-compose-linux-${ARCH}" \
    -o /usr/local/lib/docker/cli-plugins/docker-compose
  chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
  log "Docker Compose instalado: $(docker compose version)"
else
  log "Docker Compose já disponível: $(docker compose version)"
fi

# =============================================================================
section "3 / 7 · Criando estrutura de arquivos do projeto"
# =============================================================================

mkdir -p "$INSTALL_DIR"/{src/{prompts,routes,services,db},}
cd "$INSTALL_DIR"
log "Diretório: $INSTALL_DIR"

# ── package.json ──────────────────────────────────────────────────────────────
info "Criando package.json..."
cat > package.json << 'PKGJSON'
{
  "name": "whatsapp-ai",
  "version": "1.0.0",
  "description": "WhatsApp AI Assistant — Assistente Ortopédico da Clínica CTO",
  "main": "dist/index.js",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.30.0",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "ioredis": "^5.3.2",
    "winston": "^3.13.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/node": "^22.9.0",
    "tsx": "^4.15.6",
    "typescript": "^5.4.5"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
PKGJSON

# ── tsconfig.json ─────────────────────────────────────────────────────────────
info "Criando tsconfig.json..."
cat > tsconfig.json << 'TSCFG'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
TSCFG

# ── Dockerfile ────────────────────────────────────────────────────────────────
info "Criando Dockerfile..."
cat > Dockerfile << 'DOCKERFILE'
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY --from=builder /app/dist ./dist
RUN mkdir -p data logs
EXPOSE 3000
CMD ["node", "dist/index.js"]
DOCKERFILE

# ── src/types.ts ──────────────────────────────────────────────────────────────
info "Criando src/types.ts..."
cat > src/types.ts << 'TYPES_TS'
export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface WebhookPayload {
  phone: string;
  name: string;
  message: string;
  instance?: string;
}

export interface WebhookResponse {
  reply: string;
}

export interface HealthResponse {
  status: 'ok';
  timestamp: string;
  redis: 'connected' | 'in-memory';
  model: string;
}

export interface ConversationLog {
  phone: string;
  patient_name: string | null;
  user_message: string;
  assistant_reply: string;
  tokens_input: number | null;
  tokens_output: number | null;
}

export interface ClaudeResponse {
  reply: string;
  tokens_input: number;
  tokens_output: number;
}

export type RateLimitMap = Map<string, number[]>;
TYPES_TS

# ── src/prompts/system.ts ─────────────────────────────────────────────────────
info "Criando src/prompts/system.ts..."
cat > src/prompts/system.ts << 'SYSTEM_TS'
import dotenv from 'dotenv';
dotenv.config();

const DOCTOR    = 'Dr. Valth Menezes Guimarães';
const DOCTOR_ID = 'CRM-PB 6326 / RQE-PB 5708';
const SPECIALTY = 'Ortopedia e Traumatologia';

const COMMON_RULES = `
REGRAS CRÍTICAS:
1. NUNCA forneça diagnóstico definitivo — use "pode ser indicativo de" ou "necessário avaliação presencial"
2. Trauma agudo (fratura suspeita, luxação, lesão grave): instrua IMEDIATAMENTE a ir ao pronto-socorro ou ligar para o SAMU 192
3. Não prescreva medicamentos — nem dose, nem nome comercial
4. Dor intensa, febre alta com dor articular, formigamento em membros, perda de força súbita = URGENTE → PS imediato
5. Respostas concisas (máximo 5 parágrafos curtos)
6. Linguagem acolhedora, sem jargões excessivos
7. Se não souber responder com segurança, diga que vai verificar com o ${DOCTOR} e oriente a aguardar

TRIAGEM RÁPIDA:
- Paciente escreve "AGENDAR": oriente a informar nome, motivo e horário preferido
- Paciente escreve "URGÊNCIA": oriente PS imediatamente
- Paciente pergunta sobre exame: oriente que exames dependem de avaliação presencial
`.trim();

const PROMPT_CARUARU = `
Você é a assistente virtual do ${DOCTOR}, ${SPECIALTY} (${DOCTOR_ID}),
responsável pelo atendimento das unidades de Caruaru-PE.

UNIDADES QUE VOCÊ ATENDE (Caruaru-PE):
• Instituto Pernambuco (IP)
• Unimagem
• Intensiva Day

SUA FUNÇÃO:
- Acolher pacientes com cordialidade e linguagem simples
- Responder dúvidas gerais sobre ortopedia, traumatologia e pós-operatório de forma educativa e segura
- Identificar se o caso é urgente (PS) ou eletivo (consulta agendada)
- Informar sobre procedimentos realizados: artroscopia, reconstrução de LCA, cirurgia de joelho, tornozelo, ombro, quadril, coluna, fraturas e bloqueios/infiltrações guiados por ultrassom

AGENDAMENTO:
Quando o paciente quiser marcar consulta, peça:
"Informe aqui: *nome completo*, *motivo da consulta* e *melhor horário*.
Nossa secretária entrará em contato para confirmar.
Ou ligue diretamente: *+55 (81) 99929-4960*"

${COMMON_RULES}
`.trim();

const PROMPT_CAMPINA = `
Você é a assistente virtual do ${DOCTOR}, ${SPECIALTY} (${DOCTOR_ID}),
responsável pelo atendimento das unidades de Campina Grande-PB.

UNIDADES QUE VOCÊ ATENDE (Campina Grande-PB):
• Clínica Artro
• CTO – Centro de Trauma e Ortopedia
  (Equipamentos: Ultrassom GE Healthcare Venue 40 para procedimentos guiados)

SUA FUNÇÃO:
- Acolher pacientes com cordialidade e linguagem simples
- Responder dúvidas gerais sobre ortopedia, traumatologia e pós-operatório de forma educativa e segura
- Identificar se o caso é urgente (PS) ou eletivo (consulta agendada)
- Informar sobre procedimentos realizados: artroscopia, reconstrução de LCA, cirurgia de joelho, tornozelo, ombro, quadril, coluna, fraturas e bloqueios/infiltrações guiados por ultrassom

AGENDAMENTO:
Quando o paciente quiser marcar consulta, peça:
"Informe aqui: *nome completo*, *motivo da consulta* e *melhor horário*.
Nossa secretária entrará em contato para confirmar.
Ou ligue diretamente: *+55 (83) 99351-4284*"

${COMMON_RULES}
`.trim();

const PROMPT_GERAL = `
Você é a assistente virtual pessoal do ${DOCTOR}, ${SPECIALTY} (${DOCTOR_ID}).

Este é o WhatsApp geral do Dr. Valth. Você atende pacientes de TODAS as unidades:

CARUARU-PE:
• Instituto Pernambuco (IP)
• Unimagem
• Intensiva Day

CAMPINA GRANDE-PB:
• Clínica Artro
• CTO – Centro de Trauma e Ortopedia
  (Ultrassom GE Healthcare Venue 40 para procedimentos guiados)

PALMARES-PE:
• Clínica Mário Bento
  Endereço: Rua Capitão Pedro Ivo, 608 - Loja B, Centro / Alto do Inglês, Palmares-PE, CEP 55540-000
  Telefone: +55 (81) 98762-9694

SUA FUNÇÃO:
- Acolher pacientes com cordialidade e linguagem simples
- Responder dúvidas gerais sobre ortopedia, traumatologia e pós-operatório de forma educativa e segura
- Identificar se o caso é urgente (PS) ou eletivo (consulta agendada)
- Informar sobre procedimentos realizados: artroscopia, reconstrução de LCA, cirurgia de joelho, tornozelo, ombro, quadril, coluna, fraturas e bloqueios/infiltrações guiados por ultrassom
- O agendamento é confirmado diretamente pelo Dr. Valth

AGENDAMENTO:
Quando o paciente quiser marcar consulta, peça:
"Responda com *AGENDAR* informando:
  1. Nome completo
  2. Cidade/unidade de preferência (Caruaru, Campina Grande ou Palmares)
  3. Motivo da consulta
  4. Melhor dia e horário
O Dr. Valth confirmará pessoalmente pelo *+55 (81) 99917-9609*."

${COMMON_RULES}
`.trim();

export const INSTANCE_PHONES: Record<string, string> = {
  'cto-caruaru': '+55 (81) 99929-4960',
  'cto-campina': '+55 (83) 99351-4284',
  'cto-geral':   '+55 (81) 99917-9609',
};

export function getInstancePhone(instance?: string): string {
  if (!instance) return INSTANCE_PHONES['cto-geral'];
  return INSTANCE_PHONES[instance] ?? INSTANCE_PHONES['cto-geral'];
}

const PROMPTS: Record<string, string> = {
  'cto-caruaru': PROMPT_CARUARU,
  'cto-campina': PROMPT_CAMPINA,
  'cto-geral':   PROMPT_GERAL,
};

export function getSystemPrompt(instance?: string): string {
  if (!instance) return PROMPT_GERAL;
  return PROMPTS[instance] ?? PROMPT_GERAL;
}

export const SYSTEM_PROMPT = PROMPT_GERAL;
SYSTEM_TS

# ── src/services/logger.ts ────────────────────────────────────────────────────
info "Criando src/services/logger.ts..."
cat > src/services/logger.ts << 'LOGGER_TS'
import winston from 'winston';
import path from 'path';
import fs from 'fs';

const logDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const { combine, timestamp, printf, colorize, errors } = winston.format;

const logFormat = printf(({ level, message, timestamp: ts, stack }) => {
  return `${ts} [${level}]: ${stack ?? message}`;
});

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? 'info',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    logFormat,
  ),
  transports: [
    new winston.transports.Console({
      format: combine(
        colorize(),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        errors({ stack: true }),
        logFormat,
      ),
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
    }),
  ],
});
LOGGER_TS

# ── src/services/memory.ts ────────────────────────────────────────────────────
info "Criando src/services/memory.ts..."
cat > src/services/memory.ts << 'MEMORY_TS'
import Redis from 'ioredis';
import { Message } from '../types.js';
import { logger } from './logger.js';

const MAX_TURNS = parseInt(process.env.MAX_HISTORY_TURNS ?? '20', 10);
const MAX_MESSAGES = MAX_TURNS * 2;
const REDIS_TTL_SECONDS = 48 * 60 * 60;
const KEY_PREFIX = 'whatsapp_history:';

let redisClient: Redis | null = null;
let usingRedis = false;
const memoryStore = new Map<string, Message[]>();

export function getMemoryMode(): 'connected' | 'in-memory' {
  return usingRedis ? 'connected' : 'in-memory';
}

export async function initMemory(): Promise<void> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    logger.warn('[memory] REDIS_URL não configurado — usando Map em memória');
    return;
  }
  try {
    redisClient = new Redis(redisUrl, {
      lazyConnect: true,
      connectTimeout: 3000,
      maxRetriesPerRequest: 1,
    });
    await redisClient.connect();
    usingRedis = true;
    logger.info('[memory] Redis conectado com sucesso');
  } catch (err) {
    logger.warn(`[memory] Redis indisponível — usando Map em memória. Erro: ${String(err)}`);
    redisClient = null;
    usingRedis = false;
  }
}

async function redisGet(phone: string): Promise<Message[]> {
  if (!redisClient) return [];
  try {
    const raw = await redisClient.get(`${KEY_PREFIX}${phone}`);
    return raw ? (JSON.parse(raw) as Message[]) : [];
  } catch (err) {
    logger.error(`[memory] Erro ao ler Redis: ${String(err)}`);
    return [];
  }
}

async function redisSet(phone: string, messages: Message[]): Promise<void> {
  if (!redisClient) return;
  try {
    await redisClient.set(
      `${KEY_PREFIX}${phone}`,
      JSON.stringify(messages),
      'EX',
      REDIS_TTL_SECONDS,
    );
  } catch (err) {
    logger.error(`[memory] Erro ao escrever Redis: ${String(err)}`);
  }
}

async function redisDel(phone: string): Promise<void> {
  if (!redisClient) return;
  try {
    await redisClient.del(`${KEY_PREFIX}${phone}`);
  } catch (err) {
    logger.error(`[memory] Erro ao deletar Redis: ${String(err)}`);
  }
}

export async function getHistory(phone: string): Promise<Message[]> {
  if (usingRedis) return redisGet(phone);
  return memoryStore.get(phone) ?? [];
}

export async function appendToHistory(
  phone: string,
  userMsg: string,
  assistantMsg: string,
): Promise<void> {
  const history = await getHistory(phone);
  history.push({ role: 'user', content: userMsg });
  history.push({ role: 'assistant', content: assistantMsg });
  const trimmed =
    history.length > MAX_MESSAGES ? history.slice(history.length - MAX_MESSAGES) : history;
  if (usingRedis) {
    await redisSet(phone, trimmed);
  } else {
    memoryStore.set(phone, trimmed);
  }
}

export async function clearHistory(phone: string): Promise<void> {
  if (usingRedis) {
    await redisDel(phone);
  } else {
    memoryStore.delete(phone);
  }
  logger.info(`[memory] Histórico limpo para ${phone}`);
}
MEMORY_TS

# ── src/services/claude.ts ────────────────────────────────────────────────────
info "Criando src/services/claude.ts..."
cat > src/services/claude.ts << 'CLAUDE_TS'
import Anthropic from '@anthropic-ai/sdk';
import { Message, ClaudeResponse } from '../types.js';
import { getSystemPrompt } from '../prompts/system.js';
import { logger } from './logger.js';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-6';
const MAX_TOKENS = 1024;

const FALLBACK_REPLY =
  'No momento não consigo processar sua mensagem. Por favor, ligue para a clínica.';

export async function askClaude(
  history: Message[],
  userMessage: string,
  instance?: string,
): Promise<ClaudeResponse> {
  const systemPrompt = getSystemPrompt(instance);
  const messages: Anthropic.MessageParam[] = [
    ...history.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user' as const, content: userMessage },
  ];

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages,
    });

    const tokens_input = response.usage.input_tokens;
    const tokens_output = response.usage.output_tokens;

    logger.info(`[claude] Tokens usados — input: ${tokens_input}, output: ${tokens_output}`);

    const firstBlock = response.content[0];
    if (firstBlock.type !== 'text') {
      logger.warn('[claude] Primeiro bloco de resposta não é texto');
      return { reply: FALLBACK_REPLY, tokens_input, tokens_output };
    }

    return { reply: firstBlock.text, tokens_input, tokens_output };
  } catch (err) {
    logger.error(`[claude] Erro na API Anthropic: ${String(err)}`);
    return { reply: FALLBACK_REPLY, tokens_input: 0, tokens_output: 0 };
  }
}
CLAUDE_TS

# ── src/db/sqlite.ts ──────────────────────────────────────────────────────────
info "Criando src/db/sqlite.ts..."
cat > src/db/sqlite.ts << 'SQLITE_TS'
import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import { ConversationLog } from '../types.js';
import { logger } from '../services/logger.js';

const dbDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'conversations.db');
const db = new DatabaseSync(dbPath);

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS conversations (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    phone            TEXT    NOT NULL,
    patient_name     TEXT,
    user_message     TEXT    NOT NULL,
    assistant_reply  TEXT    NOT NULL,
    tokens_input     INTEGER,
    tokens_output    INTEGER,
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_conversations_phone
    ON conversations (phone);

  CREATE INDEX IF NOT EXISTS idx_conversations_created_at
    ON conversations (created_at);
`);

logger.info(`[sqlite] Banco de dados inicializado em: ${dbPath}`);

const insertStmt = db.prepare(`
  INSERT INTO conversations
    (phone, patient_name, user_message, assistant_reply, tokens_input, tokens_output)
  VALUES
    (@phone, @patient_name, @user_message, @assistant_reply, @tokens_input, @tokens_output)
`);

export function logConversation(data: ConversationLog): void {
  try {
    insertStmt.run({
      '@phone': data.phone,
      '@patient_name': data.patient_name,
      '@user_message': data.user_message,
      '@assistant_reply': data.assistant_reply,
      '@tokens_input': data.tokens_input,
      '@tokens_output': data.tokens_output,
    } as Record<string, string | number | null>);
  } catch (err) {
    logger.error(`[sqlite] Erro ao salvar conversa: ${String(err)}`);
  }
}

export default db;
SQLITE_TS

# ── src/routes/health.ts ──────────────────────────────────────────────────────
info "Criando src/routes/health.ts..."
cat > src/routes/health.ts << 'HEALTH_TS'
import { Router, Request, Response } from 'express';
import { getMemoryMode } from '../services/memory.js';
import { HealthResponse } from '../types.js';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  const payload: HealthResponse = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    redis: getMemoryMode(),
    model: process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-6',
  };
  res.json(payload);
});

export default router;
HEALTH_TS

# ── src/routes/webhook.ts ─────────────────────────────────────────────────────
info "Criando src/routes/webhook.ts..."
cat > src/routes/webhook.ts << 'WEBHOOK_TS'
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getHistory, appendToHistory, clearHistory } from '../services/memory.js';
import { askClaude } from '../services/claude.js';
import { getInstancePhone } from '../prompts/system.js';
import { logConversation } from '../db/sqlite.js';
import { logger } from '../services/logger.js';
import { RateLimitMap, WebhookResponse } from '../types.js';

const router = Router();

const WebhookSchema = z.object({
  phone: z.string().min(8).max(20),
  name: z.string().min(1).max(100).optional().default('Paciente'),
  message: z.string().min(1).max(4000),
  instance: z.string().optional(),
});

const rateLimitMap: RateLimitMap = new Map();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

function isRateLimited(phone: string): boolean {
  const now = Date.now();
  const timestamps = rateLimitMap.get(phone) ?? [];
  const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX) {
    rateLimitMap.set(phone, recent);
    return true;
  }
  recent.push(now);
  rateLimitMap.set(phone, recent);
  return false;
}

function isAllowedPhone(phone: string): boolean {
  const rawList = process.env.ALLOWED_PHONES ?? '';
  if (!rawList.trim()) return true;
  const allowed = rawList.split(',').map((p) => p.trim()).filter(Boolean);
  return allowed.includes(phone);
}

const URGENCY_KEYWORDS = [
  'urgência', 'urgencia', 'emergência', 'emergencia',
  'fratura', 'sangramento', 'sangue', 'desmaiei', 'desmaiou',
  'inconsciente', 'paralisia', 'não consigo mover', 'nao consigo mover',
];

function detectUrgency(message: string): boolean {
  const lower = message.toLowerCase();
  return URGENCY_KEYWORDS.some((kw) => lower.includes(kw));
}

function buildUrgencyReply(instance?: string): string {
  const phone = getInstancePhone(instance);
  return (
    '⚠️ *ATENÇÃO — CASO URGENTE* ⚠️\n\n' +
    'Pelos sintomas descritos, você pode precisar de atendimento imediato.\n\n' +
    'Por favor, *vá ao pronto-socorro mais próximo agora* ou ligue para o *SAMU (192)*.\n\n' +
    'Não espere — em casos de fratura, luxação ou sangramento, o tempo de atendimento é crucial.\n\n' +
    `Se quiser agendar consulta de acompanhamento depois, ligue: *${phone}*`
  );
}

function validateSecret(req: Request): boolean {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) return true;
  const headerSecret = req.headers['x-webhook-secret'];
  return headerSecret === secret;
}

router.post('/', async (req: Request, res: Response): Promise<void> => {
  if (!validateSecret(req)) {
    logger.warn('[webhook] Tentativa sem x-webhook-secret válido');
    res.status(401).json({ error: 'Não autorizado' });
    return;
  }

  const parsed = WebhookSchema.safeParse(req.body);
  if (!parsed.success) {
    logger.warn(`[webhook] Payload inválido: ${JSON.stringify(parsed.error.flatten())}`);
    res.status(400).json({ error: 'Payload inválido', details: parsed.error.flatten() });
    return;
  }

  const { phone, name, message, instance } = parsed.data;

  if (!isAllowedPhone(phone)) {
    logger.warn(`[webhook] Número não permitido: ${phone}`);
    res.status(403).json({ error: 'Número não autorizado' });
    return;
  }

  if (isRateLimited(phone)) {
    logger.warn(`[webhook] Rate limit atingido para: ${phone}`);
    res.status(429).json({ error: 'Muitas mensagens. Aguarde um momento.' });
    return;
  }

  logger.info(`[webhook] Mensagem de ${phone} (${name}) [${instance ?? 'geral'}]: "${message.slice(0, 60)}..."`);

  if (detectUrgency(message)) {
    logger.warn(`[webhook] Urgência detectada para ${phone}`);
    const urgencyReply = buildUrgencyReply(instance);
    logConversation({ phone, patient_name: name, user_message: message,
      assistant_reply: urgencyReply, tokens_input: 0, tokens_output: 0 });
    const response: WebhookResponse = { reply: urgencyReply };
    res.json(response);
    return;
  }

  const history = await getHistory(phone);
  const { reply, tokens_input, tokens_output } = await askClaude(history, message, instance);
  await appendToHistory(phone, message, reply);
  logConversation({ phone, patient_name: name, user_message: message,
    assistant_reply: reply, tokens_input, tokens_output });
  logger.info(`[webhook] Resposta para ${phone} — tokens: ${tokens_input}in / ${tokens_output}out`);
  const response: WebhookResponse = { reply };
  res.json(response);
});

router.post('/clear/:phone', async (req: Request, res: Response): Promise<void> => {
  if (!validateSecret(req)) {
    res.status(401).json({ error: 'Não autorizado' });
    return;
  }
  const { phone } = req.params;
  await clearHistory(phone);
  logger.info(`[webhook] Histórico limpo para ${phone}`);
  res.json({ success: true, message: `Histórico de ${phone} removido.` });
});

export default router;
WEBHOOK_TS

# ── src/index.ts ──────────────────────────────────────────────────────────────
info "Criando src/index.ts..."
cat > src/index.ts << 'INDEX_TS'
import 'dotenv/config';
import express from 'express';
import { initMemory } from './services/memory.js';
import { logger } from './services/logger.js';
import webhookRouter from './routes/webhook.js';
import healthRouter from './routes/health.js';

import './db/sqlite.js';

const app = express();
const PORT = parseInt(process.env.PORT ?? '3000', 10);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use((req, _res, next) => {
  logger.info(`[http] ${req.method} ${req.path}`);
  next();
});

app.use('/health', healthRouter);
app.use('/webhook', webhookRouter);

app.get('/', (_req, res) => {
  res.json({
    service: 'whatsapp-ai',
    clinic: 'Clínica CTO – Centro de Trauma e Ortopedia',
    status: 'running',
  });
});

app.use((_req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error(`[http] Erro não tratado: ${err.message}`, err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

async function bootstrap(): Promise<void> {
  await initMemory();
  app.listen(PORT, () => {
    logger.info(`[server] WhatsApp AI rodando na porta ${PORT}`);
    logger.info(`[server] Health: http://localhost:${PORT}/health`);
    logger.info(`[server] Webhook: POST http://localhost:${PORT}/webhook`);
  });
}

bootstrap().catch((err: unknown) => {
  logger.error(`[server] Falha ao iniciar: ${String(err)}`);
  process.exit(1);
});
INDEX_TS

log "Todos os arquivos TypeScript criados."

# =============================================================================
section "4 / 7 · Criando arquivos de configuração"
# =============================================================================

# ── .env ──────────────────────────────────────────────────────────────────────
info "Criando .env..."
cat > .env << DOTENV
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
PORT=3000
REDIS_URL=redis://redis:6379
CLAUDE_MODEL=claude-sonnet-4-6
MAX_HISTORY_TURNS=20
LOG_LEVEL=info
WEBHOOK_SECRET=${WEBHOOK_SECRET}
ALLOWED_PHONES=
DOTENV

# ── evolution.env ─────────────────────────────────────────────────────────────
info "Criando evolution.env..."
cat > evolution.env << EVENV
SERVER_URL=http://${PUBLIC_IP}:8080
AUTHENTICATION_API_KEY=${EVOLUTION_API_KEY}
AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES=true

DATABASE_ENABLED=true
DATABASE_PROVIDER=postgresql
DATABASE_CONNECTION_URI=postgresql://evolution:${POSTGRES_PASSWORD}@postgres:5432/evolution
DATABASE_CONNECTION_CLIENT_NAME=evolution_cto

DATABASE_SAVE_DATA_INSTANCE=true
DATABASE_SAVE_DATA_NEW_MESSAGE=true
DATABASE_SAVE_MESSAGE_UPDATE=true
DATABASE_SAVE_DATA_CONTACTS=true
DATABASE_SAVE_DATA_CHATS=true
DATABASE_SAVE_DATA_LABELS=false
DATABASE_SAVE_DATA_HISTORIC=true

CACHE_REDIS_ENABLED=true
CACHE_REDIS_URI=redis://redis:6379
CACHE_REDIS_PREFIX_KEY=evolution
CACHE_REDIS_SAVE_INSTANCES=false
CACHE_LOCAL_ENABLED=false

LOG_LEVEL=ERROR
LOG_COLOR=true
LOG_BAILEYS=error

DEL_INSTANCE=false
DEL_TEMP_INSTANCES=true

QRCODE_LIMIT=30
QRCODE_COLOR=#198754

WEBHOOK_GLOBAL_ENABLED=true
WEBHOOK_GLOBAL_URL=http://n8n:5678/webhook/whatsapp-cto
WEBHOOK_GLOBAL_WEBHOOK_BY_EVENTS=false

WEBHOOK_EVENTS_APPLICATION_STARTUP=false
WEBHOOK_EVENTS_QRCODE_UPDATED=true
WEBHOOK_EVENTS_MESSAGES_SET=false
WEBHOOK_EVENTS_MESSAGES_UPSERT=true
WEBHOOK_EVENTS_MESSAGES_EDITED=false
WEBHOOK_EVENTS_MESSAGES_UPDATE=false
WEBHOOK_EVENTS_MESSAGES_DELETE=false
WEBHOOK_EVENTS_SEND_MESSAGE=false
WEBHOOK_EVENTS_CONTACTS_SET=false
WEBHOOK_EVENTS_CONTACTS_UPSERT=false
WEBHOOK_EVENTS_CONTACTS_UPDATE=false
WEBHOOK_EVENTS_PRESENCE_UPDATE=false
WEBHOOK_EVENTS_CHATS_SET=false
WEBHOOK_EVENTS_CHATS_UPSERT=false
WEBHOOK_EVENTS_CHATS_UPDATE=false
WEBHOOK_EVENTS_CHATS_DELETE=false
WEBHOOK_EVENTS_GROUPS_UPSERT=false
WEBHOOK_EVENTS_GROUPS_UPDATE=false
WEBHOOK_EVENTS_GROUP_PARTICIPANTS_UPDATE=false
WEBHOOK_EVENTS_CONNECTION_UPDATE=true
WEBHOOK_EVENTS_LABELS_EDIT=false
WEBHOOK_EVENTS_LABELS_ASSOCIATION=false
WEBHOOK_EVENTS_CALL=false
WEBHOOK_EVENTS_ERRORS=false
EVENV

# ── docker-compose.yml ────────────────────────────────────────────────────────
info "Criando docker-compose.yml..."
cat > docker-compose.yml << COMPOSE
services:

  redis:
    image: redis:7-alpine
    container_name: cto-redis
    restart: unless-stopped
    volumes:
      - redis_data:/data
    networks:
      - cto-net
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 3

  whatsapp-ai:
    build: .
    container_name: cto-whatsapp-ai
    restart: unless-stopped
    ports:
      - "3030:3000"
    env_file:
      - .env
    environment:
      REDIS_URL: redis://redis:6379
    volumes:
      - whatsapp_data:/app/data
      - whatsapp_logs:/app/logs
    depends_on:
      redis:
        condition: service_healthy
    networks:
      - cto-net

  postgres:
    image: postgres:15-alpine
    container_name: cto-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: evolution
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: evolution
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - cto-net
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U evolution"]
      interval: 10s
      timeout: 5s
      retries: 5

  evolution-api:
    image: atendai/evolution-api:latest
    container_name: cto-evolution
    restart: unless-stopped
    ports:
      - "8080:8080"
    env_file:
      - evolution.env
    volumes:
      - evolution_data:/evolution/instances
    depends_on:
      redis:
        condition: service_healthy
      postgres:
        condition: service_healthy
    networks:
      - cto-net

  n8n:
    image: n8nio/n8n:latest
    container_name: cto-n8n
    restart: unless-stopped
    ports:
      - "5678:5678"
    environment:
      - N8N_HOST=0.0.0.0
      - N8N_PORT=5678
      - N8N_PROTOCOL=http
      - WEBHOOK_URL=http://${PUBLIC_IP}:5678/
      - GENERIC_TIMEZONE=America/Recife
      - TZ=America/Recife
      - N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS=true
      - WEBHOOK_SECRET=${WEBHOOK_SECRET}
      - EVOLUTION_API_KEY=${EVOLUTION_API_KEY}
    volumes:
      - n8n_data:/home/node/.n8n
    networks:
      - cto-net

volumes:
  redis_data:
  evolution_data:
  n8n_data:
  postgres_data:
  whatsapp_data:
  whatsapp_logs:

networks:
  cto-net:
    driver: bridge
COMPOSE

# ── n8n-workflow.json ─────────────────────────────────────────────────────────
info "Criando n8n-workflow.json..."
cat > n8n-workflow.json << 'N8NWFLOW'
{
  "name": "WhatsApp AI — Clínica CTO",
  "nodes": [
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "whatsapp-cto",
        "responseMode": "lastNode",
        "options": {}
      },
      "id": "a1b2c3d4-0001-0001-0001-000000000001",
      "name": "Receber do Evolution API",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 2,
      "position": [240, 300],
      "webhookId": "whatsapp-cto"
    },
    {
      "parameters": {
        "conditions": {
          "options": {
            "caseSensitive": false,
            "leftValue": "",
            "typeValidation": "loose"
          },
          "conditions": [
            {
              "id": "cond-event",
              "leftValue": "={{ $json.event }}",
              "rightValue": "messages.upsert",
              "operator": { "type": "string", "operation": "equals" }
            },
            {
              "id": "cond-fromme",
              "leftValue": "={{ $json.data.key.fromMe }}",
              "rightValue": "true",
              "operator": { "type": "string", "operation": "notEquals" }
            },
            {
              "id": "cond-msg",
              "leftValue": "={{ $json.data.message.conversation || $json.data.message.extendedTextMessage.text }}",
              "rightValue": "",
              "operator": { "type": "string", "operation": "notEquals" }
            }
          ],
          "combinator": "and"
        }
      },
      "id": "a1b2c3d4-0002-0002-0002-000000000002",
      "name": "Filtrar mensagem válida",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2,
      "position": [460, 300]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "http://whatsapp-ai:3000/webhook",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            { "name": "x-webhook-secret", "value": "={{ $env.WEBHOOK_SECRET }}" },
            { "name": "Content-Type", "value": "application/json" }
          ]
        },
        "sendBody": true,
        "bodyParameters": {
          "parameters": [
            { "name": "phone", "value": "={{ $json.data.key.remoteJid.replace('@s.whatsapp.net', '').replace('@g.us', '') }}" },
            { "name": "name",  "value": "={{ $json.data.pushName || 'Paciente' }}" },
            { "name": "message", "value": "={{ $json.data.message.conversation || $json.data.message.extendedTextMessage.text }}" },
            { "name": "instance", "value": "={{ $json.instance }}" }
          ]
        },
        "options": { "timeout": 30000 }
      },
      "id": "a1b2c3d4-0003-0003-0003-000000000003",
      "name": "Chamar WhatsApp AI",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [680, 220]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "=http://evolution-api:8080/message/sendText/{{ $('Receber do Evolution API').item.json.instance }}",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            { "name": "apikey", "value": "={{ $env.EVOLUTION_API_KEY }}" },
            { "name": "Content-Type", "value": "application/json" }
          ]
        },
        "sendBody": true,
        "bodyParameters": {
          "parameters": [
            { "name": "number", "value": "={{ $('Receber do Evolution API').item.json.data.key.remoteJid.replace('@s.whatsapp.net', '') }}" },
            { "name": "text",   "value": "={{ $json.reply }}" }
          ]
        },
        "options": { "timeout": 15000 }
      },
      "id": "a1b2c3d4-0004-0004-0004-000000000004",
      "name": "Enviar resposta via Evolution API",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [900, 220]
    },
    {
      "parameters": {
        "respondWith": "json",
        "responseBody": "={ \"status\": \"ignored\" }",
        "options": {}
      },
      "id": "a1b2c3d4-0005-0005-0005-000000000005",
      "name": "Ignorar (não é mensagem)",
      "type": "n8n-nodes-base.respondToWebhook",
      "typeVersion": 1,
      "position": [680, 420]
    }
  ],
  "connections": {
    "Receber do Evolution API": {
      "main": [[{ "node": "Filtrar mensagem válida", "type": "main", "index": 0 }]]
    },
    "Filtrar mensagem válida": {
      "main": [
        [{ "node": "Chamar WhatsApp AI", "type": "main", "index": 0 }],
        [{ "node": "Ignorar (não é mensagem)", "type": "main", "index": 0 }]
      ]
    },
    "Chamar WhatsApp AI": {
      "main": [[{ "node": "Enviar resposta via Evolution API", "type": "main", "index": 0 }]]
    }
  },
  "active": false,
  "settings": { "executionOrder": "v1" },
  "tags": ["whatsapp", "clinica-cto", "ia"]
}
N8NWFLOW

log "Arquivos de configuração criados."

# =============================================================================
section "5 / 7 · Build e inicialização dos containers"
# =============================================================================

info "Fazendo pull das imagens base..."
docker pull redis:7-alpine -q
docker pull postgres:15-alpine -q
docker pull atendai/evolution-api:latest -q
docker pull n8nio/n8n:latest -q

info "Fazendo build da imagem whatsapp-ai..."
docker compose build --no-cache whatsapp-ai
log "Imagem whatsapp-ai criada."

info "Subindo todos os containers..."
docker compose up -d
log "Containers iniciados."

# Aguardar health checks
info "Aguardando containers ficarem saudáveis (até 120s)..."
WAIT=0
while [[ $WAIT -lt 120 ]]; do
  HEALTHY=$(docker compose ps --format json 2>/dev/null \
    | jq -r 'select(.Health == "healthy") | .Name' 2>/dev/null | wc -l || echo "0")
  if [[ "$HEALTHY" -ge 3 ]]; then
    log "Redis, PostgreSQL e whatsapp-ai estão saudáveis."
    break
  fi
  sleep 5
  WAIT=$((WAIT + 5))
done

docker compose ps

# =============================================================================
section "6 / 7 · Configurando n8n e Evolution API"
# =============================================================================

# Aguardar n8n inicializar
info "Aguardando n8n inicializar (pode levar 30s)..."
N8N_READY=0
for i in $(seq 1 24); do
  if curl -sf "http://localhost:5678/healthz" &>/dev/null; then
    N8N_READY=1
    break
  fi
  sleep 5
done

if [[ $N8N_READY -eq 1 ]]; then
  log "n8n disponível."

  # Criar conta admin n8n
  info "Criando conta admin n8n..."
  SETUP_RESP=$(curl -sf -X POST "http://localhost:5678/rest/owner-setup" \
    -H "Content-Type: application/json" \
    -d "{
      \"email\": \"${N8N_USER}\",
      \"password\": \"${N8N_PASSWORD}\",
      \"firstName\": \"Admin\",
      \"lastName\": \"CTO\"
    }" 2>/dev/null || echo "")

  if echo "$SETUP_RESP" | grep -q '"id"'; then
    log "Conta n8n criada: $N8N_USER"
  else
    warn "Setup n8n: resposta inesperada (pode já estar configurado)"
  fi

  # Login para pegar token
  info "Fazendo login no n8n..."
  LOGIN_RESP=$(curl -sf -X POST "http://localhost:5678/rest/login" \
    -H "Content-Type: application/json" \
    -c /tmp/n8n-cookies.txt \
    -d "{\"email\": \"${N8N_USER}\", \"password\": \"${N8N_PASSWORD}\"}" 2>/dev/null || echo "")

  N8N_TOKEN=$(echo "$LOGIN_RESP" | jq -r '.data.token // empty' 2>/dev/null || echo "")

  if [[ -n "$N8N_TOKEN" ]]; then
    log "Login n8n realizado."

    # Importar workflow
    info "Importando workflow WhatsApp AI..."
    IMPORT_RESP=$(curl -sf -X POST "http://localhost:5678/rest/workflows" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $N8N_TOKEN" \
      -d @n8n-workflow.json 2>/dev/null || echo "")

    if echo "$IMPORT_RESP" | grep -q '"id"'; then
      WORKFLOW_ID=$(echo "$IMPORT_RESP" | jq -r '.data.id // .id' 2>/dev/null || echo "?")
      log "Workflow importado — ID: $WORKFLOW_ID"
    else
      warn "Importação do workflow: verifique manualmente em http://${PUBLIC_IP}:5678"
    fi
  else
    warn "Login n8n falhou — importe o workflow manualmente via interface web."
  fi
else
  warn "n8n não respondeu a tempo. Configure manualmente: http://${PUBLIC_IP}:5678"
fi

# ── Evolution API — criar instâncias ─────────────────────────────────────────
info "Aguardando Evolution API (até 60s)..."
EVO_READY=0
for i in $(seq 1 12); do
  HTTP=$(curl -sf -o /dev/null -w "%{http_code}" \
    "http://localhost:8080/" \
    -H "apikey: ${EVOLUTION_API_KEY}" 2>/dev/null || echo "000")
  if [[ "$HTTP" == "200" || "$HTTP" == "404" ]]; then
    EVO_READY=1
    break
  fi
  sleep 5
done

if [[ $EVO_READY -eq 1 ]]; then
  log "Evolution API disponível."

  create_instance() {
    local NAME="$1"
    info "Criando instância Evolution API: $NAME..."
    RESP=$(curl -sf -X POST "http://localhost:8080/instance/create" \
      -H "Content-Type: application/json" \
      -H "apikey: ${EVOLUTION_API_KEY}" \
      -d "{
        \"instanceName\": \"${NAME}\",
        \"qrcode\": true,
        \"integration\": \"WHATSAPP-BAILEYS\"
      }" 2>/dev/null || echo "")

    if echo "$RESP" | grep -q '"instance"'; then
      log "Instância '$NAME' criada."
    else
      warn "Instância '$NAME': $RESP"
    fi
  }

  create_instance "cto-caruaru"
  create_instance "cto-campina"
  create_instance "cto-geral"
else
  warn "Evolution API não respondeu. Crie as instâncias manualmente: http://${PUBLIC_IP}:8080/manager"
fi

# =============================================================================
section "7 / 7 · QR Codes para conectar WhatsApp"
# =============================================================================

echo ""
echo -e "${BOLD}Aguardando QR codes das instâncias (30s)...${NC}"
sleep 30

show_qr() {
  local INSTANCE="$1"
  echo ""
  echo -e "${BOLD}${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BOLD}${YELLOW}  QR Code: $INSTANCE${NC}"
  echo -e "${BOLD}${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

  QR_RESP=$(curl -sf \
    "http://localhost:8080/instance/connect/$INSTANCE" \
    -H "apikey: ${EVOLUTION_API_KEY}" 2>/dev/null || echo "")

  QR_B64=$(echo "$QR_RESP" | jq -r '.base64 // empty' 2>/dev/null | sed 's/data:image\/png;base64,//' || echo "")
  QR_CODE=$(echo "$QR_RESP" | jq -r '.code // empty' 2>/dev/null || echo "")

  if [[ -n "$QR_CODE" ]]; then
    # Exibir QR no terminal usando qrencode (se disponível)
    if command -v qrencode &>/dev/null; then
      echo "$QR_CODE" | qrencode -t ANSIUTF8 -l L
    fi
    echo ""
    echo -e "  ${CYAN}Código:${NC} $QR_CODE"
  else
    echo -e "  ${YELLOW}QR ainda não gerado. Acesse:${NC}"
    echo -e "  ${BOLD}http://${PUBLIC_IP}:8080/manager${NC}"
    echo -e "  API Key: ${EVOLUTION_API_KEY}"
  fi
}

show_qr "cto-caruaru"
echo -e "  ${GREEN}→ Escanear com celular da SECRETÁRIA CARUARU (+55 81 99929-4960)${NC}"

show_qr "cto-campina"
echo -e "  ${GREEN}→ Escanear com celular da SECRETÁRIA CAMPINA GRANDE (+55 83 99351-4284)${NC}"

show_qr "cto-geral"
echo -e "  ${GREEN}→ Escanear com celular do DR. VALTH (+55 81 99917-9609)${NC}"

# =============================================================================
section "✅ Instalação concluída!"
# =============================================================================

# Salvar credenciais
cat > /root/cto-credenciais.txt << CREDS
=== CREDENCIAIS WhatsApp AI · Clínica CTO ===
Gerado em: $(date)

IP público do servidor: ${PUBLIC_IP}

── WhatsApp AI Backend ─────────────────────────
URL:            http://${PUBLIC_IP}:3030
Webhook:        POST http://${PUBLIC_IP}:3030/webhook
WEBHOOK_SECRET: ${WEBHOOK_SECRET}

── Evolution API ────────────────────────────────
URL:            http://${PUBLIC_IP}:8080
Manager:        http://${PUBLIC_IP}:8080/manager
API Key:        ${EVOLUTION_API_KEY}

Instâncias:
  cto-caruaru → Secretária Caruaru  (+55 81 99929-4960)
  cto-campina → Secretária Campina  (+55 83 99351-4284)
  cto-geral   → Dr. Valth           (+55 81 99917-9609)

── n8n ──────────────────────────────────────────
URL:      http://${PUBLIC_IP}:5678
Login:    ${N8N_USER}
Senha:    ${N8N_PASSWORD}

── Anthropic ────────────────────────────────────
API Key:  ${ANTHROPIC_API_KEY}
Model:    claude-sonnet-4-6

── Diretório ────────────────────────────────────
Projeto:  ${INSTALL_DIR}
CREDS

chmod 600 /root/cto-credenciais.txt

echo ""
echo -e "${BOLD}${GREEN}Todos os serviços estão rodando!${NC}"
echo ""
echo -e "  ${BOLD}Evolution API Manager:${NC}  http://${PUBLIC_IP}:8080/manager"
echo -e "  ${BOLD}n8n:${NC}                    http://${PUBLIC_IP}:5678"
echo -e "  ${BOLD}WhatsApp AI health:${NC}     http://${PUBLIC_IP}:3030/health"
echo ""
echo -e "${BOLD}Credenciais salvas em:${NC} /root/cto-credenciais.txt"
echo ""
echo -e "${BOLD}${YELLOW}PRÓXIMOS PASSOS:${NC}"
echo "  1. Escaneie os QR codes acima com cada celular (validade: ~60s)"
echo "     Se expiraram, acesse http://${PUBLIC_IP}:8080/manager e clique em 'Conectar'"
echo "  2. Após as 3 instâncias mostrarem 'open' (conectadas),"
echo "     ative o workflow no n8n: http://${PUBLIC_IP}:5678"
echo "     Menu → Workflows → WhatsApp AI — Clínica CTO → toggle ON"
echo "  3. Teste enviando uma mensagem para um dos 3 números"
echo ""

# Configurar auto-start (systemd)
info "Configurando auto-start via systemd..."
cat > /etc/systemd/system/whatsapp-ai.service << SYSTEMD
[Unit]
Description=WhatsApp AI — Clínica CTO
Requires=docker.service
After=docker.service network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=${INSTALL_DIR}
ExecStart=/usr/bin/docker compose up -d --remove-orphans
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=300

[Install]
WantedBy=multi-user.target
SYSTEMD

systemctl daemon-reload
systemctl enable whatsapp-ai.service
log "Auto-start configurado (reinicializa automaticamente com o servidor)."

echo ""
echo -e "${BOLD}${GREEN}══════════════════════════════════════════${NC}"
echo -e "${BOLD}${GREEN}  Setup completo! Bom atendimento, Dr. Valth! 🏥${NC}"
echo -e "${BOLD}${GREEN}══════════════════════════════════════════${NC}"
echo ""
