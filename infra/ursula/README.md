# Ursula Infrastructure

Ursula (192.168.0.2) is the home server running the MCbN bot, a unified ops dashboard, and qBittorrent.
Miniplex (192.168.0.4) is a Mac Mini. Practica (192.168.0.5) is a Raspberry Pi.

## Network / SSH

```
Host ursula   → 192.168.0.2  (Ubuntu)
Host miniplex → 192.168.0.4  (macOS)
Host practica → 192.168.0.5  (Raspberry Pi, Ubuntu)
```

---

## 1. Ursula Dashboard (Ursula only)

Flask app on port 5050. Shows system stats for all three machines, Home Assistant locks, MCbN bot heartbeat, and active downloads.

### Deploy

```bash
ssh ursula
mkdir -p /home/jkomg/ursula/templates
# copy files
scp infra/ursula/dashboard/app.py jkomg@ursula:/home/jkomg/ursula/app.py
scp infra/ursula/dashboard/templates/index.html jkomg@ursula:/home/jkomg/ursula/templates/index.html
scp infra/ursula/dashboard/requirements.txt jkomg@ursula:/home/jkomg/ursula/requirements.txt

# venv + deps
ssh ursula "cd /home/jkomg/ursula && python3 -m venv venv && venv/bin/pip install -r requirements.txt"

# env file (copy .env.example, fill in secrets)
scp infra/ursula/dashboard/.env.example jkomg@ursula:/home/jkomg/ursula/.env
ssh ursula "nano /home/jkomg/ursula/.env"

# systemd service
sudo cp infra/ursula/systemd/ursula-dashboard.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ursula-dashboard
```

### Update dashboard after code changes

```bash
scp infra/ursula/dashboard/app.py jkomg@ursula:/home/jkomg/ursula/app.py
scp infra/ursula/dashboard/templates/index.html jkomg@ursula:/home/jkomg/ursula/templates/index.html
ssh ursula "sudo systemctl restart ursula-dashboard"
```

---

## 2. Stats Agents

Each machine runs a lightweight HTTP agent on port 9101 that the dashboard polls for CPU/RAM/disk/uptime.

### Practica (Pi — Linux)

```bash
sudo apt install python3-psutil
scp infra/ursula/agents/agent_linux.py jkomg@practica:/home/jkomg/agent.py

# systemd
scp infra/ursula/systemd/ursula-agent.service jkomg@practica:/tmp/ursula-agent.service
ssh practica "sudo cp /tmp/ursula-agent.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now ursula-agent"
```

### Miniplex (macOS)

```bash
scp infra/ursula/agents/agent_mac.py jkomg@miniplex:/Users/jkomg/agent.py

# launchd
scp infra/ursula/launchd/com.ursula.agent.plist jkomg@miniplex:/Users/jkomg/Library/LaunchAgents/com.ursula.agent.plist
ssh miniplex "launchctl load /Users/jkomg/Library/LaunchAgents/com.ursula.agent.plist"
```

Check it's running: `curl http://192.168.0.4:9101/stats`

---

## 3. MCbN Bot (Ursula)

The bot runs as a Docker container (`lasombra-bot`) managed by Docker CE.

```bash
ssh ursula
cd /home/jkomg/mcbn-xp-tracker/apps/bot
# ensure .env is present (copy from apps/bot/.env.example, fill secrets)
docker compose up -d --build
docker compose logs -f
```

Bot must have `WEB_APP_BASE_URL=http://web:5001` if running alongside the web container,
or `WEB_APP_BASE_URL=https://mcbn.jkomg.us` if pointing to production Cloud Run.

### Docker install (if needed)

```bash
sudo apt update && sudo apt install -y docker.io
sudo usermod -aG docker jkomg
# log out and back in for group to take effect
```

---

## 4. Mac Failover (little-mac)

Currently deployed on `little-mac` (192.168.0.63), not Miniplex — update this if the failover host changes again. A launchd job runs every 5 minutes. If Ursula's bot heartbeat goes stale (>10 min), it starts the bot locally via OrbStack. When Ursula recovers, it stops the local copy automatically.

```bash
# Install script
sudo cp infra/ursula/failover/lasombra-failover.sh /usr/local/bin/lasombra-failover.sh
sudo chmod +x /usr/local/bin/lasombra-failover.sh

# Install launchd plist (runs as user agent)
cp infra/ursula/launchd/com.mcbn.lasombra-failover.plist \
   ~/Library/LaunchAgents/com.mcbn.lasombra-failover.plist
launchctl load ~/Library/LaunchAgents/com.mcbn.lasombra-failover.plist
```

Logs: `tail -f /tmp/lasombra-failover.log`

**Note:** The failover script contains `MCBN_TOKEN` — treat it as a secret. Do not commit the deployed copy with real credentials. Fill in your real token in the deployed copy — the version in this repo uses a placeholder.

**`BOT_DIR` in the deployed copy must match the actual local clone path on the failover host.** A wrong path here silently no-ops the whole mechanism (the `cd && docker compose ...` chain short-circuits on a failed `cd`) while still logging as if it worked — this is exactly what happened on 2026-07-22/23: the script pointed at a stale path for an unknown length of time, meaning failover never actually triggered despite logging "starting local failover bot" every 5 minutes. If you re-clone or move the repo on the failover host, update `BOT_DIR` in the deployed script.

---

## 5. Firewall / Port Summary

| Port | Service | Host |
|------|---------|------|
| 5050 | Ursula dashboard | Ursula |
| 9101 | Stats agent | Ursula, Miniplex, Practica |
| 8080 | qBittorrent web UI | Ursula |
| 8123 | Home Assistant | HA box (192.168.0.3) |

All services are LAN-only. Dashboard is not exposed externally.
