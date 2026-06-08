/**
 * Analytics — análise das conversas do SQLite
 * Gera estatísticas para os relatórios diários/semanais/mensais
 */

// @ts-ignore
import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { extractDDD, cityFromDDD, isValidBrazilianDDD, isValidPatient } from '../services/phone.js';

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
  total_messages: number;
  unique_patients: number;
  new_patients: number;
  returning_patients: number;
  new_patients_list: Array<{ name: string; phone: string; city: string; first_message: string }>;
  by_city: { [city: string]: number }; // pacientes únicos por cidade
  by_intent: { [intent: string]: number }; // pacientes únicos por intenção
  conversions: number;
  conversion_rate: number;
  by_hour: { morning: number; afternoon: number; evening: number }; // pacientes únicos
  urgencies: number; // pacientes únicos com urgência
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
  const ddd = extractDDD(phone);
  const text = (message + ' ' + reply).toLowerCase();

  // Por conteúdo primeiro (mais preciso quando paciente menciona)
  if (text.includes('campina grande') || text.includes('cto ') || text.includes('artro')) {
    return 'Campina Grande (PB)';
  }
  if (text.includes('caruaru') || text.includes('unimagem') || text.includes('instituto pernambuco')) {
    return 'Caruaru (PE)';
  }
  if (text.includes('palmares') || text.includes('mário bento')) {
    return 'Palmares (PE)';
  }

  // LID - WhatsApp Business sem DDD
  if (ddd === 'lid') return cityFromDDD('lid', message);

  // Por DDD válido brasileiro
  if (ddd !== 'invalid' && isValidBrazilianDDD(ddd)) {
    return cityFromDDD(ddd, message);
  }

  return 'Não identificado';
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
 * Gera estatísticas para um período — FOCO EM PACIENTES ÚNICOS
 */
export function generateStats(startDate: Date, endDate: Date): ReportStats {
  const db = new DatabaseSync(DB_PATH);

  const conversations = db
    .prepare(
      `SELECT * FROM conversations
       WHERE created_at >= ? AND created_at < ?
         AND (is_test IS NULL OR is_test = 0)
       ORDER BY created_at ASC`
    )
    .all(startDate.toISOString(), endDate.toISOString()) as unknown as Conversation[];

  // Agrupar conversas por phone (cada paciente único)
  const byPhone: { [k: string]: Conversation[] } = {};
  for (const conv of conversations) {
    if (!byPhone[conv.phone]) byPhone[conv.phone] = [];
    byPhone[conv.phone].push(conv);
  }

  const uniquePhones = Object.keys(byPhone);

  // Identificar NOVOS pacientes (que nunca tiveram conversa antes do período)
  // Ignorar mensagens marcadas como teste
  const previousPhones = new Set(
    (db
      .prepare(`SELECT DISTINCT phone FROM conversations
                WHERE created_at < ?
                  AND (is_test IS NULL OR is_test = 0)`)
      .all(startDate.toISOString()) as { phone: string }[]).map((r) => r.phone)
  );

  const newPatientPhones = uniquePhones.filter((p) => !previousPhones.has(p));
  const returningPhones = uniquePhones.filter((p) => previousPhones.has(p));

  // Listar NOVOS pacientes com detalhes
  const newPatientsList = newPatientPhones.map((phone) => {
    const convs = byPhone[phone];
    const firstConv = convs[0];
    const lastConv = convs[convs.length - 1];
    return {
      name: lastConv.patient_name || firstConv.patient_name || 'Sem nome',
      phone: phone.replace(/@.*/, ''),
      city: detectCity(phone, firstConv.user_message, firstConv.assistant_reply),
      first_message: firstConv.user_message.slice(0, 80),
    };
  });

  // ── ESTATÍSTICAS POR PACIENTE ÚNICO (não por mensagem) ──
  const patientsByCity: { [k: string]: Set<string> } = {};
  const patientsByIntent: { [k: string]: Set<string> } = {};
  const patientsByHour = { morning: new Set<string>(), afternoon: new Set<string>(), evening: new Set<string>() };
  const urgentPatients = new Set<string>();

  let tokensTotal = 0;
  let replyCharsTotal = 0;

  for (const conv of conversations) {
    const phone = conv.phone;

    const city = detectCity(phone, conv.user_message, conv.assistant_reply);
    if (!patientsByCity[city]) patientsByCity[city] = new Set();
    patientsByCity[city].add(phone);

    const intent = detectIntent(conv.user_message);
    if (!patientsByIntent[intent]) patientsByIntent[intent] = new Set();
    patientsByIntent[intent].add(phone);

    if (intent === 'Urgência') urgentPatients.add(phone);

    const hour = new Date(conv.created_at).getHours();
    if (hour < 12) patientsByHour.morning.add(phone);
    else if (hour < 18) patientsByHour.afternoon.add(phone);
    else patientsByHour.evening.add(phone);

    tokensTotal += (conv.tokens_input || 0) + (conv.tokens_output || 0);
    replyCharsTotal += (conv.assistant_reply || '').length;
  }

  // Conversões: pacientes únicos que confirmaram
  let conversions = 0;
  for (const phone in byPhone) {
    if (detectConversion(byPhone[phone])) conversions++;
  }

  // Top pacientes mais ativos (por número de mensagens)
  const topPatients = Object.entries(byPhone)
    .map(([phone, convs]) => ({
      phone: phone.replace(/@.*/, ''),
      name: convs[convs.length - 1].patient_name || 'Sem nome',
      count: convs.length,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Issues
  const { errors, needsIntervention } = detectIssues(conversations);

  // Alertas
  const alerts: string[] = [];
  if (urgentPatients.size > 0) alerts.push(`${urgentPatients.size} paciente(s) com urgência`);
  if (needsIntervention) alerts.push('Algumas conversas precisaram de intervenção humana');
  if (errors.length > 0) alerts.push(`${errors.length} erro(s) técnico(s) detectado(s)`);
  if (uniquePhones.length === 0) alerts.push('Nenhum paciente hoje - verificar sistema');

  // Insights
  const insights: string[] = [];
  const topCity = Object.entries(patientsByCity)
    .sort((a, b) => b[1].size - a[1].size)[0];
  if (topCity) insights.push(`Cidade mais procurada: ${topCity[0]} (${topCity[1].size} pacientes)`);

  const peakHourEntry = Object.entries(patientsByHour).sort((a, b) => b[1].size - a[1].size)[0];
  if (peakHourEntry && peakHourEntry[1].size > 0) {
    const labels: { [k: string]: string } = { morning: 'manhã', afternoon: 'tarde', evening: 'noite' };
    insights.push(`Pico de procura: ${labels[peakHourEntry[0]]} (${peakHourEntry[1].size} pacientes)`);
  }

  const conversionRate = uniquePhones.length > 0 ? (conversions / uniquePhones.length) * 100 : 0;
  if (conversionRate > 50) insights.push(`Excelente taxa de conversão: ${conversionRate.toFixed(0)}%`);
  else if (conversionRate < 20 && uniquePhones.length > 5)
    insights.push(`Taxa de conversão baixa: ${conversionRate.toFixed(0)}% — revisar prompts`);

  if (newPatientPhones.length > returningPhones.length * 2 && newPatientPhones.length > 3) {
    insights.push('Muitos pacientes NOVOS - crescimento orgânico forte');
  }

  if (newPatientPhones.length === 0 && uniquePhones.length > 0) {
    insights.push('Nenhum paciente novo no período - apenas retornantes');
  }

  db.close();

  // Transformar Sets em counts
  const byCityCount: { [k: string]: number } = {};
  for (const k in patientsByCity) byCityCount[k] = patientsByCity[k].size;

  const byIntentCount: { [k: string]: number } = {};
  for (const k in patientsByIntent) byIntentCount[k] = patientsByIntent[k].size;

  return {
    period_start: startDate.toISOString(),
    period_end: endDate.toISOString(),
    total_messages: conversations.length,
    unique_patients: uniquePhones.length,
    new_patients: newPatientPhones.length,
    returning_patients: returningPhones.length,
    new_patients_list: newPatientsList,
    by_city: byCityCount,
    by_intent: byIntentCount,
    conversions,
    conversion_rate: conversionRate,
    by_hour: {
      morning: patientsByHour.morning.size,
      afternoon: patientsByHour.afternoon.size,
      evening: patientsByHour.evening.size,
    },
    urgencies: urgentPatients.size,
    human_intervention_needed: errors.filter((e) => e.includes('reclama') || e.includes('falar com')).length,
    errors,
    tokens_total: tokensTotal,
    avg_response_chars: conversations.length > 0 ? Math.round(replyCharsTotal / conversations.length) : 0,
    top_patients: topPatients,
    alerts,
    insights,
  };
}
