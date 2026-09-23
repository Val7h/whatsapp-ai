#!/bin/bash
set -euo pipefail

# Roda apenas em sessões remotas (Claude Code na web).
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# Instala dependências (npm install aproveita o cache do container).
npm install

# Compila o TypeScript para dist/ — necessário p/ rodar os testes (Mocha lê dist/).
npm run build
