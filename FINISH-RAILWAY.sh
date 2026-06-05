#!/bin/bash

# Completar o deployment no Railway

cd "C:\Users\Admin\OneDrive\Documents\whatsapp-ai"

echo "Adicionando serviço GitHub..."

# Pipe inputs para railway add
echo -e "GitHub Repo\nVal7h/whatsapp-ai\n\nwhatsapp-ai-prod" | railway add -r Val7h/whatsapp-ai -s whatsapp-ai-prod --branch master

echo ""
echo "✅ Serviço criado!"
echo ""
echo "Iniciando deploy..."

railway up --detach

echo ""
echo "✅ Deploy iniciado!"
echo ""
echo "Acompanhe em: https://railway.app"
echo ""
echo "Aguarde 5-10 minutos para completar!"
