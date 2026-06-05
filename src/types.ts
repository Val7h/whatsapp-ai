// ── Mensagem de conversa (formato Claude API) ──────────────────────────────
export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

// ── Payload recebido do n8n via POST /webhook ──────────────────────────────
export interface WebhookPayload {
  phone: string;
  name: string;
  message: string;
  instance?: string; // nome da instância Evolution API: cto-caruaru | cto-campina | cto-geral
}

// ── Resposta que o backend retorna ao n8n ──────────────────────────────────
export interface WebhookResponse {
  reply: string;
}

// ── Resposta do GET /health ────────────────────────────────────────────────
export interface HealthResponse {
  status: 'ok';
  timestamp: string;
  redis: 'connected' | 'in-memory';
  model: string;
}

// ── Dados para salvar no SQLite ────────────────────────────────────────────
export interface ConversationLog {
  phone: string;
  patient_name: string | null;
  user_message: string;
  assistant_reply: string;
  tokens_input: number | null;
  tokens_output: number | null;
}

// ── Resposta interna do serviço Claude ────────────────────────────────────
export interface ClaudeResponse {
  reply: string;
  tokens_input: number;
  tokens_output: number;
}

// ── Rate limiting ─────────────────────────────────────────────────────────
export type RateLimitMap = Map<string, number[]>;
