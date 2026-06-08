/**
 * Analytics — análise das conversas do SQLite
 * Gera estatísticas para os relatórios diários/semanais/mensais
 */

// @ts-ignore
import { DatabaseSync } from 'node:sqlite';
import path from 'path';

const DB_PATH = process.env.SQLITE_PATH || path.join(process.cwd(), 'data', 'conversations.db');

export interface Conversation {
  id: number;
  phone: string;
  patient_name: string;
  user_message: string;
  assistant_reply: string;
  tokens_input: number;
  tokens_output: number;
  created_at: string;
}

export interface ReportStats {
  period_start: string;
  period_end: string;
  total_contacts: number;
  unique_patients: number;
  new_patients: number;
  returning_patients: number;
  by_city: { [city: string]: number };
  by_intent: { [intent: string]: number };
  conversions: number;
  conversion_rate: number;
  by_hour: { morning: number; afternoon: number; evening: number };
  urgencies: number;
  human_intervention_needed: number;
  errors: string[];
  tokens_total: number;
  avg_response_chars: number;
  top_patients: Array<{ phone: string; name: string; count: number }>;
  alerts: string[];
  insights: string[];
}

/**
 * Detecta cidade pelo DDD ou pelo conteúdo da mensagem
 */
function detectCity(phone: string, message: string, reply: string): string {
  const ddd = phone.replace(/\D/g, '').slice(2, 4);
  const text = (message + ' ' + reply).toLowerCase();

  // Por DDD
  if (ddd === '83') return 'Campina Grande';
  if (ddd === '81' || ddd === '87') {
    // DDD 81 pode ser Caruaru ou Palmares
    if (text.includes('palmares')) return 'Palmares';
    if (text.includes('caruaru')) return 'Caruaru';
    return 'Caruaru/Palmares';
  }
  if (ddd === '82') return 'Palmares (Alagoas)';

  // Por conteúdo
  if (text.includes('campina grande') || text.includes('cto') || text.includes('artro')) {
    return 'Campina Grande';
  }
  if (text.includes('caruaru') || text.includes('unimagem') || text.includes('instituto pernambuco')) {
    return 'Caruaru';
  }
  if (text.includes('palmares') || text.includes('mário bento')) {
    return 'Palmares';
  }
  return 'Outros';
}

/**
 * Detecta intenção da mensagem
 */
function detectIntent(message: string): string {
  const msg = message.toLowerCase();

  // Urgência
  if (
    /dor (forte|intensa|insuportável|muito forte)/.test(msg) ||
    /urgente|urgência|emergência|socorro/.test(msg) ||
    /não consigo (andar|mexer|levantar)/.test(msg) ||
    /sangrando|sangue|fratura|quebrou|caiu/.test(msg)
  ) {
    return 'Urgência';
  }

  // Agendamento
  if (/agendar|marcar|remarcar|consulta|disponibilidade|vaga|hoje|amanhã|próxima/.test(msg)) {
    return 'Agendamento';
  }

  // Preço/Comercial
  if (/preço|valor|custa|quanto|convênio|particular|pagamento|dinheiro|reais/.test(msg)) {
    return 'Preço/Convênio';
  }

  // Pós-operatório
  if (/cirurgia|operação|operei|pós-op|pós operatório|recuperação|treinar/.test(msg)) {
    return 'Pós-operatório';
  }

  // Horários/FAQ
  if (/horário|funcionamento|endereço|onde fica|localização|aberto/.test(msg)) {
    return 'FAQ/Horários';
  }

  // Saudação/Novo paciente
  if (/^(oi|olá|ola|bom dia|boa tarde|boa noite|hello)/.test(msg.trim()) && msg.length < 50) {
    return 'Saudação/Acolhimento';
  }

  return 'Outros';
}

/**
 * Detecta se houve conversão (paciente confirmou agendamento)
 */
function detectConversion(conversations: Conversation[]): boolean {
  // Olha as últimas 3 mensagens da conversa do paciente
  const lastMessages = conversations.slice(-3).map((c) => c.user_message.toLowerCase()).join(' ');
  return (
    /confirmo|confirmado|confirma|pode marcar|pode agendar|fechado|combinado|topa|aceito|fico com/.test(lastMessages) ||
    /sim, quero|sim quero|isso mesmo|vou (estar|ir)|combinou|tá bom/.test(lastMessages)
  );
}

/**
 * Detecta erros ou intervenção humana necessária
 */
function detectIssues(conversations: Conversation[]): { errors: string[]; needsIntervention: boolean } {
  const errors: string[] = [];
  let needsIntervention = false;

  for (const conv of conversations) {
    const reply = conv.assistant_reply.toLowerCase();
    const msg = conv.user_message.toLowerCase();

    // Bot falhou
    if (reply.includes('não consigo processar') || reply.includes('ligue para a clínica')) {
      errors.push(`Bot falhou: ${conv.user_message.slice(0, 60)}`);
      needsIntervention = true;
    }

    // Paciente reclamou
    if (/reclama|reclamação|problema|insatisfeito|chateado|atendimento ruim/.test(msg)) {
      errors.push(`Possível reclamação: ${conv.user_message.slice(0, 60)}`);
      needsIntervention = true;
    }

    // Pediu humano
    if (/falar com (atendente|humano|pessoa|secretária|alguém)/.test(msg)) {
      needsIntervention = true;
    }
  }

  return { errors: [...new Set(errors)].slice(0, 5), needsIntervention };
}

/**
 * Gera estatísticas para um período
 */
export function generateStats(startDate: Date, endDate: Date): ReportStats {
  const db = new DatabaseSync(DB_PATH);

  const conversations = db
    .prepare(
      `SELECT * FROM conversations
       WHERE created_at >= ? AND created_at < ?
       ORDER BY created_at ASC`
    )
    .all(startDate.toISOString(), endDate.toISOString()) as unknown as Conversation[];

  // Total e únicos
  const uniquePhones = new Set(conversations.map((c) => c.phone));

  // Identificar novos vs retornantes (com base no histórico ANTERIOR ao período)
  const previousPhones = new Set(
    (db
      .prepare(`SELECT DISTINCT phone FROM conversations WHERE created_at < ?`)
      .all(startDate.toISOString()) as { phone: string }[]).map((r) => r.phone)
  );
  const newPatients = [...uniquePhones].filter((p) => !previousPhones.has(p));
  const returningPatients = [...uniquePhones].filter((p) => previousPhones.has(p));

  // Por cidade
  const byCity: { [k: string]: Set<string> } = {};
  // Por intenção
  const byIntent: { [k: string]: number } = {};
  // Por hora
  const byHour = { morning: 0, afternoon: 0, evening: 0 };
  // Tokens
  let tokensTotal = 0;
  let replyCharsTotal = 0;
  // Urgências
  let urgencies = 0;

  // Agrupar conversas por phone para detectar conversões
  const byPhone: { [k: string]: Conversation[] } = {};

  for (const conv of conversations) {
    const city = detectCity(conv.phone, conv.user_message, conv.assistant_reply);
    if (!byCity[city]) byCity[city] = new Set();
    byCity[city].add(conv.phone);

    const intent = detectIntent(conv.user_message);
    byIntent[intent] = (byIntent[intent] || 0) + 1;

    if (intent === 'Urgência') urgencies++;

    const hour = new Date(conv.created_at).getHours();
    if (hour < 12) byHour.morning++;
    else if (hour < 18) byHour.afternoon++;
    else byHour.evening++;

    tokensTotal += (conv.tokens_input || 0) + (conv.tokens_output || 0);
    replyCharsTotal += (conv.assistant_reply || '').length;

    if (!byPhone[conv.phone]) byPhone[conv.phone] = [];
    byPhone[conv.phone].push(conv);
  }

  // Conversões: pacientes únicos que confirmaram
  let conversions = 0;
  for (const phone in byPhone) {
    if (detectConversion(byPhone[phone])) conversions++;
  }

  // Top pacientes (mais mensagens)
  const topPatients = Object.entries(byPhone)
    .map(([phone, convs]) => ({
      phone,
      name: convs[convs.length - 1].patient_name || 'Sem nome',
      count: convs.length,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Issues
  const { errors, needsIntervention } = detectIssues(conversations);

  // Alertas
  const alerts: string[] = [];
  if (urgencies > 0) alerts.push(`${urgencies} paciente(s) com urgência atendido(s)`);
  if (needsIntervention) alerts.push('Algumas conversas precisaram de intervenção humana');
  if (errors.length > 0) alerts.push(`${errors.length} erro(s) técnico(s) detectado(s)`);
  if (uniquePhones.size === 0) alerts.push('Nenhum contato hoje - verificar se o sistema está online');

  // Insights
  const insights: string[] = [];
  const topCity = Object.entries(byCity)
    .sort((a, b) => b[1].size - a[1].size)[0];
  if (topCity) insights.push(`Cidade mais procurada: ${topCity[0]} (${topCity[1].size} pacientes)`);

  const peakHour = Object.entries(byHour).sort((a, b) => b[1] - a[1])[0];
  if (peakHour && peakHour[1] > 0) {
    const labels: { [k: string]: string } = { morning: 'manhã', afternoon: 'tarde', evening: 'noite' };
    insights.push(`Pico de procura: ${labels[peakHour[0]]} (${peakHour[1]} contatos)`);
  }

  const conversionRate = uniquePhones.size > 0 ? (conversions / uniquePhones.size) * 100 : 0;
  if (conversionRate > 50) insights.push(`Excelente taxa de conversão: ${conversionRate.toFixed(0)}%`);
  else if (conversionRate < 20 && uniquePhones.size > 5) insights.push(`Taxa de conversão baixa: ${conversionRate.toFixed(0)}% - considerar revisar prompts`);

  if (newPatients.length > returningPatients.length * 2) {
    insights.push('Muitos pacientes NOVOS - crescimento orgânico');
  }

  db.close();

  // Transformar Sets em counts
  const byCityCount: { [k: string]: number } = {};
  for (const k in byCity) byCityCount[k] = byCity[k].size;

  return {
    period_start: startDate.toISOString(),
    period_end: endDate.toISOString(),
    total_contacts: conversations.length,
    unique_patients: uniquePhones.size,
    new_patients: newPatients.length,
    returning_patients: returningPatients.length,
    by_city: byCityCount,
    by_intent: byIntent,
    conversions,
    conversion_rate: conversionRate,
    by_hour: byHour,
    urgencies,
    human_intervention_needed: errors.filter((e) => e.includes('reclama') || e.includes('falar com')).length,
    errors,
    tokens_total: tokensTotal,
    avg_response_chars: conversations.length > 0 ? Math.round(replyCharsTotal / conversations.length) : 0,
    top_patients: topPatients,
    alerts,
    insights,
  };
}
