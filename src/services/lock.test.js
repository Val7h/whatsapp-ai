/**
 * TESTES — Lock por chave (mutex assíncrono em processo)
 */
'use strict';

const assert = require('assert');
const { withLock } = require('./lock.js');

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

describe('withLock', () => {
  it('serializa tarefas na mesma chave (FIFO), mesmo se a 2ª for mais rápida', async () => {
    const order = [];
    const p1 = withLock('A', async () => { await delay(30); order.push('a1'); });
    const p2 = withLock('A', async () => { await delay(1); order.push('a2'); });
    await Promise.all([p1, p2]);
    assert.deepStrictEqual(order, ['a1', 'a2']);
  });

  it('chaves diferentes rodam em paralelo', async () => {
    const order = [];
    const px = withLock('X', async () => { await delay(30); order.push('x'); });
    const py = withLock('Y', async () => { await delay(1); order.push('y'); });
    await Promise.all([px, py]);
    assert.deepStrictEqual(order, ['y', 'x']); // Y termina antes mesmo iniciando junto
  });

  it('propaga retorno e erros, e a chave segue utilizável após erro', async () => {
    assert.strictEqual(await withLock('K', async () => 42), 42);
    await assert.rejects(withLock('K', async () => { throw new Error('boom'); }), /boom/);
    assert.strictEqual(await withLock('K', async () => 7), 7);
  });

  it('previne corrida de read-modify-write (incremento serializado)', async () => {
    const shared = { value: 0 };
    const inc = () => withLock('counter', async () => {
      const v = shared.value;      // read
      await delay(5);              // janela de corrida
      shared.value = v + 1;        // write
    });
    await Promise.all([inc(), inc(), inc(), inc(), inc()]);
    assert.strictEqual(shared.value, 5); // sem lock daria 1
  });
});
