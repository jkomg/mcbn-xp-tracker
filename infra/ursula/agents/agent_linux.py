#!/usr/bin/env python3
# Ursula stats agent (Linux) — serves system metrics on port 9101
# Deploy to: /home/jkomg/agent.py
# Dependencies: pip3 install psutil  (or: sudo apt install python3-psutil)

import json, time, os
import psutil
from http.server import HTTPServer, BaseHTTPRequestHandler

PORT = int(os.getenv('AGENT_PORT', '9101'))


def collect():
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
        'hostname':     psutil.os.uname().nodename,
        'cpu_pct':      cpu,
        'ram_pct':      vm.percent,
        'ram_used_gb':  round(vm.used  / 1024**3, 1),
        'ram_total_gb': round(vm.total / 1024**3, 1),
        'disk':         disks,
        'uptime_s':     int(time.time() - psutil.boot_time()),
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
