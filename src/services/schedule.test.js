/**
 * TESTES — Horário de atendimento (grade semanal + "aberto agora")
 * Rodar via: npm test
 *
 * Datas de referência (2026):
 *   22/06 = segunda | 23/06 = terça | 24/06 = quarta (São João!) |
 *   25/06 = quinta  | 26/06 = sexta | 17/06 = quarta (sem feriado)
 * Observação: usamos o construtor LOCAL (new Date(ano, mês, dia, h, m)) para
 * que getDay()/getHours() batam com a grade independentemente do fuso.
 */
'use strict';

const assert = require('assert');
const S = require('./schedule.js');

describe('Horário de atendimento', () => {
  describe('slotsForDay()', () => {
    it('segunda tem CTO (Campina) e Intensiva Day (Caruaru)', () => {
      const slots = S.slotsForDay(new Date(2026, 5, 22, 10, 0)); // segunda
      assert.strictEqual(slots.length, 2);
      assert.deepStrictEqual(slots.map((s) => s.clinic).sort(), ['CTO', 'Hospital Intensiva Day']);
    });

    it('sexta não tem atendimento', () => {
      const slots = S.slotsForDay(new Date(2026, 5, 26, 10, 0)); // sexta
      assert.strictEqual(slots.length, 0);
    });

    it('quarta normal (17/06) tem IP e Unimagem em Caruaru', () => {
      const slots = S.slotsForDay(new Date(2026, 5, 17, 10, 0));
      assert.strictEqual(slots.length, 2);
      assert.ok(slots.every((s) => s.city === 'Caruaru'));
    });

    it('quarta de São João (24/06) fica SEM atendimento (feriado)', () => {
      const slots = S.slotsForDay(new Date(2026, 5, 24, 10, 0));
      assert.strictEqual(slots.length, 0);
    });
  });

  describe('openSlotsAt() / isOpenNow()', () => {
    it('segunda 09:00 → CTO aberto', () => {
      const open = S.openSlotsAt(new Date(2026, 5, 22, 9, 0));
      assert.strictEqual(open.length, 1);
      assert.strictEqual(open[0].clinic, 'CTO');
    });

    it('segunda 13:00 → fechado (intervalo entre CTO e Intensiva Day)', () => {
      assert.strictEqual(S.isOpenNow(new Date(2026, 5, 22, 13, 0)), false);
    });

    it('segunda 18:00 → Intensiva Day (Caruaru) aberto', () => {
      const open = S.openSlotsAt(new Date(2026, 5, 22, 18, 0));
      assert.strictEqual(open.length, 1);
      assert.strictEqual(open[0].city, 'Caruaru');
    });

    it('quarta 10:00 normal → IP aberto', () => {
      assert.strictEqual(S.isOpenNow(new Date(2026, 5, 17, 10, 0)), true);
    });

    it('quarta 10:00 no São João → fechado (feriado anula a grade)', () => {
      assert.strictEqual(S.isOpenNow(new Date(2026, 5, 24, 10, 0)), false);
    });

    it('sexta a qualquer hora → fechado', () => {
      assert.strictEqual(S.isOpenNow(new Date(2026, 5, 26, 10, 0)), false);
    });
  });

  describe('nextOpening()', () => {
    it('sexta 12:00 → próximo é segunda 08:00 no CTO', () => {
      const next = S.nextOpening(new Date(2026, 5, 26, 12, 0));
      assert.ok(next);
      assert.strictEqual(next.slot.start, '08:00');
      assert.strictEqual(next.slot.clinic, 'CTO');
      assert.strictEqual(next.date.getDate(), 29); // segunda 29/06
    });

    it('filtra por cidade (próximo de Palmares é uma terça)', () => {
      const next = S.nextOpening(new Date(2026, 5, 22, 8, 0), 'Palmares');
      assert.ok(next);
      assert.strictEqual(next.slot.city, 'Palmares');
      assert.strictEqual(next.date.getDay(), 2); // terça
    });
  });

  describe('buildScheduleContext()', () => {
    it('quando aberto, indica ABERTO AGORA', () => {
      const ctx = S.buildScheduleContext(new Date(2026, 5, 17, 10, 0)); // quarta IP
      assert.ok(ctx.includes('ABERTO AGORA'));
      assert.ok(ctx.includes('Caruaru'));
    });

    it('na sexta, informa sem atendimento e o próximo dia', () => {
      const ctx = S.buildScheduleContext(new Date(2026, 5, 26, 10, 0));
      assert.ok(ctx.includes('NÃO há atendimento'));
      assert.ok(ctx.includes('Próximo atendimento'));
    });
  });
});
