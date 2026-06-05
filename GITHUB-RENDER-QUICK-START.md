# 🚀 Quick Start: GitHub → Render

**Status:** Código pronto para GitHub e Render  
**Tempo estimado:** 10 minutos

---

## ⚡ 5 Passos Rápidos

### **Passo 1: Criar repositório no GitHub** (2 min)

👉 Vá para: https://github.com/new

```
Nome: whatsapp-ai
Descrição: WhatsApp AI multi-agent system
Privado: Você escolhe
Inicializar com: NADA (deixar vazio)
```

Clique "Create repository"

### **Passo 2: Copiar URL do repositório** (30 sec)

Após criar, você verá a URL:
```
https://github.com/SEU-USUARIO/whatsapp-ai.git
```

**Copie essa URL**

### **Passo 3: Fazer push para GitHub** (2 min)

Abra Terminal/PowerShell e execute:

```bash
cd C:\Users\Admin\OneDrive\Documents\whatsapp-ai

git remote add origin https://github.com/SEU-USUARIO/whatsapp-ai.git
git branch -M main
git push -u origin main
```

(Será pedido seu GitHub token/password)

### **Passo 4: Criar Web Service no Render** (3 min)

1. Vá para https://dashboard.render.com
2. Clique "+ New" → "Web Service"
3. Selecione: `whatsapp-ai` (seu novo repositório)
4. Configure:
   - **Name:** `whatsapp-ai-prod`
   - **Branch:** `main`
   - **Build:** `npm install && npm run build`
   - **Start:** `node dist/index.js`
5. Clique "Create Web Service"

**Aguarde 3-5 minutos para o build completar**

### **Passo 5: Criar PostgreSQL e Redis** (3 min)

Volte ao dashboard Render:

**PostgreSQL:**
- "+ New" → "PostgreSQL"
- Nome: `whatsapp-ai-pg`
- Região: São Paulo
- Clique "Create Database"

**Redis:**
- "+ New" → "Redis"
- Nome: `whatsapp-ai-redis`
- Região: São Paulo
- Clique "Create Redis"

---

## 📝 Copiar URLs (IMPORTANTE!)

Depois que todos os 3 serviços estiverem prontos, copie:

```
DATABASE_URL=postgresql://whatsapp_admin:PASSWORD@dpg-xxxxx.render.com/whatsapp_ai
REDIS_URL=redis://default:PASSWORD@dpg-xxxxx.render.com:6379
RENDER_WEBHOOK_URL=https://whatsapp-ai-prod.onrender.com/webhook
```

---

## ✅ Checklist

- [ ] Repositório criado no GitHub
- [ ] Push feito com sucesso
- [ ] Web Service criado no Render (build completo)
- [ ] PostgreSQL criado
- [ ] Redis criado
- [ ] 3 URLs copiadas

---

## 🔗 URLs Úteis

- Render Dashboard: https://dashboard.render.com
- GitHub: https://github.com/new
- Render Docs: https://render.com/docs

---

## 💡 Se algo der errado

**Push falha com "remote already exists":**
```bash
git remote remove origin
git remote add origin https://seu-url-nova
git push -u origin main
```

**Build falha no Render:**
- Clique em "View Logs"
- Se erro de compilação: rodar `npm run build` local
- Se erro de conexão: verificar variáveis de ambiente

**Precisa de ajuda?**
- Leia: `RENDER-MIGRATION.md`
- Ou: `RENDER-SETUP-MANUAL.md`

---

**Depois que terminar, você terá:**
✅ Código no GitHub  
✅ Web Service rodando em Render  
✅ PostgreSQL pronto  
✅ Redis pronto  
✅ Sistema pronto para dual-write

**Tempo total:** ~15 minutos
