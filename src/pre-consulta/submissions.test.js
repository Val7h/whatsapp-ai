/**
 * TESTES — Registro de submissões de pré-consulta (submissions.ts)
 */
'use strict';

const assert = require('assert');
const { DatabaseSync } = require('node:sqlite');
const { createSubmissionsStore } = require('./submissions.js');

const at = (iso) => new Date(`${iso}-03:00`);

function freshStore() {
  return createSubmissionsStore(new DatabaseSync(':memory:'));
}

describe('SubmissionsStore', () => {
  it('record() grava e retorna a linha com a data no fuso da clínica', () => {
    const store = freshStore();
    // 23:30 em Recife ainda é 25/06 (mesmo que já seja 26/06 em UTC)
    const row = store.record(
      { agendamento_id: '1', phone: '5583999990001', name: 'João', pdf_url: 'https://x.com/a.pdf' },
      at('2026-06-25T23:30:00'),
    );
    assert.strictEqual(row.date, '2026-06-25');
    assert.strictEqual(row.name, 'João');
  });

  it('listForDay() retorna só as submissões do dia pedido', () => {
    const store = freshStore();
    store.record({ agendamento_id: '1', phone: 'a', name: 'A', pdf_url: 'x' }, at('2026-06-25T10:00:00'));
    store.record({ agendamento_id: '2', phone: 'b', name: 'B', pdf_url: 'y' }, at('2026-06-25T18:00:00'));
    store.record({ agendamento_id: '3', phone: 'c', name: 'C', pdf_url: 'z' }, at('2026-06-26T10:00:00'));

    const day25 = store.listForDay('2026-06-25');
    assert.strictEqual(day25.length, 2);
    assert.deepStrictEqual(day25.map((r) => r.name).sort(), ['A', 'B']);

    assert.strictEqual(store.listForDay('2026-06-26').length, 1);
    assert.strictEqual(store.listForDay('2026-06-27').length, 0);
  });

  it('agendamento_id pode ser null (submissão sem vínculo)', () => {
    const store = freshStore();
    const row = store.record({ agendamento_id: null, phone: 'x', name: 'Y', pdf_url: 'z' });
    assert.strictEqual(row.agendamento_id, null);
  });
});
