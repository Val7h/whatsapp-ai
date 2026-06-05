/**
 * Script para executar DENTRO do Railway container
 * Migra SQLite → PostgreSQL
 */

import { DatabaseSync } from 'node:sqlite';
import { Pool } from 'pg';
import path from 'path';

async function migrate() {
  console.log('🚀 Iniciando migração dentro do Railway...\n');

  try {
    // 1. Ler dados SQLite
    console.log('📂 Lendo dados do SQLite...');
    const dbPath = path.join('/app', 'data', 'conversations.db');
    const db = new DatabaseSync(dbPath);
    const rows = db.prepare('SELECT * FROM conversations').all() as any[];
    console.log(`✅ ${rows.length} registros encontrados\n`);

    // 2. Conectar PostgreSQL (usa DATABASE_URL do Railway)
    console.log('🔗 Conectando ao PostgreSQL...');
    const pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });

    const client = await pgPool.connect();
    client.release();
    console.log('✅ Conectado ao PostgreSQL\n');

    // 3. Criar schema
    console.log('📋 Criando schema...');
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

      CREATE INDEX IF NOT EXISTS idx_conversations_phone ON conversations (phone);
      CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations (created_at);
    `);
    console.log('✅ Schema criado\n');

    // 4. Migrar dados em chunks
    console.log('📤 Migrando dados...');
    const chunkSize = 100;
    let inserted = 0;

    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const values = chunk
        .map(
          (_, idx) =>
            `($${idx * 7 + 1}, $${idx * 7 + 2}, $${idx * 7 + 3}, $${idx * 7 + 4}, $${idx * 7 + 5}, $${idx * 7 + 6}, $${idx * 7 + 7})`
        )
        .join(',');

      const flatParams: any[] = [];
      for (const row of chunk) {
        flatParams.push(
          row.phone,
          row.patient_name,
          row.user_message,
          row.assistant_reply,
          row.tokens_input,
          row.tokens_output,
          row.created_at
        );
      }

      await pgPool.query(
        `INSERT INTO conversations (phone, patient_name, user_message, assistant_reply, tokens_input, tokens_output, created_at) VALUES ${values}`,
        flatParams
      );

      inserted += chunk.length;
      process.stdout.write(`\r✅ ${inserted}/${rows.length}`);
    }

    console.log('\n✅ Migração concluída!\n');

    // 5. Validar
    console.log('✔️ Validando...');
    const result = await pgPool.query('SELECT COUNT(*) as count FROM conversations');
    const count = result.rows[0].count;
    console.log(`✅ PostgreSQL tem ${count} registros`);
    console.log(`✅ SQLite tem ${rows.length} registros`);

    if (count === rows.length) {
      console.log('✅ PERFEITO! Nenhuma divergência!\n');
    }

    await pgPool.end();
    console.log('🎉 Migração concluída com sucesso!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Erro:', err);
    process.exit(1);
  }
}

migrate();
