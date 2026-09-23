/**
 * TESTES — Envio via Evolution API (evolution.ts)
 * Usa um fetch fake injetado — nunca bate na rede de verdade.
 */
'use strict';

const assert = require('assert');
const { sendWhatsAppMessage } = require('./evolution.js');

function fakeFetch({ ok = true, status = 200, body = '' } = {}) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url, opts });
    return { ok, status, text: async () => body };
  };
  fn.calls = calls;
  return fn;
}

describe('sendWhatsAppMessage', () => {
  it('monta a URL e o payload corretamente e retorna ok:true em sucesso', async () => {
    const fetchImpl = fakeFetch({ ok: true });
    const result = await sendWhatsAppMessage('cto-caruaru', '5581999990001', 'Olá!', fetchImpl);
    assert.deepStrictEqual(result, { ok: true });
    assert.strictEqual(fetchImpl.calls.length, 1);
    const { url, opts } = fetchImpl.calls[0];
    assert.ok(url.endsWith('/message/sendText/cto-caruaru'));
    assert.strictEqual(opts.method, 'POST');
    assert.strictEqual(opts.headers['Content-Type'], 'application/json');
    const payload = JSON.parse(opts.body);
    assert.strictEqual(payload.number, '5581999990001');
    assert.strictEqual(payload.text, 'Olá!');
  });

  it('retorna ok:false com o status HTTP quando a API responde erro', async () => {
    const fetchImpl = fakeFetch({ ok: false, status: 500, body: 'boom' });
    const result = await sendWhatsAppMessage('cto-geral', '5581999990002', 'oi', fetchImpl);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.error, 'HTTP 500');
  });

  it('retorna ok:false (sem lançar) quando o fetch rejeita (rede fora)', async () => {
    const fetchImpl = async () => {
      throw new Error('network down');
    };
    const result = await sendWhatsAppMessage('cto-geral', '5581999990003', 'oi', fetchImpl);
    assert.strictEqual(result.ok, false);
    assert.ok(result.error.includes('network down'));
  });
});
