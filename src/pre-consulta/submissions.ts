/**
 * Registro local de formulários de pré-consulta preenchidos.
 *
 * Existe para GARANTIR que o médico seja avisado dos formulários preenchidos
 * mesmo que a integração com n8n/Sheets/Drive falhe — o registro é local
 * (SQLite) e independente do POST best-effort para o n8n em routes.ts.
 */

import { DatabaseSync } from 'node:sqlite';
import { db as sharedDb } from '../db/sqlite.js';
import { wallClock, CLINIC_TZ } from '../services/clock.js';

export interface SubmissionRow {
  id: number;
  agendamento_id: string | null;
  phone: string;
  name: string;
  pdf_url: string;
  date: string; // 'YYYY-MM-DD' no fuso da clínica (evita ambiguidade do UTC do SQLite)
  created_at: string;
}

export function initSubmissionsSchema(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS pre_consulta_submissions (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      agendamento_id TEXT,
      phone          TEXT NOT NULL,
      name           TEXT NOT NULL,
      pdf_url        TEXT NOT NULL,
      date           TEXT NOT NULL,
      created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_submissions_date
      ON pre_consulta_submissions (date);
  `);
}

export interface SubmissionsStore {
  record(data: { agendamento_id: string | null; phone: string; name: string; pdf_url: string }, now?: Date): SubmissionRow;
  /** Submissões cujo `date` (fuso da clínica) seja `dateISO`. */
  listForDay(dateISO: string): SubmissionRow[];
}

export function createSubmissionsStore(database: DatabaseSync): SubmissionsStore {
  initSubmissionsSchema(database);

  const insertStmt = database.prepare(`
    INSERT INTO pre_consulta_submissions (agendamento_id, phone, name, pdf_url, date)
    VALUES (@agendamento_id, @phone, @name, @pdf_url, @date)
  `);
  const getByIdStmt = database.prepare(`SELECT * FROM pre_consulta_submissions WHERE id = ?`);
  const listForDayStmt = database.prepare(`
    SELECT * FROM pre_consulta_submissions WHERE date = ? ORDER BY created_at ASC
  `);

  return {
    record(data, now = new Date()) {
      const info = insertStmt.run({
        '@agendamento_id': data.agendamento_id,
        '@phone': data.phone,
        '@name': data.name,
        '@pdf_url': data.pdf_url,
        '@date': wallClock(now, CLINIC_TZ).iso,
      } as Record<string, string | null>);
      return getByIdStmt.get(Number(info.lastInsertRowid)) as unknown as SubmissionRow;
    },

    listForDay(dateISO) {
      return listForDayStmt.all(dateISO) as unknown as SubmissionRow[];
    },
  };
}

export const submissionsStore = createSubmissionsStore(sharedDb);
