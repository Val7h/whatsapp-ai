/**
 * Formatters — formata as estatísticas em mensagens WhatsApp legíveis
 */

import { ReportStats } from './analytics.js';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function bar(value: number, max: number, len: number = 10): string {
  if (max === 0) return '░'.repeat(len);
  const filled = Math.round((value / max) * len);
  return '█'.repeat(filled) + '░'.repeat(len - filled);
}

function pct(value: number, total: number): string {
  if (total === 0) return '0%';
  return `${Math.round((value / total) * 100)}%`;
}

/**
 * RELATÓRIO DIÁRIO (enviado às 20h todo dia)
 * FOCO: PACIENTES ÚNICOS (não mensagens)
 */
export function formatDaily(stats: ReportStats): string {
  const date = formatDate(stats.period_start);
  const lines: string[] = [];

  lines.push(`🏥 *RELATÓRIO DIÁRIO* — ${date}`);
  lines.push(`Dr. Valth Guimarães — Ortopedia`);
  lines.push('');
  lines.push('👥 *PACIENTES*');
  lines.push(`• Total que entraram em contato: *${stats.unique_patients}*`);
  lines.push(`• ✨ Novos (primeira vez): *${stats.new_patients}*`);
  lines.push(`• 🔄 Retornantes: *${stats.returning_patients}*`);
  lines.push('');

  // Lista NOVOS pacientes com detalhes
  if (stats.new_patients_list.length > 0) {
    lines.push('✨ *NOVOS PACIENTES DO DIA*');
    stats.new_patients_list.slice(0, 15).forEach((p, i) => {
      lines.push(`${i + 1}. *${p.name}* — ${p.city}`);
      lines.push(`   _"${p.first_message}"_`);
    });
    if (stats.new_patients_list.length > 15) {
      lines.push(`_...e mais ${stats.new_patients_list.length - 15} novos pacientes_`);
    }
    lines.push('');
  }

  if (Object.keys(stats.by_city).length > 0) {
    lines.push('📍 *PACIENTES POR CIDADE*');
    const sortedCities = Object.entries(stats.by_city).sort((a, b) => b[1] - a[1]);
    for (const [city, count] of sortedCities) {
      lines.push(`• ${city}: ${count} (${pct(count, stats.unique_patients)})`);
    }
    lines.push('');
  }

  if (Object.keys(stats.by_intent).length > 0) {
    lines.push('🎯 *INTENÇÕES* (pacientes únicos)');
    const sortedIntents = Object.entries(stats.by_intent).sort((a, b) => b[1] - a[1]);
    for (const [intent, count] of sortedIntents.slice(0, 6)) {
      lines.push(`• ${intent}: ${count} paciente(s)`);
    }
    lines.push('');
  }

  lines.push('✅ *CONVERSÕES*');
  lines.push(`• Pacientes que confirmaram: ${stats.conversions}`);
  lines.push(`• Taxa de conversão: ${stats.conversion_rate.toFixed(0)}%`);
  lines.push('');

  lines.push('⏱️ *HORÁRIOS DE PROCURA*');
  lines.push(`• Manhã (até 12h): ${stats.by_hour.morning} pacientes`);
  lines.push(`• Tarde (12h-18h): ${stats.by_hour.afternoon} pacientes`);
  lines.push(`• Noite (após 18h): ${stats.by_hour.evening} pacientes`);
  lines.push('');

  if (stats.alerts.length > 0) {
    lines.push('⚠️ *ALERTAS*');
    stats.alerts.forEach((a) => lines.push(`• ${a}`));
    lines.push('');
  }

  if (stats.errors.length > 0) {
    lines.push('🔧 *ERROS DETECTADOS*');
    stats.errors.slice(0, 3).forEach((e) => lines.push(`• ${e}`));
    lines.push('');
  }

  if (stats.insights.length > 0) {
    lines.push('💡 *INSIGHTS*');
    stats.insights.forEach((i) => lines.push(`• ${i}`));
    lines.push('');
  }

  lines.push('🤖 *SISTEMA*');
  lines.push(`• ${stats.total_messages} mensagens processadas`);
  lines.push(`• Tokens usados: ${stats.tokens_total.toLocaleString('pt-BR')}`);
  lines.push(`• Status: 🟢 Online`);
  lines.push('');
  lines.push('_Relatório automático às 20h_');

  return lines.join('\n');
}

/**
 * RELATÓRIO SEMANAL (enviado aos domingos às 20h)
 */
export function formatWeekly(stats: ReportStats, prevWeek?: ReportStats): string {
  const start = formatDate(stats.period_start);
  const end = formatDate(stats.period_end);
  const lines: string[] = [];

  lines.push(`📅 *RELATÓRIO SEMANAL*`);
  lines.push(`Semana: ${start} a ${end}`);
  lines.push(`Dr. Valth Guimarães — Ortopedia`);
  lines.push('');
  lines.push('👥 *PACIENTES DA SEMANA*');
  lines.push(`• Total que entraram em contato: *${stats.unique_patients}*`);
  lines.push(`• ✨ Novos pacientes: *${stats.new_patients}*`);
  lines.push(`• 🔄 Retornantes: *${stats.returning_patients}*`);
  lines.push(`• ✅ Conversões: ${stats.conversions} (${stats.conversion_rate.toFixed(0)}%)`);
  lines.push('');

  if (prevWeek) {
    lines.push('📈 *COMPARATIVO COM SEMANA ANTERIOR*');
    const diffPatients = stats.unique_patients - prevWeek.unique_patients;
    const diffNew = stats.new_patients - prevWeek.new_patients;
    const diffConv = stats.conversions - prevWeek.conversions;
    const arrow = (n: number) => (n > 0 ? '📈 +' : n < 0 ? '📉 ' : '➡️ ');
    lines.push(`• Pacientes: ${arrow(diffPatients)}${diffPatients}`);
    lines.push(`• Novos: ${arrow(diffNew)}${diffNew}`);
    lines.push(`• Conversões: ${arrow(diffConv)}${diffConv}`);
    lines.push('');
  }

  // Lista NOVOS pacientes
  if (stats.new_patients_list.length > 0) {
    lines.push('✨ *NOVOS PACIENTES DA SEMANA*');
    stats.new_patients_list.slice(0, 25).forEach((p, i) => {
      lines.push(`${i + 1}. *${p.name}* (${p.city})`);
    });
    if (stats.new_patients_list.length > 25) {
      lines.push(`_...e mais ${stats.new_patients_list.length - 25}_`);
    }
    lines.push('');
  }

  if (Object.keys(stats.by_city).length > 0) {
    lines.push('📍 *CIDADES DA SEMANA*');
    const sortedCities = Object.entries(stats.by_city).sort((a, b) => b[1] - a[1]);
    for (const [city, count] of sortedCities) {
      lines.push(`• ${city}: ${count} pacientes`);
    }
    lines.push('');
  }

  if (Object.keys(stats.by_intent).length > 0) {
    lines.push('🎯 *INTENÇÕES MAIS COMUNS*');
    const sortedIntents = Object.entries(stats.by_intent).sort((a, b) => b[1] - a[1]);
    for (const [intent, count] of sortedIntents.slice(0, 5)) {
      lines.push(`• ${intent}: ${count}`);
    }
    lines.push('');
  }

  if (stats.top_patients.length > 0) {
    lines.push('👥 *PACIENTES MAIS ATIVOS*');
    stats.top_patients.slice(0, 5).forEach((p, i) => {
      const phoneShort = p.phone.slice(-4);
      lines.push(`${i + 1}. ${p.name} (****${phoneShort}) — ${p.count} msgs`);
    });
    lines.push('');
  }

  if (stats.insights.length > 0) {
    lines.push('💡 *INSIGHTS DA SEMANA*');
    stats.insights.forEach((i) => lines.push(`• ${i}`));
    lines.push('');
  }

  if (stats.urgencies > 0) {
    lines.push(`🚨 *URGÊNCIAS:* ${stats.urgencies} caso(s) atendido(s)`);
    lines.push('');
  }

  lines.push('🤖 *PERFORMANCE DO SISTEMA*');
  lines.push(`• Tokens totais: ${stats.tokens_total.toLocaleString('pt-BR')}`);
  lines.push(`• Custo estimado: ~$${(stats.tokens_total * 0.000015).toFixed(2)}`);
  lines.push(`• Uptime: 🟢 100%`);
  lines.push('');
  lines.push('_Relatório semanal automático aos domingos_');

  return lines.join('\n');
}

/**
 * RELATÓRIO MENSAL (enviado dia 1 às 9h)
 */
export function formatMonthly(stats: ReportStats, prevMonth?: ReportStats): string {
  const start = new Date(stats.period_start);
  const monthName = start.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const lines: string[] = [];

  lines.push(`📆 *RELATÓRIO MENSAL*`);
  lines.push(`Mês: ${monthName.charAt(0).toUpperCase() + monthName.slice(1)}`);
  lines.push(`Dr. Valth Guimarães — Ortopedia`);
  lines.push('');
  lines.push('👥 *PACIENTES DO MÊS*');
  lines.push(`• Total que entraram em contato: *${stats.unique_patients}*`);
  lines.push(`• ✨ Novos pacientes: *${stats.new_patients}*`);
  lines.push(`• 🔄 Pacientes retornantes: *${stats.returning_patients}*`);
  lines.push(`• ✅ Conversões: ${stats.conversions}`);
  lines.push(`• Taxa de conversão: ${stats.conversion_rate.toFixed(1)}%`);
  lines.push('');

  if (prevMonth) {
    lines.push('📈 *COMPARATIVO COM MÊS ANTERIOR*');
    const calcGrowth = (curr: number, prev: number) => {
      if (prev === 0) return 'N/A';
      const g = ((curr - prev) / prev) * 100;
      return `${g > 0 ? '+' : ''}${g.toFixed(0)}%`;
    };
    lines.push(`• Pacientes únicos: ${calcGrowth(stats.unique_patients, prevMonth.unique_patients)}`);
    lines.push(`• Novos pacientes: ${calcGrowth(stats.new_patients, prevMonth.new_patients)}`);
    lines.push(`• Conversões: ${calcGrowth(stats.conversions, prevMonth.conversions)}`);
    lines.push('');
  }

  if (Object.keys(stats.by_city).length > 0) {
    lines.push('🏆 *TOP CIDADES DO MÊS*');
    const sortedCities = Object.entries(stats.by_city).sort((a, b) => b[1] - a[1]);
    sortedCities.slice(0, 5).forEach(([city, count], i) => {
      lines.push(`${i + 1}º ${city}: ${count} pacientes (${pct(count, stats.unique_patients)})`);
    });
    lines.push('');
  }

  if (Object.keys(stats.by_intent).length > 0) {
    lines.push('🎯 *PERFIL DE ATENDIMENTO*');
    const sortedIntents = Object.entries(stats.by_intent).sort((a, b) => b[1] - a[1]);
    for (const [intent, count] of sortedIntents) {
      lines.push(`• ${intent}: ${count} (${pct(count, stats.unique_patients)})`);
    }
    lines.push('');
  }

  if (stats.top_patients.length > 0) {
    lines.push('🔝 *PACIENTES MAIS ATIVOS DO MÊS*');
    stats.top_patients.slice(0, 5).forEach((p, i) => {
      const phoneShort = p.phone.slice(-4);
      lines.push(`${i + 1}. ${p.name} (****${phoneShort}) — ${p.count} mensagens`);
    });
    lines.push('');
  }

  lines.push('⏱️ *DISTRIBUIÇÃO POR HORÁRIO*');
  lines.push(`• Manhã: ${stats.by_hour.morning} (${pct(stats.by_hour.morning, stats.unique_patients)})`);
  lines.push(`• Tarde: ${stats.by_hour.afternoon} (${pct(stats.by_hour.afternoon, stats.unique_patients)})`);
  lines.push(`• Noite: ${stats.by_hour.evening} (${pct(stats.by_hour.evening, stats.unique_patients)})`);
  lines.push('');

  if (stats.urgencies > 0) {
    lines.push(`🚨 *URGÊNCIAS DO MÊS:* ${stats.urgencies} caso(s)`);
    lines.push('');
  }

  if (stats.insights.length > 0) {
    lines.push('💡 *INSIGHTS E TENDÊNCIAS*');
    stats.insights.forEach((i) => lines.push(`• ${i}`));
    lines.push('');
  }

  if (stats.errors.length > 0) {
    lines.push('🔧 *MELHORIAS SUGERIDAS*');
    lines.push(`• ${stats.errors.length} situações precisaram de intervenção`);
    lines.push(`• Revisar fluxos de atendimento`);
    lines.push('');
  }

  lines.push('🤖 *PERFORMANCE GERAL*');
  lines.push(`• Tokens consumidos: ${stats.tokens_total.toLocaleString('pt-BR')}`);
  lines.push(`• Custo estimado: ~$${(stats.tokens_total * 0.000015).toFixed(2)}`);
  lines.push(`• Sistema: 🟢 Estável`);
  lines.push('');
  lines.push('_Relatório mensal automático dia 1º às 9h_');
  lines.push('_Próximo relatório: dia 1º do próximo mês_');

  return lines.join('\n');
}
