# WhatsApp AI — Assistente Ortopédico (Clínica CTO)

Backend Node.js/TypeScript que recebe mensagens de pacientes via WhatsApp (integrado ao **n8n**), processa com a **API do Claude** e devolve uma resposta clínica contextualizada.

---

## Pré-requisitos

- **Node.js 20+**
- **Redis** (opcional, mas recomendado — fallback em memória disponível)
- **Conta Anthropic** com API key

---

## Instalação

```bash
npm install
cp .env.example .env
# Edite o .env com sua ANTHROPIC_API_KEY e demais configurações
```

### Variáveis de ambiente (`.env`)

| Variável | Padrão | Descrição |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | **Obrigatório.** Sua chave da Anthropic |
| `PORT` | `3000` | Porta do servidor |
| `REDIS_URL` | — | URL do Redis (ex: `redis://localhost:6379`) |
| `CLAUDE_MODEL` | `claude-sonnet-4-20250514` | Modelo Claude a usar |
| `MAX_HISTORY_TURNS` | `20` | Turnos máximos por conversa (sliding window) |
| `LOG_LEVEL` | `info` | Nível de log (`debug`, `info`, `warn`, `error`) |
| `CLINIC_PHONE` | — | Telefone da clínica exibido nas respostas |
| `WEBHOOK_SECRET` | — | Segredo compartilhado com o n8n (recomendado) |
| `ALLOWED_PHONES` | — | Lista de números permitidos, separados por vírgula (testes) |

---

## Rodando

### Desenvolvimento (com hot-reload)
```bash
npm run dev
```

### Build para produção
```bash
npm run build
# Gera a pasta dist/
```

### Produção
```bash
node dist/index.js
```

---

## Rotas disponíveis

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/health` | Status do serviço |
| `POST` | `/webhook` | Recebe mensagem do n8n e retorna resposta |
| `POST` | `/webhook/clear/:phone` | Limpa histórico de um número (admin) |

### POST /webhook — Payload
```json
{
  "phone": "5583999999999",
  "name": "João Silva",
  "message": "Estou com dor no joelho há 3 dias"
}
```

### POST /webhook — Resposta
```json
{
  "reply": "Olá João! Entendo que você está com dor no joelho há 3 dias..."
}
```

### Header de segurança (recomendado)
```
x-webhook-secret: seu-segredo-aqui
```

---

## Como conectar ao n8n

### Fluxo básico (3 nodes)

**Node 1 — WhatsApp Trigger** (Evolution API ou WhatsApp Business)
- Configura o trigger para receber mensagens de entrada

**Node 2 — HTTP Request**
- Method: `POST`
- URL: `http://SEU_SERVIDOR:3000/webhook`
- Headers: `x-webhook-secret: {{ $env.WEBHOOK_SECRET }}`
- Body (JSON):
```json
{
  "phone": "{{ $json.from }}",
  "name": "{{ $json.pushName }}",
  "message": "{{ $json.body }}"
}
```

**Node 3 — WhatsApp Send** (Evolution API)
- Mensagem: `{{ $json.reply }}`
- Para: `{{ $node["Node 1"].json.from }}`

---

## Deploy em VPS (Ubuntu + PM2)

```bash
# Instalar dependências e compilar
npm install
npm run build

# Iniciar com PM2
pm2 start dist/index.js --name whatsapp-ai
pm2 save
pm2 startup
```

---

## Funcionalidades de segurança

- **Webhook Secret** — valida header `x-webhook-secret` em cada requisição
- **Rate limiting** — máximo de 10 mensagens/minuto por número de telefone
- **Whitelist** — restringe acesso a números específicos durante testes (`ALLOWED_PHONES`)
- **Detecção de urgência** — palavras-chave como "fratura", "sangramento", "emergência" disparam resposta imediata de alerta PS sem chamar o Claude

## Memória e persistência

- **Redis** — histórico por número com TTL de 48h de inatividade
- **Fallback em memória** — Map em memória se Redis não estiver disponível
- **Sliding window** — mantém no máximo 20 turnos (40 mensagens) por número
- **SQLite** — log permanente de todas as conversas em `data/conversations.db`
- **Winston logs** — `logs/combined.log` e `logs/error.log`

---

## Estrutura do projeto

```
whatsapp-ai/
├── src/
│   ├── index.ts              # Entry point
│   ├── types.ts              # Tipos TypeScript
│   ├── routes/
│   │   ├── webhook.ts        # POST /webhook
│   │   └── health.ts         # GET /health
│   ├── services/
│   │   ├── claude.ts         # Integração Anthropic SDK
│   │   ├── memory.ts         # Redis + fallback em memória
│   │   └── logger.ts         # Winston logger
│   ├── db/
│   │   └── sqlite.ts         # Banco SQLite (logs)
│   └── prompts/
│       └── system.ts         # System prompt da Clínica CTO
├── data/                     # conversations.db (gerado em runtime)
├── logs/                     # Arquivos de log (gerado em runtime)
├── dist/                     # Build compilado
├── .env.example
├── package.json
└── tsconfig.json
```
