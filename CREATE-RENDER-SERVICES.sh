#!/bin/bash

###############################################################################
# Script para criar 3 serviços no Render automaticamente
###############################################################################

set -e

echo "🚀 WhatsApp AI — Criar Serviços no Render"
echo "=========================================="
echo ""

# Verificar se RENDER_API_KEY está configurada
if [ -z "$RENDER_API_KEY" ]; then
    echo "❌ RENDER_API_KEY não definida!"
    echo ""
    echo "Para obter sua API Key:"
    echo "  1. Vá para: https://dashboard.render.com/account/api-tokens"
    echo "  2. Clique 'Create API Key'"
    echo "  3. Copie a chave"
    echo ""
    echo "Depois execute:"
    echo "  export RENDER_API_KEY=seu_token_aqui"
    echo "  bash CREATE-RENDER-SERVICES.sh"
    echo ""
    exit 1
fi

REPO_URL="https://github.com/Val7h/whatsapp-ai"
RENDER_API="https://api.render.com/v1"

echo "🔗 Repositório: $REPO_URL"
echo "🔑 API Key: ${RENDER_API_KEY:0:10}..."
echo ""

# ============================================================================
# 1. Criar Web Service
# ============================================================================
echo "📝 Criando Web Service (whatsapp-ai-prod)..."

WEB_SERVICE=$(curl -s -X POST "$RENDER_API/services" \
  -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "whatsapp-ai-prod",
    "type": "web_service",
    "repo": "'$REPO_URL'",
    "branch": "master",
    "region": "oregon",
    "plan": "free",
    "runtime": "node",
    "buildCommand": "npm install && npm run build",
    "startCommand": "node dist/index.js",
    "autoDeployOnPush": true,
    "envVars": [
      {"key": "NODE_ENV", "value": "production"},
      {"key": "LOG_LEVEL", "value": "info"},
      {"key": "CLAUDE_MODEL", "value": "claude-sonnet-4-20250514"},
      {"key": "MAX_HISTORY_TURNS", "value": "20"},
      {"key": "CLINIC_PHONE", "value": "(83) 9999-9999"},
      {"key": "WEBHOOK_SECRET", "value": "meu-segredo-teste"}
    ]
  }' 2>/dev/null)

WEB_ID=$(echo "$WEB_SERVICE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$WEB_ID" ]; then
    echo "❌ Erro ao criar Web Service"
    echo "Resposta: $WEB_SERVICE"
    exit 1
fi

echo "✅ Web Service criado: $WEB_ID"
WEB_URL="https://api.render.com/v1/services/$WEB_ID"
echo ""

# ============================================================================
# 2. Criar PostgreSQL
# ============================================================================
echo "📝 Criando PostgreSQL (whatsapp-ai-pg)..."

PG_SERVICE=$(curl -s -X POST "$RENDER_API/services" \
  -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "whatsapp-ai-pg",
    "type": "pserv",
    "plan": "free",
    "region": "oregon",
    "ipAllowList": []
  }' 2>/dev/null)

PG_ID=$(echo "$PG_SERVICE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$PG_ID" ]; then
    echo "❌ Erro ao criar PostgreSQL"
    echo "Resposta: $PG_SERVICE"
    exit 1
fi

echo "✅ PostgreSQL criado: $PG_ID"
echo ""

# ============================================================================
# 3. Criar Redis
# ============================================================================
echo "📝 Criando Redis (whatsapp-ai-redis)..."

REDIS_SERVICE=$(curl -s -X POST "$RENDER_API/services" \
  -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "whatsapp-ai-redis",
    "type": "redis",
    "plan": "free",
    "region": "oregon",
    "ipAllowList": []
  }' 2>/dev/null)

REDIS_ID=$(echo "$REDIS_SERVICE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$REDIS_ID" ]; then
    echo "❌ Erro ao criar Redis"
    echo "Resposta: $REDIS_SERVICE"
    exit 1
fi

echo "✅ Redis criado: $REDIS_ID"
echo ""

# ============================================================================
# 4. Conectar PostgreSQL ao Web Service
# ============================================================================
echo "🔗 Conectando PostgreSQL ao Web Service..."

CONNECT_PG=$(curl -s -X PUT "$WEB_URL/env-vars" \
  -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "envVars": [
      {"key": "DATABASE_URL", "fromService": "'$PG_ID'", "type": "connection_string"}
    ]
  }' 2>/dev/null)

echo "✅ PostgreSQL conectado"
echo ""

# ============================================================================
# 5. Conectar Redis ao Web Service
# ============================================================================
echo "🔗 Conectando Redis ao Web Service..."

CONNECT_REDIS=$(curl -s -X PUT "$WEB_URL/env-vars" \
  -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "envVars": [
      {"key": "REDIS_URL", "fromService": "'$REDIS_ID'", "type": "redis_url"}
    ]
  }' 2>/dev/null)

echo "✅ Redis conectado"
echo ""

# ============================================================================
# 6. Adicionar ANTHROPIC_API_KEY
# ============================================================================
echo "🔑 Adicionando variáveis sensíveis..."

echo "Você precisa adicionar ANTHROPIC_API_KEY no Render Dashboard:"
echo ""
echo "1. Vá para: https://dashboard.render.com"
echo "2. Selecione: whatsapp-ai-prod"
echo "3. Vá para: Environment"
echo "4. Clique: Add Environment Variable"
echo "5. Key: ANTHROPIC_API_KEY"
echo "6. Value: seu_token_aqui"
echo ""

# ============================================================================
# Resultado Final
# ============================================================================
echo ""
echo "✅ SUCESSO!"
echo ""
echo "Serviços criados:"
echo "  • Web Service: whatsapp-ai-prod"
echo "  • PostgreSQL: whatsapp-ai-pg"
echo "  • Redis: whatsapp-ai-redis"
echo ""
echo "Próximos passos:"
echo "  1. Vá para: https://dashboard.render.com"
echo "  2. Clique em: whatsapp-ai-prod"
echo "  3. Vá para: Environment"
echo "  4. Adicione ANTHROPIC_API_KEY"
echo "  5. Clique: Deploy (redeploy manual)"
echo ""
echo "Build vai começar em poucos segundos!"
echo "Aguarde 3-5 minutos para completar..."
echo ""
