#!/usr/bin/env bash
set -e

echo "🔧  Relai dev setup"

# 1. Copy env
if [ ! -f .env ]; then
  cp .env.example .env
  echo "⚠️  .env created — update passwords and SECRET_KEY before running"
fi

# 2. Generate a real SECRET_KEY
SECRET=$(python3 -c "import secrets; print(secrets.token_hex(32))")
sed -i "s/change_me_64_char_hex_secret_here/$SECRET/" .env
echo "✅  SECRET_KEY generated"

# 3. Build + start
docker compose up --build -d

echo ""
echo "✅  Stack running:"
echo "   App     →  http://localhost"
echo "   API docs →  http://localhost/docs"
echo ""
echo "Run 'docker compose logs -f' to tail logs."
