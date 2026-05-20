#!/usr/bin/env python3
# Ursula stats agent (macOS) — no external dependencies
import json, time, os, subprocess
from http.server import HTTPServer, BaseHTTPRequestHandler

PORT = int(os.getenv('AGENT_PORT', '9101'))

def run(cmd):
    return subprocess.check_output(cmd, shell=True, text=True).strip()

def collect():
    # CPU
    try:
        out = run("top -l 2 -s 0 -n 0 | grep 'CPU usage' | tail -1")
        idle = float(out.split('% idle')[0].split(', ')[-1].strip())
        cpu_pct = round(100 - idle, 1)
    except Exception:
        cpu_pct = 0.0

    # RAM via vm_stat
    try:
        vm = run("vm_stat")
        page_size = 4096
        stats = {}
        for line in vm.split('\n'):
            if ':' in line:
                k, v = line.split(':', 1)
                try:
                    stats[k.strip()] = int(v.strip().rstrip('.'))
                except ValueError:
                    pass
        used = (stats.get('Pages active', 0) + stats.get('Pages wired down', 0)) * page_size
        total = int(run("sysctl -n hw.memsize"))
        ram_pct     = round(used / total * 100, 1)
        ram_used_gb = round(used  / 1024**3, 1)
        ram_total_gb= round(total / 1024**3, 1)
    except Exception:
        ram_pct = ram_used_gb = ram_total_gb = 0.0

    # Disk — root + /Volumes/* only, skip APFS system volumes
    disks = []
    try:
        for line in run("df -k").split('\n')[1:]:
            parts = line.split()
            if len(parts) < 6:
                continue
            mount = parts[-1]
            if mount.startswith('/System/') or mount.startswith('/dev'):
                continue
            if parts[0].startswith(('devfs', 'map ')):
                continue
            try:
                disks.append({
                    'mount':    mount,
                    'used_gb':  round(int(parts[2]) / 1024**2, 1),
                    'total_gb': round(int(parts[1]) / 1024**2, 1),
                    'pct':      float(parts[4].rstrip('%')),
                })
            except ValueError:
                continue
    except Exception:
        pass

    # Uptime
    try:
        sec = int(run("sysctl -n kern.boottime").split('sec = ')[1].split(',')[0])
        uptime_s = int(time.time()) - sec
    except Exception:
        uptime_s = 0

    return {
        'hostname':     run("hostname -s"),
        'cpu_pct':      cpu_pct,
        'ram_pct':      ram_pct,
        'ram_used_gb':  ram_used_gb,
        'ram_total_gb': ram_total_gb,
        'disk':         disks,
        'uptime_s':     uptime_s,
    }

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/stats':
            body = json.dumps(collect()).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_response(404)
            self.end_headers()
    def log_message(self, *a): pass

HTTPServer(('0.0.0.0', PORT), Handler).serve_forever()
