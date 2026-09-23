/**
 * TESTES — Módulo de Feriados (nacionais / estaduais / municipais)
 * Rodar via: npm test  (compila e executa com Mocha)
 */
'use strict';

const assert = require('assert');
const H = require('./holidays.js');

describe('Feriados', () => {
  describe('easterSunday()', () => {
    it('calcula a Páscoa corretamente (datas conhecidas)', () => {
      assert.strictEqual(H.easterSunday(2024).toISOString().slice(0, 10), '2024-03-31');
      assert.strictEqual(H.easterSunday(2025).toISOString().slice(0, 10), '2025-04-20');
      assert.strictEqual(H.easterSunday(2026).toISOString().slice(0, 10), '2026-04-05');
    });
  });

  describe('holidaysForYear()', () => {
    const list = H.holidaysForYear(2026);
    const byDate = (iso) => list.find((h) => h.date === iso);

    it('inclui Natal como nacional em todas as unidades', () => {
      const natal = byDate('2026-12-25');
      assert.ok(natal, 'Natal não encontrado');
      assert.strictEqual(natal.scope, 'nacional');
      assert.deepStrictEqual(
        natal.cities.sort(),
        ['Campina Grande', 'Caruaru', 'Palmares'].sort(),
      );
    });

    it('São João (24/06) afeta as três unidades (municipal mesclado)', () => {
      const sj = byDate('2026-06-24');
      assert.ok(sj, 'São João não encontrado');
      assert.strictEqual(sj.scope, 'municipal');
      assert.ok(sj.cities.includes('Campina Grande'));
      assert.ok(sj.cities.includes('Caruaru'));
      assert.ok(sj.cities.includes('Palmares'));
    });

    it('Data Magna de PE (06/03) só afeta Caruaru e Palmares', () => {
      const pe = byDate('2026-03-06');
      assert.ok(pe);
      assert.strictEqual(pe.scope, 'estadual');
      assert.deepStrictEqual(pe.cities.sort(), ['Caruaru', 'Palmares'].sort());
      assert.ok(!pe.cities.includes('Campina Grande'));
    });

    it('Fundação da Paraíba (05/08) só afeta Campina Grande', () => {
      const pb = byDate('2026-08-05');
      assert.ok(pb);
      assert.strictEqual(pb.scope, 'estadual');
      assert.deepStrictEqual(pb.cities, ['Campina Grande']);
    });

    it('Emancipação de Caruaru (18/05) é municipal só de Caruaru', () => {
      const c = byDate('2026-05-18');
      assert.ok(c);
      assert.strictEqual(c.scope, 'municipal');
      assert.deepStrictEqual(c.cities, ['Caruaru']);
    });

    it('inclui Sexta-feira Santa (móvel) em 2026 = 03/04', () => {
      const sexta = byDate('2026-04-03');
      assert.ok(sexta, 'Sexta-feira Santa não encontrada');
      assert.strictEqual(sexta.scope, 'nacional');
    });
  });

  describe('isHoliday()', () => {
    it('24/06/2026 é feriado em Campina Grande', () => {
      const r = H.isHoliday(new Date(Date.UTC(2026, 5, 24)), 'Campina Grande');
      assert.ok(r);
      assert.strictEqual(r.name, 'São João');
    });

    it('06/03/2026 NÃO é feriado em Campina Grande (estadual PE)', () => {
      const r = H.isHoliday(new Date(Date.UTC(2026, 2, 6)), 'Campina Grande');
      assert.strictEqual(r, null);
    });

    it('um dia útil comum não é feriado', () => {
      const r = H.isHoliday(new Date(Date.UTC(2026, 5, 17))); // 17/06/2026 (quarta)
      assert.strictEqual(r, null);
    });
  });

  describe('buildHolidayContext()', () => {
    it('lista o São João quando consultado em meados de junho/2026', () => {
      const ctx = H.buildHolidayContext(new Date(Date.UTC(2026, 5, 19)), 60);
      assert.ok(ctx.includes('São João'));
      assert.ok(ctx.includes('24/06'));
      assert.ok(ctx.includes('FERIADOS'));
    });

    it('retorna string vazia quando não há feriados na janela', () => {
      // Janela curta começando num período sem feriados (meados de janeiro)
      const ctx = H.buildHolidayContext(new Date(Date.UTC(2026, 0, 8)), 5);
      assert.strictEqual(ctx, '');
    });
  });
});
