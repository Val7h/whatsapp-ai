#!/bin/bash

###############################################################################
# Script para criar projeto no Railway automaticamente
###############################################################################

set -e

echo "🚂 Railway — Criar Projeto Automaticamente"
echo "=========================================="
echo ""

# Passo 1: Login no Railway
echo "📝 Fazendo login no Railway..."
echo ""
echo "⚠️  Uma aba do navegador vai abrir para você fazer login"
echo "Clique em 'Authorize' quando pedir"
echo ""

railway login

echo ""
echo "✅ Login realizado!"
echo ""

# Passo 2: Criar projeto
echo "🚀 Criando projeto no Railway..."

cd "C:\Users\Admin\OneDrive\Documents\whatsapp-ai"

# Inicializar projeto Railway (conecta ao GitHub)
railway init --name whatsapp-ai

echo "✅ Projeto criado!"
echo ""

# Passo 3: Adicionar serviços
echo "📦 Adicionando PostgreSQL..."
railway add --name postgres postgresql

echo "✅ PostgreSQL adicionado!"
echo ""

echo "📦 Adicionando Redis..."
railway add --name redis redis

echo "✅ Redis adicionado!"
echo ""

# Passo 4: Adicionar variáveis de ambiente
echo "🔑 Configurando variáveis de ambiente..."

railway variables set NODE_ENV=production
railway variables set LOG_LEVEL=info
railway variables set CLAUDE_MODEL=claude-sonnet-4-20250514
railway variables set MAX_HISTORY_TURNS=20
railway variables set CLINIC_PHONE="(83) 9999-9999"
railway variables set WEBHOOK_SECRET=meu-segredo-teste

echo ""
echo "⚠️  ATENÇÃO: Você precisa adicionar ANTHROPIC_API_KEY manualmente:"
echo ""
echo "Execute:"
echo "  railway variables set ANTHROPIC_API_KEY=seu_token_aqui"
echo ""

# Passo 5: Deploy
echo "🚀 Fazendo deploy..."

railway up

echo ""
echo "✅ SUCESSO!"
echo ""
echo "Seu app está sendo deployado em:"
echo "  https://seu-projeto.up.railway.app"
echo ""
echo "Aguarde 3-5 minutos para completar."
echo ""
echo "Depois execute:"
echo "  railway open"
echo ""
echo "Para ver seu projeto no dashboard!"
