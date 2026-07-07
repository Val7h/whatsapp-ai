/**
 * TESTES — Resumo diário de formulários (daily-forms-digest.ts)
 */
'use strict';

const assert = require('assert');
const { buildDigestMessage } = require('./daily-forms-digest.js');

describe('buildDigestMessage', () => {
  it('mensagem para zero submissões', () => {
    const msg = buildDigestMessage([], '25/06/2026');
    assert.ok(msg.includes('nenhum formulário'));
    assert.ok(msg.includes('25/06/2026'));
  });

  it('lista cada submissão com nome e link do PDF', () => {
    const rows = [
      { name: 'João Silva', pdf_url: 'https://x.com/a.pdf' },
      { name: 'Maria Souza', pdf_url: 'https://x.com/b.pdf' },
    ];
    const msg = buildDigestMessage(rows, '25/06/2026');
    assert.ok(msg.includes('2 formulário(s)'));
    assert.ok(msg.includes('João Silva'));
    assert.ok(msg.includes('https://x.com/a.pdf'));
    assert.ok(msg.includes('Maria Souza'));
    assert.ok(msg.includes('https://x.com/b.pdf'));
  });
});
