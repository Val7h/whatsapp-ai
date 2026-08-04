/**
 * TESTES — Armazenamento de agendamentos (store.ts)
 * Usa um banco SQLite ':memory:' isolado — nunca toca no banco real.
 */
'use strict';

const assert = require('assert');
const { DatabaseSync } = require('node:sqlite');
const { createAppointmentStore } = require('./store.js');

function freshStore() {
  return createAppointmentStore(new DatabaseSync(':memory:'));
}

const SAMPLE = {
  phone: '5583999990001',
  name: 'João',
  instance: 'cto-campina',
  unit: 'CTO',
  date: '2026-06-25',
  time: '08:00',
};

describe('AppointmentStore', () => {
  it('create() grava e retorna a linha com defaults corretos', () => {
    const store = freshStore();
    const appt = store.create(SAMPLE);
    assert.strictEqual(appt.phone, SAMPLE.phone);
    assert.strictEqual(appt.status, 'agendado');
    assert.strictEqual(appt.form_filled, 0);
    assert.strictEqual(appt.sent_booking, 0);
    assert.ok(appt.id > 0);
  });

  it('getById() recupera pelo id; id inexistente retorna null', () => {
    const store = freshStore();
    const appt = store.create(SAMPLE);
    assert.deepStrictEqual(store.getById(appt.id), appt);
    assert.strictEqual(store.getById(999999), null);
  });

  it('findActiveForPhone() retorna o mais recente e ignora cancelado/compareceu', () => {
    const store = freshStore();
    const a1 = store.create({ ...SAMPLE, date: '2026-06-20' });
    const a2 = store.create({ ...SAMPLE, date: '2026-06-27' });
    assert.strictEqual(store.findActiveForPhone(SAMPLE.phone).id, a2.id);

    store.updateStatus(a2.id, 'cancelado');
    assert.strictEqual(store.findActiveForPhone(SAMPLE.phone).id, a1.id);
  });

  it('findActiveForPhoneOnDate() localiza por telefone+data', () => {
    const store = freshStore();
    const appt = store.create(SAMPLE);
    assert.strictEqual(store.findActiveForPhoneOnDate(SAMPLE.phone, SAMPLE.date).id, appt.id);
    assert.strictEqual(store.findActiveForPhoneOnDate(SAMPLE.phone, '2099-01-01'), null);

    store.updateStatus(appt.id, 'cancelado');
    assert.strictEqual(store.findActiveForPhoneOnDate(SAMPLE.phone, SAMPLE.date), null);
  });

  it('listActive() traz só os não cancelados/compareceu', () => {
    const store = freshStore();
    const a1 = store.create(SAMPLE);
    const a2 = store.create({ ...SAMPLE, phone: '5583999990002' });
    store.updateStatus(a2.id, 'compareceu');
    const active = store.listActive();
    assert.strictEqual(active.length, 1);
    assert.strictEqual(active[0].id, a1.id);
  });

  it('markReminderSent() marca só o flag do estágio correspondente', () => {
    const store = freshStore();
    const appt = store.create(SAMPLE);
    store.markReminderSent(appt.id, 'h48');
    const updated = store.getById(appt.id);
    assert.strictEqual(updated.sent_h48, 1);
    assert.strictEqual(updated.sent_booking, 0);
    assert.strictEqual(updated.sent_eve, 0);
    assert.strictEqual(updated.sent_day, 0);
  });

  it('updateStatus() muda o status', () => {
    const store = freshStore();
    const appt = store.create(SAMPLE);
    store.updateStatus(appt.id, 'confirmado');
    assert.strictEqual(store.getById(appt.id).status, 'confirmado');
  });

  it('markFormFilled() marca form_filled=1', () => {
    const store = freshStore();
    const appt = store.create(SAMPLE);
    assert.strictEqual(store.getById(appt.id).form_filled, 0);
    store.markFormFilled(appt.id);
    assert.strictEqual(store.getById(appt.id).form_filled, 1);
  });

  it('setFormToken() + getByFormToken() faz o roundtrip', () => {
    const store = freshStore();
    const appt = store.create(SAMPLE);
    store.setFormToken(appt.id, 'tok-abc-123');
    const found = store.getByFormToken('tok-abc-123');
    assert.strictEqual(found.id, appt.id);
    assert.strictEqual(store.getByFormToken('nao-existe'), null);
  });
});
