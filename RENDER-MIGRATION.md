# 🚀 GUIA DE MIGRAÇÃO RENDER

**Status:** Pronto para implementação  
**Data:** 2026-06-05  
**Custo Estimado:** $14/mês (vs $480 AWS)

---

## ✅ FASE 1: SETUP RENDER (Dia 1)

### 1.1 Criar conta Render
```
https://render.com/register
Login com GitHub recomendado
```

### 1.2 Criar 3 serviços

#### **A) Web Service — Node.js**
```
Name: whatsapp-ai-prod
Runtime: Node.js
Repository: (seu repo GitHub)
Branch: main

Build Command: npm install && npm run build
Start Command: node dist/index.js

Plan: Free (ou Paid $7/mês se quiser 24/7)

Environment Variables:
  NODE_ENV=production
  LOG_LEVEL=info
  ANTHROPIC_API_KEY=sk-ant-api03-...
  WEBHOOK_SECRET=seu-secret-aqui
  CLAUDE_MODEL=claude-sonnet-4-20250514
  MAX_HISTORY_TURNS=20
  CLINIC_PHONE=(83) 9999-9999
  
(DATABASE_URL e REDIS_URL serão preenchidos depois)
```

**Copiar URL fornecida:**
```
https://whatsapp-ai-prod.onrender.com
```

#### **B) PostgreSQL**
```
Name: whatsapp-ai-pg
Plan: Free (ou Starter $7/mês se quiser +256MB)
Region: São Paulo (sa-1)

Username: whatsapp_admin
Password: (Render gera automaticamente)
Database: whatsapp_ai
```

**Copiar URL fornecida:**
```
DATABASE_URL=postgresql://whatsapp_admin:PASSWORD@dpg-xxxxx.render.com/whatsapp_ai
```

#### **C) Redis**
```
Name: whatsapp-ai-redis
Plan: Free (0.25GB)
Region: São Paulo (sa-1)
```

**Copiar URL fornecida:**
```
REDIS_URL=redis://default:PASSWORD@dpg-xxxxx.render.com:6379
```

---

## ✅ FASE 2: PREPARAR CÓDIGO LOCAL (Dia 2)

### 2.1 Compilar sem erro
```bash
cd ~/OneDrive/Documents/whatsapp-ai
npm run build
# Deve retornar: ✅ Sem erros de compilação
```

### 2.2 Testar dual-write localmente

**A) Adicionar DATABASE_URL ao .env.local:**
```bash
cp .env .env.local

# Adicionar ao .env.local (para testes):
DATABASE_URL=postgresql://user:pass@localhost:5432/whatsapp_ai_test
# (você pode usar uma instância local de PostgreSQL para teste, ou pular)
```

**B) Testar compile com novo código:**
```bash
npm run build

# Se erro sobre "initPostgreSQL not found":
#   → Rodar: npm run build novamente
```

---

## ✅ FASE 3: CONECTAR RENDER (Dia 3)

### 3.1 Adicionar DATABASE_URL ao Web Service

No dashboard Render, ir para **whatsapp-ai-prod** → **Environment**

Adicionar:
```
DATABASE_URL=postgresql://whatsapp_admin:PASSWORD@dpg-xxxxx.render.com/whatsapp_ai
REDIS_URL=redis://default:PASSWORD@dpg-xxxxx.render.com:6379
```

### 3.2 Deploy automático
```
Render detecta novo commit e redeploy automaticamente
Ou clicar "Manual Deploy" no dashboard
```

Aguardar ~3-5 minutos para build + start

### 3.3 Verificar saúde
```bash
curl https://whatsapp-ai-prod.onrender.com/health
# Deve retornar JSON com status
```

---

## ✅ FASE 4: MIGRAÇÃO DE DADOS (Dia 3-4)

### 4.1 Rodar script de migração localmente

```bash
cd ~/OneDrive/Documents/whatsapp-ai

# Teste primeiro (opcional, com DB local):
DATABASE_URL=postgresql://... npx tsx scripts/migrate-sqlite-to-postgres.ts

# Resultado esperado:
# 🚀 Iniciando migração...
# 📂 Lendo dados do SQLite... ✅ 1234 registros
# 🔗 Conectando ao PostgreSQL... ✅ Conexão OK
# 📤 Inserindo dados... ✅ 100%
# ✔️ Validando dados... ✅ Sem divergências!
```

### 4.2 Ou migração manual no Render (mais seguro)

```bash
# SSH no Render (se precisar)
# Ou usar psql remoto:

psql postgresql://whatsapp_admin:PASSWORD@dpg-xxxxx.render.com/whatsapp_ai \
  -f /caminho/para/export.sql
```

---

## ✅ FASE 5: TESTAR DUAL-WRITE (Dia 4-5)

### 5.1 Enviar mensagem de teste
```bash
curl -X POST http://localhost:3004/webhook \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: seu-secret-aqui" \
  -d '{
    "phone":"85999999999",
    "name":"Teste",
    "message":"Teste de migração Render",
    "instance":"cto-campina"
  }'

# Resultado esperado:
# {
#   "reply": "resposta do Claude...",
#   "agent": "faq",
#   "confidence": 0.85
# }
```

### 5.2 Validar que foi salvo nos 2 bancos

**SQLite (local):**
```bash
sqlite3 data/conversations.db \
  "SELECT COUNT(*), MAX(created_at) FROM conversations;"
# Deve mostrar seu novo registro
```

**PostgreSQL (Render):**
```bash
psql $DATABASE_URL -c \
  "SELECT COUNT(*), MAX(created_at) FROM conversations;"
# Deve mostrar mesmo count que SQLite
```

### 5.3 Monitorar logs
```bash
# Local:
tail -f logs/app.log | grep "postgres\|sqlite"

# Render:
# (no dashboard, abrir "Logs")
# Deve aparecer: "[postgres] Conectado..." ou "[postgres] Erro..."
```

---

## ✅ FASE 6: FAILOVER TEST (Dia 5-6)

### 6.1 Teste 1: Se Render cair

```bash
# 1. Parar Render temporariamente
#    (Dashboard → Stop Service)

# 2. Enviar mensagem WhatsApp
#    Deve receber resposta em <3s (local fallback)

# 3. Verificar logs
tail -f logs/app.log | grep "WARNING\|fallback"

# 4. Ligar Render novamente
#    Próxima mensagem vai para Render
```

### 6.2 Teste 2: Se PostgreSQL cair

```bash
# 1. No dashboard Render, parar PostgreSQL

# 2. Enviar mensagem
#    Sistema continua funcionando (SQLite local)
#    Logs mostram: "[postgres] Erro ao inserir (ignorado)"

# 3. Ligar PostgreSQL
#    Volta a sincronizar automaticamente
```

### 6.3 Teste 3: Validar consistência

```bash
# Script de validação (criar depois):
./scripts/validate-dual-write.ts

# Resultado esperado:
# ✅ SQLite: 1234 registros
# ✅ PostgreSQL: 1234 registros
# ✅ Divergência: 0
```

---

## 📋 CHECKLIST FINAL

### Antes de sair de "dual-write"

- [ ] Backup completo feito (`data-backup-20260605/`)
- [ ] PostgreSQL Render criado e testado
- [ ] Redis Render criado e ativo
- [ ] Web Service deploy automático funcionando
- [ ] Código compilado sem erros
- [ ] Script de migração testado
- [ ] 10+ mensagens testadas com dual-write
- [ ] Ambos bancos com mesmo count de registros
- [ ] Failover testado 3x sem problemas
- [ ] Logs sendo gerados normalmente
- [ ] n8n configurado para fallback local

### Depois (pode desligar local)

- [ ] Monitorar por 7 dias em Render
- [ ] Zero data loss confirmado
- [ ] Performance similar ao local
- [ ] Custos dentro do orçamento
- [ ] Então: desligar banco SQLite local (backup mantido)

---

## 🔄 ROLLBACK RÁPIDO (Se der problema)

### Se precisar voltar ao local:

```bash
# 1. Parar Render
#    (Dashboard → Pause Service)

# 2. Remover DATABASE_URL do .env
#    Deixar apenas SQLite

# 3. Recompilar
npm run build

# 4. Reiniciar
npm start

# Tempo total: 2-3 minutos
# Sistema continua 100% funcional
```

---

## 📊 CUSTOS FINAIS

| Serviço | Plan | Custo | Observação |
|---------|------|-------|-----------|
| Web Service | Free/Paid $7 | $0-7 | Sleep após 15min inatividade (free) |
| PostgreSQL | Free/Starter | $0-7 | 256MB storage (suficiente) |
| Redis | Free | $0 | 250MB (suficiente para TTL 48h) |
| **TOTAL** | | **$0-14/mês** | Upgrade se precisar uptime 24/7 |

**Comparação:**
- Local: Você cuida (PC sempre ligado, backups manuais)
- Render $14/mês: Gerenciado, backups automáticos, 99.9% uptime
- AWS $480/mês: Enterprise, mais caro mas scalável

---

## 📞 SUPORTE

**Problemas comuns:**

1. **Build falha no Render**
   - Verificar: `npm run build` local funciona?
   - Se não: rodar `npm install` novamente

2. **PostgreSQL connection refused**
   - Verificar: DATABASE_URL copiada corretamente?
   - Copiar novamente do dashboard Render

3. **Dados não sincronizando**
   - Verificar logs: `tail -f logs/app.log`
   - Se erro de conexão: DATABASE_URL pode estar expirada

4. **Uptime do free tier**
   - Render pausa após 15min inatividade
   - Upgrade para Paid ($7) se quiser 24/7

---

**Próximo passo:** Quando quiser começar a Fase 1, avise!

Data: 2026-06-05  
Status: ✅ Pronto para implementação
