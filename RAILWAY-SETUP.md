# 🚂 Railway Setup — WhatsApp AI

**Status:** Super simples! Sem API keys complicadas  
**Tempo:** 10 minutos  
**Dificuldade:** ⭐☆☆☆☆ (só conectar GitHub)

---

## 🚀 5 Passos Simples

### **Passo 1: Abra Railway** (30 sec)

👉 Vá para: https://railway.app

Clique: **"Start a New Project"** (ou "Create New Project")

---

### **Passo 2: Conecte GitHub** (1 min)

Você vai ver opções, clique em:
```
"Deploy from GitHub"
```

Será pedido para conectar sua conta GitHub (Val7h)

Aprove tudo que pedir

---

### **Passo 3: Selecione o repositório** (1 min)

Após conectar, você vai ver seus repositórios

**Procure por:** `whatsapp-ai`

Clique nele

---

### **Passo 4: Railway detecta tudo automaticamente** (2 min)

Railway vai ver que é Node.js e vai:
- ✅ Ler package.json
- ✅ Executar: `npm run build`
- ✅ Iniciar com: `node dist/index.js`

Ele cria automaticamente!

**Deixe o build completar** (vai levar 2-3 minutos)

---

### **Passo 5: Adicionar banco de dados e cache** (3 min)

Após o build completar, você vai estar no dashboard do projeto

Clique no **botão "+" ou "Add"** (procure no topo)

Você vai ver opções para adicionar:

#### **A) PostgreSQL**
```
Clique: "+ Add Service"
Procure: PostgreSQL
Clique nele
Pronto! Ele cria automaticamente
```

#### **B) Redis**
```
Clique: "+ Add Service"
Procure: Redis
Clique nele
Pronto! Ele cria automaticamente
```

---

## ✅ Pronto! Mas falta 1 coisa...

Você precisa adicionar suas variáveis de ambiente:

1. Vá para o projeto `whatsapp-ai`
2. Procure a aba: **"Variables"** ou **"Environment"**
3. Clique: **"+ Add Variable"**

**Adicione:**
```
ANTHROPIC_API_KEY = seu_token_aqui
WEBHOOK_SECRET = meu-segredo-teste
CLAUDE_MODEL = claude-sonnet-4-20250514
LOG_LEVEL = info
NODE_ENV = production
```

---

## 🔗 Railway conecta tudo automaticamente!

Quando você adiciona PostgreSQL e Redis, Railway **automaticamente**:

✅ Cria as variáveis:
- `DATABASE_URL` (para PostgreSQL)
- `REDIS_URL` (para Redis)

Não precisa fazer nada! Já vem pronto!

---

## 📊 Como é no Railway

```
Seu Projeto
├── whatsapp-ai (Node.js app)
├── PostgreSQL (banco)
└── Redis (cache)

Tudo conectado automaticamente!
```

---

## 🌐 Seu App vai ficar rodando em:

```
https://seu-projeto-randomid.up.railway.app/health
```

Railway gera uma URL aleatória para seu app

---

## 💡 Diferenças Railway vs Render

| Aspecto | Railway | Render |
|---------|---------|--------|
| **Setup** | Super simples | Precisa de API key |
| **GitHub** | Automático | Automático |
| **Database** | +Add Service | Precisa criar separado |
| **Preço** | Free até $5/mês | Free com auto-sleep |
| **Downtime** | Não dorme | Dorme após 15min (free) |

---

## ✨ Depois que terminar

**Você vai ter:**
```
✅ App rodando em: https://seu-app.up.railway.app
✅ PostgreSQL conectado
✅ Redis pronto
✅ Código rodando 24/7
✅ Variáveis de ambiente configuradas
```

---

## 🔑 Copiar URLs finais

Quando tudo estiver pronto, vá para:

**Variables** (no projeto Railway)

Você vai ver:
```
DATABASE_URL = postgresql://user:pass@host:port/db
REDIS_URL = redis://default:pass@host:port
```

**Copie essas 2 URLs** quando precisar depois

---

## 🎯 Checklist

- [ ] Entrei em https://railway.app
- [ ] Cliquei "Deploy from GitHub"
- [ ] Conectei minha conta GitHub
- [ ] Selecionei whatsapp-ai
- [ ] Build completou
- [ ] Adicionei PostgreSQL
- [ ] Adicionei Redis
- [ ] Adicionei ANTHROPIC_API_KEY
- [ ] App está rodando ✅

---

**Próximo passo:** Me avisa quando tudo estiver rodando e eu faço a migração SQLite→PostgreSQL! 🚀
