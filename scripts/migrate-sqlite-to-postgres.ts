import 'dotenv/config';
import { DatabaseSync } from 'node:sqlite';
import { Pool } from 'pg';
import path from 'path';
import fs from 'fs';

/**
 * Script de migração SQLite → PostgreSQL
 *
 * Uso:
 *   DATABASE_URL=postgresql://user:pass@host/db npx tsx scripts/migrate-sqlite-to-postgres.ts
 */

const dbPath = path.join(process.cwd(), 'data', 'conversations.db');

async function migrate(): Promise<void> {
  // Validar ambiente
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL não configurado');
    process.exit(1);
  }

  if (!fs.existsSync(dbPath)) {
    console.error(`❌ Arquivo SQLite não encontrado: ${dbPath}`);
    process.exit(1);
  }

  console.log('🚀 Iniciando migração SQLite → PostgreSQL...\n');

  try {
    // 1. Abrir SQLite
    console.log('📂 Lendo dados do SQLite...');
    const sourceDb = new DatabaseSync(dbPath);
    const rows = sourceDb.prepare('SELECT * FROM conversations').all() as Array<{
      id: number;
      phone: string;
      patient_name: string | null;
      user_message: string;
      assistant_reply: string;
      tokens_input: number | null;
      tokens_output: number | null;
      created_at: string;
    }>;

    console.log(`   ✅ ${rows.length} registros encontrados`);

    // 2. Conectar PostgreSQL
    console.log('\n🔗 Conectando ao PostgreSQL...');
    const pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 20,
    });

    try {
      const testClient = await pgPool.connect();
      testClient.release();
      console.log('   ✅ Conexão OK');
    } catch (err) {
      console.error(`   ❌ Falha na conexão: ${String(err)}`);
      process.exit(1);
    }

    // 3. Criar schema
    console.log('\n📋 Criando schema no PostgreSQL...');
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
    console.log('   ✅ Schema criado');

    // 4. Inserir dados em chunks
    console.log('\n📤 Inserindo dados...');
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

      const flatParams: Array<unknown> = [];
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
        `INSERT INTO conversations (phone, patient_name, user_message, assistant_reply, tokens_input, tokens_output, created_at)
         VALUES ${values}`,
        flatParams
      );

      inserted += chunk.length;
      process.stdout.write(`\r   Progresso: ${inserted}/${rows.length} (${Math.round((inserted / rows.length) * 100)}%)`);
    }

    console.log('\n   ✅ Todos os dados inseridos');

    // 5. Validar
    console.log('\n✔️  Validando dados...');
    const pgCount = await pgPool.query('SELECT COUNT(*) as count FROM conversations');
    const dbCount = sourceDb.prepare('SELECT COUNT(*) as count FROM conversations').get() as { count: number };

    const pgTotal = pgCount.rows[0].count;
    const sqliteTotal = dbCount.count;

    console.log(`   SQLite:     ${sqliteTotal} registros`);
    console.log(`   PostgreSQL: ${pgTotal} registros`);

    if (pgTotal === sqliteTotal) {
      console.log('   ✅ Contagem OK - Sem divergências!');
    } else {
      console.error(`   ⚠️  ATENÇÃO: Divergência detectada! (${Math.abs(pgTotal - sqliteTotal)} registros)`);
    }

    // 6. Amostra de dados
    console.log('\n📊 Amostra de dados (primeiros 3)...');
    const sample = await pgPool.query('SELECT id, phone, user_message, assistant_reply, created_at FROM conversations LIMIT 3');
    for (const row of sample.rows) {
      console.log(`   ID: ${row.id} | Phone: ${row.phone} | Date: ${row.created_at}`);
    }

    await pgPool.end();

    console.log('\n✨ Migração concluída com sucesso!');
    console.log('\nPróximos passos:');
    console.log('  1. Testar dual-write com mensagens novas');
    console.log('  2. Monitorar logs por 24-48 horas');
    console.log('  3. Validar que ambos bancos estão em sync');
    console.log('  4. Deploy em Render quando tiver confiança');

    process.exit(0);
  } catch (err) {
    console.error(`\n❌ Erro durante migração: ${String(err)}`);
    process.exit(1);
  }
}

migrate();
