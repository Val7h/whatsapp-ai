#!/bin/bash

###############################################################################
# Deploy automático no Railway (modo browserless)
###############################################################################

set -e

echo "🚂 Railway Deploy — Modo Automático"
echo "===================================="
echo ""

cd "C:\Users\Admin\OneDrive\Documents\whatsapp-ai"

# Passo 1: Login browserless (device code flow)
echo "📝 Fazendo login no Railway (device code flow)..."
echo ""
echo "⚠️  Você vai receber um código para usar em qualquer navegador"
echo ""

railway login --browserless

echo ""
echo "✅ Login realizado!"
echo ""

# Passo 2: Inicializar projeto
echo "🚀 Criando projeto no Railway..."

railway init --name whatsapp-ai-prod

echo "✅ Projeto criado!"
echo ""

# Passo 3: Adicionar plugins
echo "📦 Adicionando PostgreSQL..."
railway add postgresql

echo "✅ PostgreSQL adicionado!"
echo ""

echo "📦 Adicionando Redis..."
railway add redis

echo "✅ Redis adicionado!"
echo ""

# Passo 4: Variáveis de ambiente (sem ANTHROPIC_API_KEY que precisa ser manual)
echo "🔑 Configurando variáveis de ambiente..."

railway variables set NODE_ENV=production
railway variables set LOG_LEVEL=info
railway variables set CLAUDE_MODEL=claude-sonnet-4-20250514
railway variables set MAX_HISTORY_TURNS=20
railway variables set CLINIC_PHONE="(83) 9999-9999"
railway variables set WEBHOOK_SECRET=meu-segredo-teste

echo "✅ Variáveis configuradas!"
echo ""

# Passo 5: Deploy
echo "🚀 Iniciando deploy..."
echo ""
echo "Isso vai levar alguns minutos..."
echo ""

railway up --detach

echo ""
echo "✅ DEPLOY INICIADO!"
echo ""
echo "Seu app está sendo deployado em Railway!"
echo ""
echo "Aguarde 3-5 minutos para completar."
echo ""
echo "Próximas etapas:"
echo "  1. Vá para: https://railway.app"
echo "  2. Você verá seu projeto: whatsapp-ai-prod"
echo "  3. Clique nele"
echo "  4. Vá para: Variables"
echo "  5. Adicione: ANTHROPIC_API_KEY = seu_token"
echo "  6. Clique em 'Redeploy'"
echo ""
echo "Depois me avisa que tudo está rodando! 🎉"
