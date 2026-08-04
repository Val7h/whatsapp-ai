/**
 * TESTES — Horário de atendimento (grade semanal + "aberto agora")
 * Rodar via: npm test
 *
 * Datas de referência (2026): 22/06 = segunda | 23/06 = terça |
 *   24/06 = quarta (São João!) | 25/06 = quinta | 26/06 = sexta |
 *   17/06 = quarta (sem feriado)
 *
 * IMPORTANTE: usamos instantes com offset explícito '-03:00' (fuso da clínica,
 * Recife) para que os testes independam do TZ do processo e validem de fato a
 * correção de fuso horário (o servidor pode rodar em UTC).
 */
'use strict';

const assert = require('assert');
const S = require('./schedule.js');

// Helper: instante de parede no fuso da clínica (GMT-3).
const at = (iso) => new Date(`${iso}-03:00`);

describe('Horário de atendimento', () => {
  describe('slotsForDay()', () => {
    it('segunda tem CTO (Campina) e Intensiva Day (Caruaru)', () => {
      const slots = S.slotsForDay(at('2026-06-22T10:00:00'));
      assert.strictEqual(slots.length, 2);
      assert.deepStrictEqual(slots.map((s) => s.clinic).sort(), ['CTO', 'Hospital Intensiva Day']);
    });

    it('sexta não tem atendimento', () => {
      assert.strictEqual(S.slotsForDay(at('2026-06-26T10:00:00')).length, 0);
    });

    it('quarta normal (17/06) tem IP e Unimagem em Caruaru', () => {
      const slots = S.slotsForDay(at('2026-06-17T10:00:00'));
      assert.strictEqual(slots.length, 2);
      assert.ok(slots.every((s) => s.city === 'Caruaru'));
    });

    it('quarta de São João (24/06) fica SEM atendimento (feriado)', () => {
      assert.strictEqual(S.slotsForDay(at('2026-06-24T10:00:00')).length, 0);
    });
  });

  describe('openSlotsAt() / isOpenNow()', () => {
    it('segunda 09:00 → CTO aberto', () => {
      const open = S.openSlotsAt(at('2026-06-22T09:00:00'));
      assert.strictEqual(open.length, 1);
      assert.strictEqual(open[0].clinic, 'CTO');
    });

    it('segunda 13:00 → fechado (intervalo entre CTO e Intensiva Day)', () => {
      assert.strictEqual(S.isOpenNow(at('2026-06-22T13:00:00')), false);
    });

    it('segunda 18:00 → Intensiva Day (Caruaru) aberto', () => {
      const open = S.openSlotsAt(at('2026-06-22T18:00:00'));
      assert.strictEqual(open.length, 1);
      assert.strictEqual(open[0].city, 'Caruaru');
    });

    it('quarta 10:00 normal → IP aberto', () => {
      assert.strictEqual(S.isOpenNow(at('2026-06-17T10:00:00')), true);
    });

    it('quarta 10:00 no São João → fechado (feriado anula a grade)', () => {
      assert.strictEqual(S.isOpenNow(at('2026-06-24T10:00:00')), false);
    });

    it('sexta a qualquer hora → fechado', () => {
      assert.strictEqual(S.isOpenNow(at('2026-06-26T10:00:00')), false);
    });
  });

  describe('nextOpening()', () => {
    it('sexta 12:00 → próximo é segunda 08:00 no CTO', () => {
      const next = S.nextOpening(at('2026-06-26T12:00:00'));
      assert.ok(next);
      assert.strictEqual(next.slot.start, '08:00');
      assert.strictEqual(next.slot.clinic, 'CTO');
      assert.strictEqual(next.weekday, 1); // segunda
    });

    it('filtra por cidade (próximo de Palmares é uma terça)', () => {
      const next = S.nextOpening(at('2026-06-22T08:00:00'), 'Palmares');
      assert.ok(next);
      assert.strictEqual(next.slot.city, 'Palmares');
      assert.strictEqual(next.weekday, 2); // terça
    });
  });

  describe('buildScheduleContext()', () => {
    it('quando aberto, indica ABERTO AGORA', () => {
      const ctx = S.buildScheduleContext(at('2026-06-17T10:00:00')); // quarta IP
      assert.ok(ctx.includes('ABERTO AGORA'));
      assert.ok(ctx.includes('Caruaru'));
    });

    it('na sexta, informa sem atendimento e o próximo dia', () => {
      const ctx = S.buildScheduleContext(at('2026-06-26T10:00:00'));
      assert.ok(ctx.includes('NÃO há atendimento'));
      assert.ok(ctx.includes('Próximo atendimento'));
    });
  });

  // ── Regressão de fuso horário ────────────────────────────────────────────
  describe('fuso horário (TZ-independente)', () => {
    it('22:00 de terça em Recife NÃO vira quarta/São João (instante UTC do dia seguinte)', () => {
      // 2026-06-24T01:00Z = 23/06 22:00 em Recife (terça) — dia de Palmares.
      const instant = new Date('2026-06-24T01:00:00Z');
      const slots = S.slotsForDay(instant);
      assert.strictEqual(slots.length, 1);
      assert.strictEqual(slots[0].city, 'Palmares');
      assert.ok(S.buildScheduleContext(instant).includes('terça'));
    });
  });
});
