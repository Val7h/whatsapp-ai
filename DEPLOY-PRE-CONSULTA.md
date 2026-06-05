# Deploy — Formulário Pré-Consulta CTO

## 1. Variáveis de ambiente no VPS

Adicione ao `.env` do container do servidor (ou via `docker-compose.yml`):

```env
# Segredo compartilhado entre servidor e n8n — string aleatória longa
FORM_SECRET=troque-por-string-aleatoria-de-40-chars

# URL pública do servidor (sem barra final)
FORM_BASE_URL=https://cto.seudominio.com.br

# Webhook do n8n para receber o formulário preenchido
N8N_WEBHOOK_PRE_CONSULTA=http://n8n:5678/webhook/pre-consulta
```

## 2. Variáveis de ambiente no n8n

Em **Settings → Variables** no n8n (ou via UI de env vars do container):

| Variável | Valor |
|---|---|
| `FORM_SECRET` | Mesmo valor do servidor acima |
| `SHEETS_PRE_CONSULTA_ID` | ID do Google Sheets (parte da URL entre `/d/` e `/edit`) |
| `GDRIVE_PASTA_PACIENTES_ID` | ID da pasta raiz no Drive onde ficam os pacientes |
| `EVOLUTION_URL` | `http://cto-evolution:8080` |
| `EVOLUTION_INSTANCE_MEDICO` | `cto-geral` (instância do Dr. Valth) |
| `EVOLUTION_API_KEY` | `cto-evolution-key-2024` |
| `MEDICO_TELEFONE` | `5581999179609` |

## 3. Google Sheets — cabeçalho da aba

Crie uma planilha nova (ou aba nova) chamada **Pré-Consulta** com estas colunas na linha 1, nessa ordem:

```
timestamp | agendamento_id | token | status | nome | telefone |
nascimento | cpf | cidade | bairro | profissao | estado_civil | filhos |
doencas_cronicas | medicacoes | alergias | cirurgias_anteriores |
tabagismo | alcool | regiao_corpo | descricao | tempo_sintomas |
mecanismo | eva | piora | melhora | tratamento_anterior |
uso_analgesicos | exames_urls | forma_pagamento | plano_saude | pdf_drive_url
```

## 4. Google Drive

Crie uma pasta chamada `pacientes` no Drive e copie o ID dela
(URL: `drive.google.com/drive/folders/SEU_ID_AQUI`).

Coloque esse ID na variável `GDRIVE_PASTA_PACIENTES_ID`.

## 5. Importar workflow no n8n

1. Acesse `http://SEU_VPS:5678`
2. Menu lateral → **Workflows** → botão **Import**
3. Faça upload de `n8n-workflow-pre-consulta.json`
4. Configure as credenciais nos nodes:
   - **Salvar no Google Sheets** → credencial Google OAuth
   - **Criar pasta paciente** e **Upload PDF Drive** → mesma credencial Google OAuth
   - **Atualizar Calendar** → credencial Google Calendar OAuth
5. **⚠️ NÃO mexa no workflow `LYDoJt0yKRNS2kE9` (whatsapp-cto)**
6. Ative o novo workflow pelo toggle no canto superior direito

## 6. Gerar token no n8n (agendamento confirmado)

Adicione este Code node no workflow `LYDoJt0yKRNS2kE9` **após** a confirmação de agendamento,
logo antes do node que envia a mensagem de confirmação:

```javascript
const crypto = require('crypto');

const agendamento_id = $json.event_id; // ID do evento Google Calendar
const exp = Date.now() + (72 * 60 * 60 * 1000); // 72h

const token = crypto
  .createHmac('sha256', $env.FORM_SECRET)
  .update(`${agendamento_id}:${exp}`)
  .digest('hex');

const url = `https://cto.seudominio.com.br/pre-consulta?` +
  `nome=${encodeURIComponent($json.paciente_nome)}&` +
  `tel=${$json.paciente_telefone}&` +
  `data=${encodeURIComponent($json.event_start)}&` +
  `motivo=${encodeURIComponent($json.event_summary)}&` +
  `aid=${agendamento_id}&` +
  `exp=${exp}&` +
  `token=${token}`;

return [{ json: { ...$json, form_url: url } }];
```

Depois use `{{ $json.form_url }}` na mensagem de confirmação enviada ao paciente.

## 7. Testar sem n8n (smoke test)

```bash
# Gera token válido para teste (substitua FORM_SECRET)
node -e "
const crypto = require('crypto');
const aid = 'test-123';
const exp = Date.now() + 3600000;
const tok = crypto.createHmac('sha256','troque-por-string-aleatoria-de-40-chars').update(aid+':'+exp).digest('hex');
console.log('URL:', '/pre-consulta?nome=João+Teste&tel=5583999990000&data=2026-06-10T10:00:00&aid='+aid+'&exp='+exp+'&token='+tok);
"
```

Abra a URL gerada no navegador — o formulário deve carregar com os dados pré-preenchidos.
