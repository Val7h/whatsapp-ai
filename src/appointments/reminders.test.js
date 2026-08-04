/**
 * TESTES — Motor de lembretes (reminders.ts)
 *
 * Datas de referência (2026): usamos instantes com offset explícito '-03:00'
 * (fuso da clínica) para os testes independerem do TZ do processo.
 */
'use strict';

const assert = require('assert');
const R = require('./reminders.js');

const at = (iso) => new Date(`${iso}-03:00`);

function baseAppt(overrides = {}) {
  return {
    id: 1,
    phone: '5583999990001',
    name: 'João',
    unit: 'CTO',
    date: '2026-06-25', // quinta-feira
    time: '08:00',
    status: 'agendado',
    form_filled: 0,
    sent_booking: 0,
    sent_h48: 0,
    sent_eve: 0,
    sent_day: 0,
    ...overrides,
  };
}

describe('appointmentMs', () => {
  it('usa o horário informado quando presente', () => {
    const ms = R.appointmentMs('2026-06-25', '14:00');
    assert.strictEqual(new Date(ms).toISOString(), '2026-06-25T17:00:00.000Z'); // 14h-03:00 = 17h UTC
  });
  it('usa horário padrão quando null (ordem de chegada)', () => {
    const ms = R.appointmentMs('2026-06-25', null);
    assert.strictEqual(new Date(ms).toISOString(), '2026-06-25T12:00:00.000Z'); // 09h-03:00
  });
});

describe('isQuietHours', () => {
  it('04:59 é silêncio', () => assert.strictEqual(R.isQuietHours(at('2026-06-25T04:59:00')), true));
  it('05:00 não é silêncio', () => assert.strictEqual(R.isQuietHours(at('2026-06-25T05:00:00')), false));
  it('22:59 não é silêncio', () => assert.strictEqual(R.isQuietHours(at('2026-06-25T22:59:00')), false));
  it('23:00 é silêncio', () => assert.strictEqual(R.isQuietHours(at('2026-06-25T23:00:00')), true));
});

describe('dueStages', () => {
  it('logo após a marcação (muito antes da consulta) → booking devido', () => {
    const appt = baseAppt({ date: '2026-07-20', time: '09:00' });
    const stages = R.dueStages(appt, at('2026-06-25T10:00:00'));
    assert.deepStrictEqual(stages, ['booking']);
  });

  it('booking já enviado não repete', () => {
    const appt = baseAppt({ date: '2026-07-20', time: '09:00', sent_booking: 1 });
    const stages = R.dueStages(appt, at('2026-06-25T10:00:00'));
    assert.deepStrictEqual(stages, []);
  });

  it('~40h antes → h48 devido (booking já foi enviado)', () => {
    // consulta 27/06 09:00; 40h antes = 25/06 17:00
    const appt = baseAppt({ date: '2026-06-27', time: '09:00', sent_booking: 1 });
    const stages = R.dueStages(appt, at('2026-06-25T17:00:00'));
    assert.deepStrictEqual(stages, ['h48']);
  });

  it('~20h antes → eve devido', () => {
    // consulta 27/06 09:00; 20h antes = 26/06 13:00
    const appt = baseAppt({ date: '2026-06-27', time: '09:00', sent_booking: 1, sent_h48: 1 });
    const stages = R.dueStages(appt, at('2026-06-26T13:00:00'));
    assert.deepStrictEqual(stages, ['eve']);
  });

  it('~2h antes → day devido', () => {
    // consulta 27/06 09:00; 2h antes = 27/06 07:00
    const appt = baseAppt({ date: '2026-06-27', time: '09:00', sent_booking: 1, sent_h48: 1, sent_eve: 1 });
    const stages = R.dueStages(appt, at('2026-06-27T07:00:00'));
    assert.deepStrictEqual(stages, ['day']);
  });

  it('depois da consulta → nada devido', () => {
    const appt = baseAppt({ date: '2026-06-27', time: '09:00' });
    const stages = R.dueStages(appt, at('2026-06-27T10:00:00'));
    assert.deepStrictEqual(stages, []);
  });

  it('cancelado → nunca devido, mesmo com estágios pendentes', () => {
    const appt = baseAppt({ date: '2026-07-20', time: '09:00', status: 'cancelado' });
    assert.deepStrictEqual(R.dueStages(appt, at('2026-06-25T10:00:00')), []);
  });

  it('compareceu → nunca devido', () => {
    const appt = baseAppt({ date: '2026-06-20', time: '09:00', status: 'compareceu' });
    assert.deepStrictEqual(R.dueStages(appt, at('2026-06-20T08:00:00')), []);
  });

  it('horário de silêncio (madrugada) segura o envio mesmo com estágio na janela', () => {
    // 40h antes cairia no horário certo, mas é 03:00 (silêncio)
    const appt = baseAppt({ date: '2026-06-27', time: '09:00', sent_booking: 1 });
    const stages = R.dueStages(appt, at('2026-06-25T03:00:00'));
    assert.deepStrictEqual(stages, []);
  });

  it('scheduler perdeu o horário exato do h48 — ainda dispara h48 (não eve) se ainda na janela h48', () => {
    const appt = baseAppt({ date: '2026-06-27', time: '09:00', sent_booking: 1 });
    // 25h antes da consulta = ainda dentro da janela h48 (24h–48h antes)
    const stages = R.dueStages(appt, at('2026-06-26T08:00:00'));
    assert.deepStrictEqual(stages, ['h48']);
  });

  it('múltiplos estágios podem ficar devidos ao mesmo tempo se o scheduler ficou off (retoma tudo pendente)', () => {
    // Sem nada enviado, e já estamos na janela "eve" (24h antes): booking (venceu no passado) + eve devidos juntos
    const appt = baseAppt({ date: '2026-06-27', time: '09:00' });
    const stages = R.dueStages(appt, at('2026-06-26T13:00:00'));
    assert.deepStrictEqual(stages, ['booking', 'eve']);
  });
});
