/**
 * Armazenamento de agendamentos (SQLite).
 *
 * Cada linha representa UMA consulta marcada por um paciente. É a fonte de
 * verdade usada pelo motor de lembretes (reminders.ts) e pelo formulário de
 * pré-consulta (para saber se já foi preenchido).
 *
 * `createAppointmentStore(database)` aceita qualquer `DatabaseSync` — em
 * produção usa o banco compartilhado (db/sqlite.ts); em teste, um banco
 * `:memory:` isolado, sem tocar no arquivo real.
 */

import { DatabaseSync } from 'node:sqlite';
import { db as sharedDb } from '../db/sqlite.js';
import { ReminderStage } from './reminders.js';

export type AppointmentStatus =
  | 'agendado'
  | 'confirmado'
  | 'risco_falta'
  | 'cancelado'
  | 'compareceu';

export interface AppointmentRow {
  id: number;
  phone: string;
  name: string;
  instance: string;
  unit: string;
  date: string; // 'YYYY-MM-DD'
  time: string | null; // 'HH:MM'
  status: AppointmentStatus;
  form_filled: number;
  form_token: string | null;
  sent_booking: number;
  sent_h48: number;
  sent_eve: number;
  sent_day: number;
  created_at: string;
  updated_at: string;
}

export interface NewAppointment {
  phone: string;
  name: string;
  instance: string;
  unit: string;
  date: string;
  time: string | null;
}

const SENT_COLUMN: Record<ReminderStage, string> = {
  booking: 'sent_booking',
  h48: 'sent_h48',
  eve: 'sent_eve',
  day: 'sent_day',
};

export function initAppointmentsSchema(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS appointments (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      phone         TEXT    NOT NULL,
      name          TEXT    NOT NULL,
      instance      TEXT    NOT NULL,
      unit          TEXT    NOT NULL,
      date          TEXT    NOT NULL,
      time          TEXT,
      status        TEXT    NOT NULL DEFAULT 'agendado',
      form_filled   INTEGER NOT NULL DEFAULT 0,
      form_token    TEXT,
      sent_booking  INTEGER NOT NULL DEFAULT 0,
      sent_h48      INTEGER NOT NULL DEFAULT 0,
      sent_eve      INTEGER NOT NULL DEFAULT 0,
      sent_day      INTEGER NOT NULL DEFAULT 0,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_appointments_phone ON appointments (phone);
    CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments (date);
    CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments (status);
  `);
}

export interface AppointmentStore {
  create(appt: NewAppointment): AppointmentRow;
  getById(id: number): AppointmentRow | null;
  /** Agendamento ativo (não cancelado/compareceu) mais recente para o telefone. */
  findActiveForPhone(phone: string): AppointmentRow | null;
  /** Agendamento ativo do telefone numa data específica (evita duplicar). */
  findActiveForPhoneOnDate(phone: string, date: string): AppointmentRow | null;
  /** Todos os agendamentos ativos (para o scheduler varrer estágios devidos). */
  listActive(): AppointmentRow[];
  markReminderSent(id: number, stage: ReminderStage): void;
  updateStatus(id: number, status: AppointmentStatus): void;
  markFormFilled(id: number): void;
  getByFormToken(token: string): AppointmentRow | null;
  setFormToken(id: number, token: string): void;
}

export function createAppointmentStore(database: DatabaseSync): AppointmentStore {
  initAppointmentsSchema(database);

  const insertStmt = database.prepare(`
    INSERT INTO appointments (phone, name, instance, unit, date, time)
    VALUES (@phone, @name, @instance, @unit, @date, @time)
  `);
  const getByIdStmt = database.prepare(`SELECT * FROM appointments WHERE id = ?`);
  const findActiveForPhoneStmt = database.prepare(`
    SELECT * FROM appointments
    WHERE phone = ? AND status NOT IN ('cancelado', 'compareceu')
    ORDER BY date DESC, id DESC LIMIT 1
  `);
  const findActiveForPhoneOnDateStmt = database.prepare(`
    SELECT * FROM appointments
    WHERE phone = ? AND date = ? AND status NOT IN ('cancelado', 'compareceu')
    ORDER BY id DESC LIMIT 1
  `);
  const listActiveStmt = database.prepare(`
    SELECT * FROM appointments WHERE status NOT IN ('cancelado', 'compareceu')
  `);
  const updateStatusStmt = database.prepare(`
    UPDATE appointments SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `);
  const markFormFilledStmt = database.prepare(`
    UPDATE appointments SET form_filled = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `);
  const getByFormTokenStmt = database.prepare(`SELECT * FROM appointments WHERE form_token = ?`);
  const setFormTokenStmt = database.prepare(`
    UPDATE appointments SET form_token = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `);

  function markReminderSentStmt(stage: ReminderStage) {
    return database.prepare(
      `UPDATE appointments SET ${SENT_COLUMN[stage]} = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    );
  }

  return {
    create(appt) {
      const info = insertStmt.run({
        '@phone': appt.phone,
        '@name': appt.name,
        '@instance': appt.instance,
        '@unit': appt.unit,
        '@date': appt.date,
        '@time': appt.time,
      } as Record<string, string | null>);
      const created = getByIdStmt.get(Number(info.lastInsertRowid)) as unknown as AppointmentRow;
      return created;
    },

    getById(id) {
      return (getByIdStmt.get(id) as AppointmentRow | undefined) ?? null;
    },

    findActiveForPhone(phone) {
      return (findActiveForPhoneStmt.get(phone) as AppointmentRow | undefined) ?? null;
    },

    findActiveForPhoneOnDate(phone, date) {
      return (findActiveForPhoneOnDateStmt.get(phone, date) as AppointmentRow | undefined) ?? null;
    },

    listActive() {
      return listActiveStmt.all() as unknown as AppointmentRow[];
    },

    markReminderSent(id, stage) {
      markReminderSentStmt(stage).run(id);
    },

    updateStatus(id, status) {
      updateStatusStmt.run(status, id);
    },

    markFormFilled(id) {
      markFormFilledStmt.run(id);
    },

    getByFormToken(token) {
      return (getByFormTokenStmt.get(token) as AppointmentRow | undefined) ?? null;
    },

    setFormToken(id, token) {
      setFormTokenStmt.run(token, id);
    },
  };
}

/** Instância compartilhada, ligada ao mesmo banco usado pelo resto do app. */
export const appointmentStore = createAppointmentStore(sharedDb);
