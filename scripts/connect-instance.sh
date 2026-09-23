#!/usr/bin/env bash
#
# connect-instance.sh — cria uma instância no Evolution API e mostra como
# conectar o WhatsApp: QR Code (imagem PNG + no terminal, se qrencode existir)
# e, principalmente, o CÓDIGO DE PAREAMENTO (para conectar digitando um código
# no WhatsApp, sem precisar escanear — ideal quando você está no celular).
#
# Uso:
#   ./scripts/connect-instance.sh [nome-da-instancia] [numero-com-ddi]
#
# Exemplos:
#   ./scripts/connect-instance.sh cto-caruaru
#   ./scripts/connect-instance.sh cto-caruaru 5581999294960   # pede código de pareamento
#
# Variáveis (opcionais — têm padrão do evolution.env):
#   EVOLUTION_URL       (padrão: http://localhost:8080)
#   EVOLUTION_API_KEY   (padrão: cto-evolution-key-2024)
#
set -euo pipefail

INSTANCE="${1:-cto-caruaru}"
NUMBER="${2:-}"
URL="${EVOLUTION_URL:-http://localhost:8080}"
KEY="${EVOLUTION_API_KEY:-cto-evolution-key-2024}"

echo "→ Evolution: $URL"
echo "→ Instância: $INSTANCE"
echo

# Verifica se o Evolution está no ar
if ! curl -sf -o /dev/null "$URL"; then
  echo "✗ Não consegui falar com o Evolution em $URL"
  echo "  Suba com:  docker compose up -d evolution-api"
  echo "  Ou defina EVOLUTION_URL=https://seu-evolution   e rode de novo."
  exit 1
fi

# 1) Cria a instância (se já existir, o Evolution devolve erro — seguimos assim mesmo)
CREATE_BODY=$(cat <<JSON
{"instanceName":"$INSTANCE","qrcode":true,"integration":"WHATSAPP-BAILEYS"${NUMBER:+,\"number\":\"$NUMBER\"}}
JSON
)
echo "→ Criando/garantindo a instância..."
curl -s -X POST "$URL/instance/create" \
  -H "apikey: $KEY" -H "Content-Type: application/json" \
  -d "$CREATE_BODY" > /tmp/evo_create.json || true

# 2) Pede a conexão (retorna QR + pairing code)
echo "→ Solicitando conexão..."
RESP=$(curl -s "$URL/instance/connect/$INSTANCE" -H "apikey: $KEY")
# Se o connect não trouxe nada útil, tenta reaproveitar o retorno do create
echo "$RESP" | grep -q '"' || RESP=$(cat /tmp/evo_create.json)

# 3) Extrai pairingCode / code (string do QR) / base64 (PNG) — procura recursivamente
read -r PAIR CODE B64 < <(node -e '
  let s=""; process.stdin.on("data",d=>s+=d).on("end",()=>{
    let j={}; try{ j=JSON.parse(s) }catch(e){}
    const found={pairingCode:"",code:"",base64:""};
    (function walk(o){ if(!o||typeof o!=="object")return;
      for(const k of Object.keys(o)){
        if(k in found && !found[k] && typeof o[k]==="string") found[k]=o[k];
        else walk(o[k]);
      }})(j);
    const clean=x=>(x||"").replace(/\s/g,"");
    process.stdout.write([clean(found.pairingCode)||"-",clean(found.code)||"-",clean(found.base64)||"-"].join(" "));
  });
' <<<"$RESP")

echo
echo "══════════════════════════════════════════════════════════════"
if [ "$PAIR" != "-" ] && [ -n "$PAIR" ]; then
  echo "  ✅ CÓDIGO DE PAREAMENTO: $PAIR"
  echo
  echo "  No celular da clínica: WhatsApp → Aparelhos conectados →"
  echo "  Conectar um aparelho → \"Conectar com número de telefone\" →"
  echo "  digite o código acima."
else
  echo "  (Evolution não retornou código de pareamento desta vez.)"
fi
echo "══════════════════════════════════════════════════════════════"
echo

# 4) Salva o QR como imagem PNG (dá pra abrir e escanear de outra tela)
if [ "$B64" != "-" ] && [ -n "$B64" ]; then
  PNG="qr-$INSTANCE.png"
  echo "${B64#data:image/png;base64,}" | base64 -d > "$PNG" 2>/dev/null \
    && echo "🖼  QR salvo em: $PNG (abra e escaneie)" \
    || echo "(não consegui decodificar o PNG do QR)"
fi

# 5) Renderiza o QR no terminal, se qrencode existir
if [ "$CODE" != "-" ] && [ -n "$CODE" ] && command -v qrencode >/dev/null 2>&1; then
  echo
  echo "📱 Escaneie o QR abaixo:"
  qrencode -t ANSIUTF8 "$CODE"
elif [ "$CODE" != "-" ] && [ -n "$CODE" ]; then
  echo
  echo "ℹ  Para ver o QR no terminal, instale: sudo apt-get install -y qrencode"
fi

echo
echo "→ Conferir status:  curl $URL/instance/connectionState/$INSTANCE -H \"apikey: $KEY\""
