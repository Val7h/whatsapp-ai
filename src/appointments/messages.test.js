/**
 * TESTES — Construtores de mensagens de lembrete (messages.ts)
 */
'use strict';

const assert = require('assert');
const M = require('./messages.js');

function appt(overrides = {}) {
  return {
    id: 42,
    phone: '5583999990001',
    name: 'João Silva',
    instance: 'cto-campina',
    unit: 'CTO (Campina Grande)',
    date: '2026-06-25', // quinta-feira
    time: '08:00',
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

describe('buildFormLink', () => {
  it('gera URL com todos os parâmetros esperados pelo formulário', () => {
    const { url, token, exp } = M.buildFormLink(appt(), 'https://cto.example.com', 1000);
    assert.ok(url.startsWith('https://cto.example.com/pre-consulta?'));
    assert.ok(url.includes('aid=42'));
    assert.ok(url.includes('nome=Jo%C3%A3o'));
    assert.ok(url.includes('tel=5583999990001'));
    assert.ok(url.includes(`token=${token}`));
    assert.strictEqual(exp, 1000 + 72 * 60 * 60 * 1000);
  });

  it('o token gerado é validável pelo módulo token.ts', () => {
    const { validarToken } = require('../pre-consulta/token.js');
    const a = appt();
    // usa o instante real para que `exp` fique no futuro em relação ao
    // Date.now() interno de validarToken (senão o token nasceria "expirado")
    const { token, exp } = M.buildFormLink(a, 'https://x.com', Date.now());
    const result = validarToken(String(a.id), exp, token);
    assert.strictEqual(result.valido, true);
  });
});

describe('buildBookingSuffix', () => {
  it('menciona o link e a data por extenso', () => {
    const msg = M.buildBookingSuffix(appt(), 'https://x.com/form');
    assert.ok(msg.includes('https://x.com/form'));
    assert.ok(msg.includes('25/06/2026'));
    assert.ok(msg.includes('quinta'));
  });
});

describe('buildH48Message', () => {
  it('inclui o link do formulário quando ainda não preenchido', () => {
    const msg = M.buildH48Message(appt({ form_filled: 0 }), 'https://x.com/form');
    assert.ok(msg.includes('https://x.com/form'));
    assert.ok(msg.includes('CTO (Campina Grande)'));
  });

  it('NÃO inclui o link quando o formulário já foi preenchido', () => {
    const msg = M.buildH48Message(appt({ form_filled: 1 }), 'https://x.com/form');
    assert.ok(!msg.includes('https://x.com/form'));
  });

  it('funciona sem formUrl (não quebra)', () => {
    const msg = M.buildH48Message(appt());
    assert.ok(msg.length > 0);
  });
});

describe('buildEveMessage', () => {
  it('pede confirmação ativa SIM/NÃO', () => {
    const msg = M.buildEveMessage(appt());
    assert.ok(/SIM/.test(msg));
    assert.ok(/N[ÃA]O/.test(msg));
  });

  it('usa "ordem de chegada" quando não há horário', () => {
    const msg = M.buildEveMessage(appt({ time: null }));
    assert.ok(msg.includes('ordem de chegada'));
  });
});

describe('buildDayMessage', () => {
  it('é curto e menciona a unidade', () => {
    const msg = M.buildDayMessage(appt());
    assert.ok(msg.includes('CTO (Campina Grande)'));
    assert.ok(msg.length < 200);
  });
});
