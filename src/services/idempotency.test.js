/**
 * TESTES — Idempotência (dedupe por message-id, modo memória)
 * Sem REDIS_URL os testes exercitam o fallback em memória.
 */
'use strict';

const assert = require('assert');
const M = require('./memory.js');

describe('Idempotência (message-id)', () => {
  it('id nunca visto retorna null', async () => {
    assert.strictEqual(await M.getProcessedReply('id-inexistente-123'), null);
  });

  it('após setProcessedReply, getProcessedReply devolve a mesma resposta', async () => {
    await M.setProcessedReply('msg-abc', 'Olá, João. Bom dia.');
    assert.strictEqual(await M.getProcessedReply('msg-abc'), 'Olá, João. Bom dia.');
  });

  it('ids diferentes não colidem', async () => {
    await M.setProcessedReply('msg-1', 'resposta 1');
    await M.setProcessedReply('msg-2', 'resposta 2');
    assert.strictEqual(await M.getProcessedReply('msg-1'), 'resposta 1');
    assert.strictEqual(await M.getProcessedReply('msg-2'), 'resposta 2');
  });
});
