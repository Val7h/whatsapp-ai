import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import { Pool } from 'pg';
import { ConversationLog } from '../types.js';
import { logger } from '../services/logger.js';

// ── SQLite (local) ────────────────────────────────────────────────────────
const dbDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'conversations.db');
const db = new DatabaseSync(dbPath);

// ── Schema SQLite ─────────────────────────────────────────────────────────
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
    is_test          INTEGER DEFAULT 0,
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_conversations_phone
    ON conversations (phone);

  CREATE INDEX IF NOT EXISTS idx_conversations_created_at
    ON conversations (created_at);
`);

// Adicionar coluna is_test se ainda não existe (migration)
try {
  db.exec(`ALTER TABLE conversations ADD COLUMN is_test INTEGER DEFAULT 0`);
} catch {
  // Coluna já existe
}

logger.info(`[sqlite] Banco de dados inicializado em: ${dbPath}`);

// ── PostgreSQL (Render) ───────────────────────────────────────────────────
let pgPool: Pool | null = null;
let pgReady = false;

export async function initPostgreSQL(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    logger.info('[postgres] DATABASE_URL não configurado. PostgreSQL desativado.');
    return;
  }

  try {
    pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30000,
    });

    // Teste de conexão
    const client = await pgPool.connect();
    client.release();
    pgReady = true;

    // Criar schema no PostgreSQL
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id SERIAL PRIMARY KEY,
        phone TEXT NOT NULL,
        patient_name TEXT,
        user_message TEXT NOT NULL,
        assistant_reply TEXT NOT NULL,
        tokens_input INTEGER,
        tokens_output INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_conversations_phone
        ON conversations (phone);
      CREATE INDEX IF NOT EXISTS idx_conversations_created_at
        ON conversations (created_at);
    `);

    logger.info('[postgres] Conectado e schema criado com sucesso');
  } catch (err) {
    logger.warn(`[postgres] Falha ao conectar: ${String(err)}`);
    pgPool = null;
    pgReady = false;
  }
}

// ── Statement preparado (SQLite) ──────────────────────────────────────────
const insertStmt = db.prepare(`
  INSERT INTO conversations
    (phone, patient_name, user_message, assistant_reply, tokens_input, tokens_output, is_test)
  VALUES
    (@phone, @patient_name, @user_message, @assistant_reply, @tokens_input, @tokens_output, @is_test)
`);

/**
 * Detecta se uma mensagem é teste (não deve contar em relatórios)
 *
 * Critérios CONSERVADORES:
 * - Telefone com dígitos repetidos (55811111111, 55833333333)
 * - Faixa 558X900000XXX (range de testes manuais)
 * - Header X-Test-Mode no webhook
 * - Mensagem contém marker [TEST]
 */
export function isTestMessage(phone: string, name: string, message: string): boolean {
  const phoneDigits = (phone || '').replace(/\D/g, '');
  const nameTrim = (name || '').trim();
  const msgLower = (message || '').toLowerCase();

  // Marker explícito na mensagem
  if (msgLower.includes('[test]') || msgLower.includes('[teste]')) return true;

  // Telefones com 7+ dígitos iguais em sequência
  if (/^55(\d)\1{8,}$/.test(phoneDigits)) return true;
  if (/^55\d(\d)\1{7,}$/.test(phoneDigits)) return true;

  // Faixa 558X900000XXX (range usado em testes manuais)
  if (/^558[1-9]900000\d{3}$/.test(phoneDigits)) return true;

  // Nomes explicitamente de teste
  if (/^(teste|test)(\s|$)/i.test(nameTrim)) return true;
  if (/^(t8[1-9]|ddd8[1-9]|premium8[1-9]|hi|preco|urg|memory|hora|comercial|faq|novo|admin|caruaru2|alagoas)$/i.test(nameTrim)) return true;

  return false;
}

/**
 * Insere um registro de conversa no banco (SQLite + PostgreSQL dual-write).
 * SQLite sempre sucede. PostgreSQL é best-effort (async, non-blocking).
 * Mensagens detectadas como teste recebem is_test=1 e são ignoradas nos relatórios.
 */
export function logConversation(data: ConversationLog): void {
  try {
    const isTest = isTestMessage(data.phone, data.patient_name || '', data.user_message);

    // 1. SQLite (crítico - sempre salvamos localmente)
    insertStmt.run({
      '@phone': data.phone,
      '@patient_name': data.patient_name,
      '@user_message': data.user_message,
      '@assistant_reply': data.assistant_reply,
      '@tokens_input': data.tokens_input,
      '@tokens_output': data.tokens_output,
      '@is_test': isTest ? 1 : 0,
    } as Record<string, string | number | null>);

    if (isTest) {
      logger.info(`[sqlite] Mensagem marcada como TESTE (não conta em relatórios): ${data.phone} - ${data.patient_name}`);
    }

    // 2. PostgreSQL (async, non-blocking - não bloqueia resposta)
    if (pgReady && pgPool) {
      pgPool.query(
        `INSERT INTO conversations
         (phone, patient_name, user_message, assistant_reply, tokens_input, tokens_output)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          data.phone,
          data.patient_name,
          data.user_message,
          data.assistant_reply,
          data.tokens_input,
          data.tokens_output,
        ]
      ).catch((err: unknown) => {
        logger.warn(`[postgres] Erro ao inserir (ignorado): ${String(err)}`);
      });
    }
  } catch (err) {
    logger.error(`[sqlite] Erro ao salvar conversa: ${String(err)}`);
  }
}

export { db, pgPool, pgReady };
export default db;
