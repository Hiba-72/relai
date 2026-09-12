# Relai dev setup (Windows / PowerShell)
$ErrorActionPreference = "Stop"

Write-Host "Relai dev setup"

# 1. Copy env
if (-not (Test-Path .env)) {
    Copy-Item .env.example .env
    Write-Host ".env created - update passwords before running"
}

# 2. Generate a real SECRET_KEY
$secret = python -c "import secrets; print(secrets.token_hex(32))"
(Get-Content .env) -replace "change_me_64_char_hex_secret_here", $secret | Set-Content .env -Encoding utf8
Write-Host "SECRET_KEY generated"

# 3. Build + start
docker compose up --build -d

# 4. Seed admin (waits for backend to be reachable)
Write-Host "Waiting for backend to be ready..."
$tries = 0
while ($tries -lt 30) {
    try {
        docker compose exec -T backend python seed.py
        break
    } catch {
        Start-Sleep -Seconds 2
        $tries++
    }
}

Write-Host ""
Write-Host "Stack running:"
Write-Host "   App      ->  http://localhost"
Write-Host "   API docs ->  http://localhost/docs"
Write-Host "   Login    ->  admin@chu-valmont.fr / admin1234"
Write-Host ""
Write-Host "Run 'docker compose logs -f' to tail logs."
