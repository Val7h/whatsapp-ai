# 🚀 DEPLOYMENT GUIDE — Produção

**Versão:** 1.0  
**Data:** 2026-06-05  
**Status:** Pronto para Deploy

---

## ✅ PRÉ-REQUISITOS

- [ ] Node.js v24+
- [ ] npm 10+
- [ ] ANTHROPIC_API_KEY configurada
- [ ] n8n rodando (3 instâncias)
- [ ] SQLite disponível
- [ ] Redis (opcional, fallback para Map)
- [ ] Portas 3003-3004 livres

---

## 🔧 SETUP INICIAL

### **1. Variáveis de Ambiente**

```bash
# .env
ANTHROPIC_API_KEY=sk-ant-api03-...
PORT=3003
WEBHOOK_SECRET=seu-secret-aqui
CLAUDE_MODEL=claude-sonnet-4-6
REDIS_URL=redis://localhost:6379  (opcional)
LOG_LEVEL=info
```

### **2. Instalar Dependências**

```bash
npm install
npm run build
```

### **3. Validar Build**

```bash
npm run build  # Deve compilar sem erros
ls dist/      # Verificar que dist/ foi gerado
```

---

## 🚀 INICIAR EM PRODUÇÃO

### **Opção A: npm start (recomendado)**

```bash
cd ~/OneDrive/Documents/whatsapp-ai
npm start
# Esperar: [server] Webhook: POST http://localhost:3003/webhook
```

### **Opção B: PM2 (para alta disponibilidade)**

```bash
npm install -g pm2
pm2 start dist/index.js --name "whatsapp-ai"
pm2 save
pm2 startup
```

### **Opção C: Docker (se disponível)**

```bash
docker build -t whatsapp-ai .
docker run -p 3003:3003 \
  -e ANTHROPIC_API_KEY=... \
  whatsapp-ai
```

---

## 📊 VALIDAÇÃO PÓS-DEPLOY

### **Health Check**

```bash
curl http://localhost:3003/health
# Deve retornar: {"status":"ok"}
```

### **Teste Webhook**

```bash
curl -X POST http://localhost:3003/webhook \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: seu-secret-aqui" \
  -d '{
    "phone":"85999999999",
    "name":"Teste",
    "message":"Teste de conexão",
    "instance":"cto-campina"
  }' | jq .

# Deve retornar JSON com "reply" e "agent"
```

### **Verificar Instâncias n8n**

```
http://localhost:5678/webhooks

Verificar status:
- cto-campina: ✅ CONNECTED
- cto-geral: ✅ CONNECTED
- cto-caruaru: ✅ CONNECTED (depois de QR code)
```

### **Verificar Logs**

```bash
# Monitorar em tempo real
tail -f logs/app.log | grep "\[pm-coordinator\]\|\[claude\]\|\[webhook\]"

# Procurar por erros
grep ERROR logs/app.log
```

---

## 📈 MONITORAMENTO CONTÍNUO

### **Métricas para Acompanhar**

1. **Taxa de sucesso por agente:**
   ```
   grep "Usando agente:" logs/app.log | sort | uniq -c
   ```

2. **Tempo de resposta:**
   ```
   grep "Tokens usados" logs/app.log | tail -20
   ```

3. **Erros de Claude:**
   ```
   grep "ERROR.*claude" logs/app.log
   ```

4. **Taxa de requisições:**
   ```
   grep "\[http\] POST /webhook" logs/app.log | wc -l
   ```

---

## 🔄 ROLLBACK (Se Necessário)

### **Para voltar à versão anterior:**

```bash
# Parar servidor
npm stop  # ou Ctrl+C

# Restaurar backup
cp src/routes/webhook.ts.backup-* src/routes/webhook.ts

# Recompilar
npm run build

# Reiniciar
npm start
```

---

## 🚨 TROUBLESHOOTING

### **Problema: "EADDRINUSE: Port 3003 in use"**
```bash
# Matar processo na porta
npx lsof -i :3003 | grep LISTEN | awk '{print $2}' | xargs kill -9
```

### **Problema: "Could not resolve authentication"**
```bash
# Verificar ANTHROPIC_API_KEY
echo $ANTHROPIC_API_KEY

# Se vazio, adicionar ao .env e reiniciar
PORT=3003 npm start
```

### **Problema: "Webhook retorna 401"**
```bash
# Verificar WEBHOOK_SECRET nos headers
curl -H "x-webhook-secret: meu-segredo-teste" ...
```

### **Problema: Agente errado detectado**
```bash
# Verificar logs
tail -50 logs/app.log | grep "tipo:"

# Pode ser necessário ajustar keywords em pm-coordinator.js
```

---

## 📋 CHECKLIST PRÉ-PRODUÇÃO

- [ ] ANTHROPIC_API_KEY configurada
- [ ] .env preenchido corretamente
- [ ] npm run build passa sem erros
- [ ] 9/9 testes passando
- [ ] Todas 3 instâncias n8n conectadas
- [ ] Health check respondendo
- [ ] Logs sendo gerados corretamente
- [ ] Monitoramento ativo
- [ ] Backup de webhook.ts feito
- [ ] Teste de rollback funcionando

---

## 📞 SUPORTE

**Em Caso de Erro:**
1. Verificar logs: `tail -f logs/app.log`
2. Testar webhook manualmente
3. Verificar variáveis de ambiente
4. Consultar seção Troubleshooting acima

---

**Pronto para deploy! ✅**

Data: 2026-06-05
