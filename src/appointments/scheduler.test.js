/**
 * TESTES — planDueSends (scheduler.ts, parte pura)
 */
'use strict';

const assert = require('assert');
const { planDueSends } = require('./scheduler.js');

const at = (iso) => new Date(`${iso}-03:00`);

function baseAppt(overrides = {}) {
  return {
    id: 1,
    phone: '5583999990001',
    name: 'João',
    instance: 'cto-campina',
    unit: 'CTO — Campina Grande',
    date: '2026-06-27', // sábado seguinte a 25/06 (quinta) — ajustado por teste
    time: '09:00',
    status: 'agendado',
    form_filled: 0,
    form_token: null,
    sent_booking: 0,
    sent_h48: 0,
    sent_eve: 0,
    sent_day: 0,
    ...overrides,
  };
}

describe('planDueSends', () => {
  it('h48 devido + formulário não preenchido → mensagem com link + newFormToken', () => {
    // consulta 27/06 09:00; 40h antes = 25/06 17:00
    const appt = baseAppt({ sent_booking: 1 });
    const sends = planDueSends([appt], at('2026-06-25T17:00:00'), 'https://x.com');
    assert.strictEqual(sends.length, 1);
    assert.strictEqual(sends[0].stage, 'h48');
    assert.ok(sends[0].message.includes('https://x.com/pre-consulta'));
    assert.ok(sends[0].newFormToken);
  });

  it('h48 devido + formulário JÁ preenchido → mensagem sem link, sem newFormToken', () => {
    const appt = baseAppt({ sent_booking: 1, form_filled: 1 });
    const sends = planDueSends([appt], at('2026-06-25T17:00:00'), 'https://x.com');
    assert.strictEqual(sends.length, 1);
    assert.ok(!sends[0].message.includes('https://x.com'));
    assert.strictEqual(sends[0].newFormToken, undefined);
  });

  it('eve devido → mensagem de confirmação SIM/NÃO', () => {
    // 20h antes = 26/06 13:00
    const appt = baseAppt({ sent_booking: 1, sent_h48: 1 });
    const sends = planDueSends([appt], at('2026-06-26T13:00:00'));
    assert.strictEqual(sends.length, 1);
    assert.strictEqual(sends[0].stage, 'eve');
    assert.ok(/SIM/.test(sends[0].message));
  });

  it('day devido → mensagem curta', () => {
    // 2h antes = 27/06 07:00
    const appt = baseAppt({ sent_booking: 1, sent_h48: 1, sent_eve: 1 });
    const sends = planDueSends([appt], at('2026-06-27T07:00:00'));
    assert.strictEqual(sends.length, 1);
    assert.strictEqual(sends[0].stage, 'day');
  });

  it('booking devido (agendamento novo, nada enviado ainda) → mensagem completa + link', () => {
    const appt = baseAppt({ date: '2026-08-01' }); // bem no futuro, nada mais é devido ainda
    const sends = planDueSends([appt], at('2026-06-25T10:00:00'), 'https://x.com');
    assert.strictEqual(sends.length, 1);
    assert.strictEqual(sends[0].stage, 'booking');
    assert.ok(sends[0].message.includes('agendada'));
    assert.ok(sends[0].message.includes('https://x.com/pre-consulta'));
    assert.ok(sends[0].newFormToken);
  });

  it('nada devido (cancelado) → nenhum envio', () => {
    const appt = baseAppt({ status: 'cancelado', date: '2026-08-01' });
    const sends = planDueSends([appt], at('2026-06-25T10:00:00'));
    assert.deepStrictEqual(sends, []);
  });

  it('múltiplos agendamentos são processados independentemente', () => {
    const a1 = baseAppt({ id: 1, date: '2026-08-01' }); // booking devido
    const a2 = baseAppt({ id: 2, date: '2026-06-27', sent_booking: 1, sent_h48: 1 }); // eve devido
    const sends = planDueSends([a1, a2], at('2026-06-26T13:00:00'), 'https://x.com');
    assert.strictEqual(sends.length, 2);
    const byId = Object.fromEntries(sends.map((s) => [s.appt.id, s.stage]));
    assert.strictEqual(byId[1], 'booking');
    assert.strictEqual(byId[2], 'eve');
  });
});
