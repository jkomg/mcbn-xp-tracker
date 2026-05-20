import os, time, subprocess, requests, psutil
from flask import Flask, render_template, jsonify
from dotenv import load_dotenv

load_dotenv()
app = Flask(__name__)

HA_URL     = os.getenv('HA_URL', 'http://192.168.0.3:8123')
HA_TOKEN   = os.getenv('HA_TOKEN', '')
MCBN_URL   = os.getenv('MCBN_WEB_URL', '')
MCBN_TOKEN = os.getenv('MCBN_API_TOKEN', '')
QB_HOST    = os.getenv('QB_HOST', '127.0.0.1')
QB_PORT    = os.getenv('QB_PORT', '8080')
QB_USER    = os.getenv('QB_USER', 'admin')
QB_PASS    = os.getenv('QB_PASS', '')

REMOTE_AGENTS = {
    'miniplex': 'http://192.168.0.4:9101',
    'practica': 'http://192.168.0.5:9101',
}

def fetch_agent(url):
    try:
        r = requests.get(f'{url}/stats', timeout=3)
        d = r.json()
        d['online'] = True
        return d
    except Exception:
        return {'online': False}

def local_stats():
    cpu = psutil.cpu_percent(interval=0.5)
    vm  = psutil.virtual_memory()
    disks = []
    for p in psutil.disk_partitions(all=False):
        try:
            if p.mountpoint.startswith('/snap/'):
                continue
            u = psutil.disk_usage(p.mountpoint)
            disks.append({
                'mount':    p.mountpoint,
                'used_gb':  round(u.used  / 1024**3, 1),
                'total_gb': round(u.total / 1024**3, 1),
                'pct':      u.percent,
            })
        except PermissionError:
            continue
    return {
        'hostname':     'ursula',
        'cpu_pct':      cpu,
        'ram_pct':      vm.percent,
        'ram_used_gb':  round(vm.used  / 1024**3, 1),
        'ram_total_gb': round(vm.total / 1024**3, 1),
        'disk':         disks,
        'uptime_s':     int(time.time() - psutil.boot_time()),
        'online':       True,
    }

def fetch_ha():
    if not HA_TOKEN:
        return None
    try:
        hdrs = {'Authorization': f'Bearer {HA_TOKEN}', 'Content-Type': 'application/json'}
        r = requests.get(f'{HA_URL}/api/states', headers=hdrs, timeout=5)
        states = r.json()
        locks = [s for s in states if s['entity_id'].startswith('lock.')]
        door_classes = ('door', 'window', 'motion', 'smoke', 'moisture')
        alerts = [s for s in states
                  if s['entity_id'].startswith('binary_sensor.')
                  and s['state'] == 'on'
                  and s.get('attributes', {}).get('device_class') in door_classes]
        return {'locks': locks, 'alerts': alerts, 'online': True}
    except Exception:
        return {'online': False}

def bot_container_running():
    try:
        result = subprocess.run(
            ['docker', 'ps', '--filter', 'name=lasombra-bot', '--filter', 'status=running', '--format', '{{.Names}}'],
            capture_output=True, text=True, timeout=5
        )
        return 'lasombra-bot' in result.stdout
    except Exception:
        return None  # unknown

def fetch_bot():
    if not MCBN_URL or not MCBN_TOKEN:
        return None
    try:
        r = requests.get(f'{MCBN_URL}/api/bot-heartbeat',
                         headers={'Authorization': f'Bearer {MCBN_TOKEN}'}, timeout=5)
        d = r.json()
        d['online'] = True
        d['ursula_container'] = bot_container_running()
        return d
    except Exception:
        return {'online': False, 'ursula_container': bot_container_running()}

def fetch_downloads():
    try:
        s = requests.Session()
        s.post(f'http://{QB_HOST}:{QB_PORT}/api/v2/auth/login',
               data={'username': QB_USER, 'password': QB_PASS}, timeout=3)
        r = s.get(f'http://{QB_HOST}:{QB_PORT}/api/v2/torrents/info', timeout=3)
        torrents = r.json()
        active = [t for t in torrents if t['state'] in ('downloading', 'stalledDL', 'metaDL')]
        return {'torrents': active, 'total': len(torrents), 'online': True}
    except Exception:
        return {'online': False, 'torrents': [], 'total': 0}

def build_alerts(systems, bot, ha):
    alerts = []
    for name, s in systems.items():
        if not s.get('online'):
            alerts.append({'level': 'danger', 'msg': f'{name.capitalize()} is offline'})
            continue
        for d in s.get('disk', []):
            if d['pct'] > 90:
                alerts.append({'level': 'danger', 'msg': f'{name.capitalize()} disk {d["mount"]} at {d["pct"]}%'})
            elif d['pct'] > 80:
                alerts.append({'level': 'warning', 'msg': f'{name.capitalize()} disk {d["mount"]} at {d["pct"]}%'})
    if bot:
        age = bot.get('age_seconds')
        container = bot.get('ursula_container')
        if age is None or (isinstance(age, (int, float)) and age > 600):
            alerts.append({'level': 'danger', 'msg': 'Bot heartbeat stale — bot may be down'})
        if container is False:
            alerts.append({'level': 'warning', 'msg': 'Bot container not running on Ursula — failover may be active'})
    if ha and not ha.get('online'):
        alerts.append({'level': 'warning', 'msg': 'Home Assistant unreachable'})
    return alerts

@app.route('/api/status')
def api_status():
    systems = {'ursula': local_stats()}
    for name, url in REMOTE_AGENTS.items():
        systems[name] = fetch_agent(url)
    bot = fetch_bot()
    ha  = fetch_ha()
    return jsonify({
        'systems':   systems,
        'ha':        ha,
        'bot':       bot,
        'downloads': fetch_downloads(),
        'alerts':    build_alerts(systems, bot, ha),
        'ts':        int(time.time()),
    })

@app.route('/')
def index():
    return render_template('index.html')

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5050, debug=False)
