# 🎬 GUIA VISUAL: CRIAR SERVIÇOS NO RENDER

**Tempo estimado:** 10-15 minutos  
**Dificuldade:** Fácil (só clicar)

---

## PASSO 1: Criar Conta (2 minutos)

### 1.1 Ir para https://render.com

```
┌─────────────────────────────────────────┐
│  RENDER                          Register│
│  Build & Deploy Apps                    │
└─────────────────────────────────────────┘
```

### 1.2 Clicar "Get Started for Free"

### 1.3 Opções para login:
- [ ] GitHub (recomendado — mais fácil)
- [ ] Google
- [ ] Email

**👉 Recomendado: Usar GitHub login**

---

## PASSO 2: Criar Web Service Node.js (5 minutos)

### 2.1 Dashboard → "New +"

```
┌─────────────────────────────────────┐
│  New +  ▼                           │
├─────────────────────────────────────┤
│ • Web Service                       │ ← Clicar aqui
│ • PostgreSQL
│ • Redis
│ • Static Site
└─────────────────────────────────────┘
```

### 2.2 Clicar "Web Service"

### 2.3 Conectar seu repositório GitHub
```
┌──────────────────────────────────────────┐
│ Connect a repository                     │
├──────────────────────────────────────────┤
│ Select a repository from your GitHub     │
│ account to deploy.                       │
│                                          │
│ [search-repositories]                    │
│                                          │
│ Encontre: whatsapp-ai                    │
│ (ou qual for o nome do seu repo)         │
└──────────────────────────────────────────┘
```

**Selecione o repo do whatsapp-ai**

### 2.4 Preencher configurações

```
┌─────────────────────────────────────────┐
│ Deploy your repository                  │
├─────────────────────────────────────────┤
│                                         │
│ Name:                                   │
│ [whatsapp-ai-prod________________]      │
│                                         │
│ Branch:                                 │
│ [main                           ▼]      │
│                                         │
│ Runtime:                                │
│ [Node              ▼]                   │
│                                         │
│ Build Command:                          │
│ [npm install && npm run build]           │
│                                         │
│ Start Command:                          │
│ [node dist/index.js________________]    │
│                                         │
│ Plan:                                   │
│ [Free                           ▼]      │
│ (upgrade depois se quiser 24/7)         │
│                                         │
│         [Create Web Service]            │
└─────────────────────────────────────────┘
```

### 2.5 Aguardar build (3-5 minutos)

```
┌──────────────────────────────────────┐
│ Deploying...                         │
│                                      │
│ ⏳ Building...                        │
│ ⏳ Starting...                        │
│                                      │
│ (isso pode levar alguns minutos)     │
└──────────────────────────────────────┘
```

### 2.6 Quando estiver pronto

```
┌──────────────────────────────────────┐
│ ✅ whatsapp-ai-prod                  │
│                                      │
│ Status: ✅ Live                      │
│ URL: https://whatsapp-ai-prod       │
│      .onrender.com                   │
│                                      │
│ [View Deployment] [View Logs]        │
└──────────────────────────────────────┘
```

**COPIAR URL:** `https://whatsapp-ai-prod.onrender.com`

---

## PASSO 3: Criar PostgreSQL (3 minutos)

### 3.1 Dashboard → "New +" → "PostgreSQL"

```
┌─────────────────────────────────────┐
│ New +  ▼                            │
├─────────────────────────────────────┤
│ • Web Service                       │
│ • PostgreSQL                        │ ← Clicar aqui
│ • Redis
│ • Static Site
└─────────────────────────────────────┘
```

### 3.2 Configurar

```
┌─────────────────────────────────────┐
│ Create a New PostgreSQL             │
├─────────────────────────────────────┤
│                                     │
│ Name:                               │
│ [whatsapp-ai-pg_____________]       │
│                                     │
│ Region:                             │
│ [São Paulo (South America) ▼]       │
│                                     │
│ PostgreSQL Version:                 │
│ [16                          ▼]     │
│                                     │
│ Plan:                               │
│ [ • Free                            │
│   • Starter ($7/month)              │
│   • Standard ($29/month)            │
│                                     │
│         [Create Database]           │
└─────────────────────────────────────┘
```

**Recomendação: Deixar "Free" por enquanto**

### 3.3 Quando estiver pronto

```
┌──────────────────────────────────────┐
│ ✅ whatsapp-ai-pg                    │
│                                      │
│ Status: ✅ Available                │
│                                      │
│ Connections                         │
│ ─────────────────────────────────    │
│ Host:     dpg-xxxxx.render.com      │
│ Database: whatsapp_ai               │
│ User:     whatsapp_admin            │
│ Password: XXXXXXXXXXXXX             │
│                                      │
│ Internal Database URL:              │
│ postgresql://whatsapp_admin:XXXXX   │
│ @dpg-xxxxx.internal:5432/...        │
│                                      │
│ External Database URL:              │
│ postgresql://whatsapp_admin:XXXXX   │ ← COPIAR ISTO
│ @dpg-xxxxx.render.com:5432/...      │
│                                      │
│         [Copy URL]                  │
└──────────────────────────────────────┘
```

**COPIAR URL:** `postgresql://whatsapp_admin:XXXXX@dpg-xxxxx.render.com:5432/whatsapp_ai`

---

## PASSO 4: Criar Redis (3 minutos)

### 4.1 Dashboard → "New +" → "Redis"

```
┌─────────────────────────────────────┐
│ New +  ▼                            │
├─────────────────────────────────────┤
│ • Web Service                       │
│ • PostgreSQL                        │
│ • Redis                             │ ← Clicar aqui
│ • Static Site
└─────────────────────────────────────┘
```

### 4.2 Configurar

```
┌─────────────────────────────────────┐
│ Create a new Redis                  │
├─────────────────────────────────────┤
│                                     │
│ Name:                               │
│ [whatsapp-ai-redis__________]       │
│                                     │
│ Region:                             │
│ [São Paulo (South America) ▼]       │
│                                     │
│ Eviction Policy:                    │
│ [volatile-lru                    ▼] │
│                                     │
│ Plan:                               │
│ [ • Free (0.25GB)                   │
│   • Standard ($45/month)            │
│                                     │
│         [Create Redis]              │
└─────────────────────────────────────┘
```

**Deixar "Free"**

### 4.3 Quando estiver pronto

```
┌──────────────────────────────────────┐
│ ✅ whatsapp-ai-redis                 │
│                                      │
│ Status: ✅ Available                │
│                                      │
│ Connections                         │
│ ──────────────────────────────────   │
│ Host:     dpg-xxxxx.render.com      │
│ Port:     6379                      │
│ Password: XXXXXXXXXXXXX             │
│                                      │
│ Internal Redis URL:                 │
│ redis://default:XXXXX@              │
│ dpg-xxxxx.internal:6379             │
│                                      │
│ External Redis URL:                 │
│ redis://default:XXXXX@              │ ← COPIAR ISTO
│ dpg-xxxxx.render.com:6379           │
│                                      │
│         [Copy URL]                  │
└──────────────────────────────────────┘
```

**COPIAR URL:** `redis://default:XXXXX@dpg-xxxxx.render.com:6379`

---

## PASSO 5: Adicionar Variáveis ao Web Service (2 minutos)

### 5.1 Voltar ao Dashboard

### 5.2 Clicar em "whatsapp-ai-prod"

### 5.3 Ir para "Environment"

```
┌────────────────────────────────────┐
│ whatsapp-ai-prod                   │
├────────────────────────────────────┤
│ Settings                           │
│ ├─ General                         │
│ ├─ Environment                     │ ← Clicar aqui
│ ├─ Deploys
│ ├─ Events
│ └─ Billing
└────────────────────────────────────┘
```

### 5.4 Adicionar variáveis

Scroll para "Environment Variables"

Clicar "Add Environment Variable"

**Adicione as 3 URLs copiadas:**

```
KEY:   DATABASE_URL
VALUE: postgresql://whatsapp_admin:XXXXX@dpg-xxxxx.render.com:5432/whatsapp_ai
[Add]

KEY:   REDIS_URL
VALUE: redis://default:XXXXX@dpg-xxxxx.render.com:6379
[Add]

KEY:   RENDER_WEBHOOK_URL
VALUE: https://whatsapp-ai-prod.onrender.com/webhook
[Add]
```

**Adicionar também as variáveis que já tem:**

```
KEY:   ANTHROPIC_API_KEY
VALUE: sk-ant-api03-...
[Add]

KEY:   WEBHOOK_SECRET
VALUE: meu-segredo-teste
[Add]

KEY:   CLAUDE_MODEL
VALUE: claude-sonnet-4-20250514
[Add]

KEY:   LOG_LEVEL
VALUE: info
[Add]

KEY:   NODE_ENV
VALUE: production
[Add]
```

### 5.5 Trigger redeploy

Clicar "Manual Deploy" no topo da página

Render vai fazer build novamente com as new variables

---

## ✅ PRONTO!

Agora você tem:

```
✅ Web Service rodando:    https://whatsapp-ai-prod.onrender.com
✅ PostgreSQL pronto:      dpg-xxxxx.render.com
✅ Redis pronto:           dpg-xxxxx.render.com:6379
✅ Código dual-write:      Esperando apenas as URLs
```

---

## 🚨 Se algo der errado

### Build falha

```
Verificar: Clicar "View Logs"
Se erro de compilação:
  - Rodar "npm run build" local
  - Se falhar local, mesmo erro que no Render
```

### Database não conecta

```
DATABASE_URL copiada corretamente?
  - Copiar novamente do dashboard
  - Pegar "External Database URL" (não Internal)
```

### Redis não conecta

```
REDIS_URL copiada corretamente?
  - Copiar "External Redis URL"
  - Incluir "redis://" no início
```

---

## 📝 RESUMO DAS URLs

Depois de tudo pronto, você terá:

```
RENDER_WEBHOOK_URL=https://whatsapp-ai-prod.onrender.com/webhook
DATABASE_URL=postgresql://whatsapp_admin:PASSWORD@dpg-xxxxx.render.com/whatsapp_ai
REDIS_URL=redis://default:PASSWORD@dpg-xxxxx.render.com:6379
```

**Envie para mim e eu conecto tudo! 🚀**

---

**Tempo total desta tela:** 10-15 minutos  
**Dificuldade:** ⭐☆☆☆☆ (só clicar)
