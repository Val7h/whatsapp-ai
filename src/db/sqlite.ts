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
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_conversations_phone
    ON conversations (phone);

  CREATE INDEX IF NOT EXISTS idx_conversations_created_at
    ON conversations (created_at);
`);

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
    (phone, patient_name, user_message, assistant_reply, tokens_input, tokens_output)
  VALUES
    (@phone, @patient_name, @user_message, @assistant_reply, @tokens_input, @tokens_output)
`);

/**
 * Insere um registro de conversa no banco (SQLite + PostgreSQL dual-write).
 * SQLite sempre sucede. PostgreSQL é best-effort (async, non-blocking).
 */
export function logConversation(data: ConversationLog): void {
  try {
    // 1. SQLite (crítico - sempre salvamos localmente)
    insertStmt.run({
      '@phone': data.phone,
      '@patient_name': data.patient_name,
      '@user_message': data.user_message,
      '@assistant_reply': data.assistant_reply,
      '@tokens_input': data.tokens_input,
      '@tokens_output': data.tokens_output,
    } as Record<string, string | number | null>);

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
