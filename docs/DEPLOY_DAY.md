# Deploy Day Walkthrough

Step-by-step checklist for installing Relai on the hospital's Ubuntu 22.04
Desktop VM (running under Hyper-V on the Windows Server host). The hospital
LAN has **internet access with heavy firewalls** — you can reach package
repos during setup, but external calls from the browser at runtime will be
blocked, and the NGFW inspects everything.

Print this or pull it up on a laptop.

> **Conventions.** `[laptop]` = your dev machine before you leave. `[server]`
> = the Ubuntu VM (over SSH). `[tech-pc]` = any hospital workstation used to
> smoke-test the app from the user side.

---

## Phase 0 — 24 hours before deploy [laptop]

**Goal:** make sure the build you carry into the hospital is the exact one
you tested. No last-minute changes.

```powershell
# 1. Working tree clean, everything committed
git status
git log --oneline -10

# 2. Local end-to-end smoke test of the production stack
docker compose -f docker-compose.yml -f docker-compose.prod.yml down -v
docker compose -f docker-compose.yml -f docker-compose.prod.yml build
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
# Wait ~30s. In a browser: login, create a ticket, take it, resolve it.

# 3. Confirm seeds produce a clean DB
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec backend python seed.py
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec backend python seed_inventaire.py
# Browse Services + Équipements — confirm no duplicates.

# 4. Package the code for transfer
git bundle create relai-deploy.bundle --all

# 5. Drop the bundle + this DEPLOY_DAY.md onto the hospital shared file
#    server at the path your encadrant gave you. Windows PowerShell:
Copy-Item relai-deploy.bundle \\<server>\<share>\relai\
Copy-Item docs\DEPLOY_DAY.md   \\<server>\<share>\relai\
```

**Confirm with the hospital IT contact:**

- [ ] VM hostname/IP, SSH access (your key uploaded, sudo confirmed)
- [ ] Disk (>= 20 GB free), RAM (>= 4 GB — Desktop needs headroom)
- [ ] Ubuntu 22.04 Desktop is fresh and reachable
- [ ] Firewall rules IT will apply — port 80 from user LAN, 22 from admin LAN
- [ ] Static IP assigned to the VM, and (ideally) a DNS name like `relai.example.local`
- [ ] NGFW allow-rule for the VM's IP:80 with purpose = "internal ticketing app"
- [ ] Backup destination (a share/second host you can copy nightly dumps to)

---

## Phase 1 — SSH into the VM and verify the environment [server]

**Why:** every deploy failure I've seen starts with a wrong assumption about
the target box. Verify before you install anything.

### 1a. Enable SSH if it isn't running yet

Ubuntu **Desktop** ships without SSH server enabled by default. Someone with
keyboard access to the VM needs to run this once:

```bash
sudo apt update && sudo apt install -y openssh-server
sudo systemctl enable --now ssh
ip addr show | grep "inet 172.19"    # note the static IP
```

Then from your laptop:

```powershell
ssh you@<vm-ip>
```

### 1b. Sanity-check the box

```bash
cat /etc/os-release           # Ubuntu 22.04?
df -h /                       # >= 20 GB free
free -h                       # >= 4 GB (Desktop uses ~500 MB just idling)
date                          # timezone right?
docker --version              # may fail — see Phase 1c
docker compose version        # may fail — see Phase 1c
```

### 1c. Free up RAM by dropping the GUI (optional but recommended)

If the VM is tight on RAM, tell it to boot to a text console instead of
GNOME. You keep the ability to `startx` when you sit at the box, but the
machine runs headless the rest of the time:

```bash
sudo systemctl set-default multi-user.target
# To reverse later: sudo systemctl set-default graphical.target
```

Reboot for it to take effect. Reclaims ~500 MB.

---

## Phase 2 — Install Docker [server]

**Why:** Ubuntu Desktop doesn't ship Docker. You install from Docker's
official apt repo (recent engine + Compose v2). Since the hospital LAN has
internet, this is the standard install — no offline dance.

```bash
# Remove anything half-installed
sudo apt remove -y docker docker-engine docker.io containerd runc 2>/dev/null

# Install Docker's official repo prerequisites
sudo apt update
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings

# Trust Docker's package-signing key
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# Add the repo
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io \
                    docker-buildx-plugin docker-compose-plugin

# Start it, enable at boot
sudo systemctl enable --now docker

# Let your user run docker without sudo. You MUST log out and back in.
sudo usermod -aG docker $USER
exit
```

Reconnect and verify:

```powershell
ssh you@<vm-ip>
```

```bash
docker --version              # >= 24.0
docker compose version        # v2.x
docker run --rm hello-world   # prints "Hello from Docker!"
```

**If `hello-world` hangs or fails:** the NGFW is probably blocking outbound
to `registry-1.docker.io`. Ask IT to allow the VM to reach Docker Hub for
the duration of the install (they can revoke afterwards — the built images
will be baked in).

---

## Phase 3 — Get the code onto the VM [server]

**Why:** the git bundle is a full copy of the repo in a single file. Simpler
than setting up authenticated git-over-SSH to an internal git server.

```bash
sudo mkdir -p /opt/relai
sudo chown $USER:$USER /opt/relai
cd /opt/relai

# Mount the hospital shared file server (ask IT for the exact share path)
sudo mkdir -p /mnt/transfer-share
sudo mount -t cifs //<smb-server>/<share> /mnt/transfer-share \
  -o username=<you>,vers=3.0

# Clone from the bundle
git clone /mnt/transfer-share/relai/relai-deploy.bundle .
git checkout master

# Confirm you're on the commit you tested
git log --oneline -3

# Make scripts executable
chmod +x scripts/*.sh
```

**About the inventory seed:** `backend/seed_inventaire.py` sits next to the
seed script and gets copied into the backend image at build time. If the
hospital wants to add/edit inventory rows before the first seed run, edit
that CSV file *before* Phase 5. After the deploy it's easier to edit via
the web UI (Équipements → detail page) since the seed script is idempotent
and won't overwrite existing rows.

---

## Phase 4 — Configure secrets [server]

**Why:** the `.env` file holds the DB password and the JWT signing key.
Generating them here (not on your laptop) means the secret never leaves the
target machine. Never commit `.env`.

```bash
cp .env.production.example .env

# Generate fresh values
echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)"
echo "SECRET_KEY=$(openssl rand -hex 32)"

# Paste each generated value into the matching line
nano .env
```

Required edits inside `.env`:

- `POSTGRES_PASSWORD` — paste the first openssl output
- `SECRET_KEY` — paste the second openssl output
- `ALLOWED_ORIGINS` — set to `http://<vm-ip>` (or `http://relai.example.local` if IT gives you a DNS name). Plain HTTP only if the network genuinely isolates the VM; otherwise terminate TLS (see below).
- `ENVIRONMENT=production`

Sanity check — no placeholders left:

```bash
grep "GENERATE_ME_" .env && echo "STOP: .env still has placeholders" || echo "OK"
```

---

## Phase 5 — First deploy [server]

**Why:** the deploy script builds images, brings the stack up, waits for
Postgres, runs migrations, and seeds. Doing it manually is error-prone; the
script encodes the order.

```bash
scripts/deploy.sh --first
```

What that does, in order:

1. Refuses to run if `.env` still has placeholders (safety check).
2. Builds backend + frontend Docker images (~3–5 min the first time).
3. Brings the stack up (`db`, `backend`, `frontend`, `nginx`).
4. **Restarts nginx** so it re-resolves upstream container IPs (a bug I hit during testing — nginx caches the first IP it sees and misses if the backend container restarts).
5. Waits for Postgres to be healthy.
6. Runs `alembic upgrade head` (creates all tables).
7. Runs `seed.py` (admin account + services) then `seed_inventaire.py` (generates the workstation and equipment inventory).
8. Prints the post-deploy checklist.

Watch the logs in a second SSH session if you want:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f
# Look for "Application startup complete."
```

---

## Phase 6 — Configure the Ubuntu firewall [server]

**Why:** the app is on port 80 (plain HTTP, internal LAN only). Leaving
other ports open is unnecessary attack surface. Substitute the real subnets
IT gave you for the placeholders below.

```bash
# 192.0.2.0/24 = user LAN, 192.0.2.0/28 = admin/IT subnet — REPLACE THESE
sudo ufw allow from 192.0.2.0/24 to any port 80 proto tcp comment 'Relai web'
sudo ufw allow from 192.0.2.0/28 to any port 22 proto tcp comment 'SSH admin'
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw enable
sudo ufw status verbose
```

**Docker + UFW gotcha:** Docker rewrites iptables when it starts containers
that publish ports. Traffic to `<vm-ip>:80` bypasses UFW's INPUT rules. In
practice on an internal LAN this is fine, but if IT wants strict source-IP
enforcement at the OS level, add this to `docker-compose.prod.yml` under
the nginx service to bind port 80 to one interface only:

```yaml
ports:
  - "<vm-lan-ip>:80:80"    # e.g. "192.0.2.42:80:80"
```

---

## Phase 7 — Smoke test from a real workstation [tech-pc]

**Why:** testing from the VM itself doesn't exercise the LAN path. Open a
browser on any hospital PC.

```
http://<vm-ip>/     or     http://relai.example.local/
```

Walk through:

1. [ ] Login as `admin@chu-valmont.fr / admin1234`
2. [ ] **IMMEDIATELY** change the admin password (sidebar "Mot de passe")
3. [ ] Navigate every page: Tickets, Équipements, Statistiques, Administration → Utilisateurs, Administration → Services
4. [ ] Services list looks clean — no duplicate entries
5. [ ] Create a test ticket, take it, resolve it
6. [ ] Verify it appears in Statistiques → "Résolus aujourd'hui"
7. [ ] Open an équipement, edit a field, confirm it shows up in "Historique des modifications" with human labels (not raw UUIDs)
8. [ ] Test the archive flow: open an équipement, click "Archiver" — confirms it disappears from the list
9. [ ] Test the delete flow (admin only): create a test équipement, click "Supprimer", confirm it's gone
10. [ ] If any tech uses **Basilisk** (Firefox 52 fork), test the login + one full ticket flow in it specifically

**If fonts look wrong / everything is Times New Roman:** the browser can't
reach the local font files. This shouldn't happen — fonts are self-hosted
inside the container. If it does, hard-refresh (Ctrl+Shift+R) and check the
Network tab for 404s on `/assets/*.woff2`.

**If you see "This page is in Quirks Mode" or an inline-script CSP error:**
you're looking at a 502 error page, not the app. Check
`docker compose … logs frontend nginx` — the frontend container probably
crashed.

---

## Phase 8 — Create real user accounts [tech-pc]

Administration → Utilisateurs. One account per tech who'll use the system.
Give each a temporary password; they change it on first login.

- Role `informaticien` — the IT team (can manage tickets, equipements)
- Role `demandeur` — service heads who can only file tickets
- Role `admin` — 1–2 people at most (only role that can hard-delete equipements)

Disable leftover demo accounts if any (`tech1@chu-valmont.fr`, etc.).

---

## Phase 9 — Nightly backups [server]

**Why:** hospital data is not worth losing. The backup script dumps
Postgres to a compressed file. The cron runs it nightly. **You must also
copy the dumps off the VM** — a backup on the same disk as the DB is not
a backup.

```bash
mkdir -p /opt/relai/backups

# Test the backup script runs cleanly
scripts/backup.sh test
ls -lh backups/

# Nightly at 02:00 + weekly cleanup of files > 30 days old
crontab -e
```

Add:

```cron
0 2 * * *  cd /opt/relai && scripts/backup.sh nightly
0 3 * * 0  find /opt/relai/backups -name "*.sql.gz" -mtime +30 -delete
```

**Off-VM copy** — pick one and add to cron:

```cron
# To the hospital shared file server (SMB)
30 2 * * *  cp /opt/relai/backups/nightly_$(date +\%Y-\%m-\%d).sql.gz /mnt/transfer-share/relai-backups/

# Or scp to another host (needs key-based ssh)
30 2 * * *  scp /opt/relai/backups/nightly_$(date +\%Y-\%m-\%d).sql.gz backup@<host>:/srv/relai/
```

### Test a restore before you leave

```bash
LATEST=$(ls -t backups/*.sql.gz | head -1)
docker run --rm -v "$PWD/$LATEST:/dump.sql.gz" -e POSTGRES_PASSWORD=test \
  postgres:16-alpine sh -c 'gunzip /dump.sql.gz && postgres &
    sleep 5 && psql -U postgres -f /dump.sql && echo OK'
```

If it prints `OK`, the dump is real. Backups you never test are backups
that don't work.

---

## Phase 10 — Leave a handover note [paper or shared doc]

Print or leave in a shared doc where the IT team will find it:

- **URL:** `http://<vm-ip>` (or `http://relai.example.local`)
- **VM location:** which host, which VM name in Hyper-V, who has console access
- **Reminder:** HTTP-only, internal LAN only — sensitive to eavesdropping if VLANs are misconfigured
- **Daily contact:** who restarts the VM if it freezes, who holds the admin password
- **Backups:** `/opt/relai/backups/` on the VM, copied to `<off-VM location>`, kept 30 days
- **Next deploy procedure:** `cd /opt/relai && git pull && scripts/deploy.sh`

---

## Phase 11 — Recovery cheat sheet

Print this and keep it near the VM.

### Backend won't start
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --tail=100 backend
```
Most common cause: bad `.env` (missing key, wrong DB URL) or Postgres not healthy yet.

### Site shows 502 Bad Gateway
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml restart nginx
```
Almost always nginx caching a dead upstream IP after a backend restart. The
custom error page (nginx/errors/50x.html) is what you're seeing meanwhile —
it's DOCTYPE'd, so no Quirks Mode warnings from the browser.

### Can't reach the site at all from a workstation
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps    # everything Up?
sudo ufw status                                                       # port 80 allowed?
ss -tlnp | grep :80                                                   # nginx listening?
```
Also: has IT applied the NGFW allow rule?

### Login returns 401 with the seeded admin
The admin password was changed and forgotten. SSH in and reset:
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec db \
  psql -U relai_user relai \
  -c "UPDATE users SET hashed_password = '<bcrypt-hash>' WHERE email = 'admin@chu-valmont.fr';"
```
Generate the bcrypt hash beforehand on your laptop:
```python
from app.core.security import hash_password
print(hash_password("new-password"))
```

### Roll back a bad deploy
```bash
cd /opt/relai
git log --oneline -5           # find the previous good commit
git checkout <previous-sha>
scripts/deploy.sh
# If the bad deploy ran a migration, restore the pre-deploy backup:
gunzip -c backups/predeploy_<timestamp>.sql.gz \
  | docker compose -f docker-compose.yml -f docker-compose.prod.yml \
      exec -T db psql -U relai_user relai
```

### Update the inventory
Edit `backend/seed_inventaire.py`, then:
```bash
git add backend/seed_inventaire.py
git commit -m "inventory: add row for <thing>"
scripts/deploy.sh
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec backend python seed_inventaire.py
```
The seed is idempotent — re-running only inserts new rows.

### Nuclear: start over (DESTROYS ALL DATA)
```bash
# Export a backup elsewhere first!
docker compose -f docker-compose.yml -f docker-compose.prod.yml down -v
scripts/deploy.sh --first
```

---

## After the deploy

- [ ] Take a fresh backup (`scripts/backup.sh post-deploy`)
- [ ] Next morning: verify the nightly cron ran (check `backups/`)
- [ ] Check disk usage in 1 week and 1 month to size capacity
- [ ] Schedule a follow-up review with the IT team after one week of use
