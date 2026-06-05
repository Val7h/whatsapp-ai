#!/bin/bash

# ============================================================================
# GitHub Setup para WhatsApp AI no Render
# ============================================================================
#
# Passos para executar:
# 1. Criar um repositório VAZIO no GitHub: https://github.com/new
#    Nome: whatsapp-ai
#    Descrição: WhatsApp AI multi-agent system
#    Privado: Você escolhe
#    NÃO inicialize com README, .gitignore, ou license
#
# 2. Copie a URL do seu novo repositório (ex: https://github.com/seu-usuario/whatsapp-ai.git)
#
# 3. Execute este script:
#    bash GITHUB-SETUP.sh
#
# 4. Será solicitado o URL do repositório - cole a URL copiada
#
# ============================================================================

set -e

echo "🚀 WhatsApp AI - GitHub Setup"
echo "=============================="
echo ""

# Solicitar URL do repositório
read -p "📝 Cole a URL do seu repositório GitHub (ex: https://github.com/seu-usuario/whatsapp-ai.git): " REPO_URL

if [ -z "$REPO_URL" ]; then
    echo "❌ Erro: URL do repositório não pode estar vazio"
    exit 1
fi

echo ""
echo "🔗 Conectando ao repositório: $REPO_URL"
echo ""

# Adicionar remote
git remote add origin "$REPO_URL"

# Fazer push da branch main
echo "📤 Fazendo push para GitHub..."
git branch -M main
git push -u origin main

echo ""
echo "✅ Sucesso!"
echo ""
echo "Próximos passos no Render:"
echo "1. Vá para https://dashboard.render.com"
echo "2. Clique em '+ New'"
echo "3. Selecione 'Web Service'"
echo "4. Conecte seu repositório GitHub: $REPO_URL"
echo "5. Configure com render.yaml (arquivo já criado)"
echo ""
