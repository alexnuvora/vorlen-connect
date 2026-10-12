#!/usr/bin/env python3
"""Vorlen dedicated worker process.

Bootstrap mode: heartbeat + graceful shutdown only.
No platform sessions, browser automation, outreach or queue consumption are
enabled until there is an explicitly configured, reviewed provider adapter.
"""
import json
import os
import signal
import time
from datetime import datetime, timezone
from pathlib import Path

STOP = False


def stop(_signum, _frame):
    global STOP
    STOP = True


def heartbeat(path):
    payload = {
        "service": "vorlen-worker",
        "mode": "standby",
        "ready": True,
        "linkedin_actions_enabled": False,
        "last_heartbeat_utc": datetime.now(timezone.utc).isoformat(),
        "pid": os.getpid(),
    }
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(payload, sort_keys=True) + "\n", encoding="utf-8")
    tmp.replace(path)


def main():
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    location = Path(os.environ.get("VORLEN_WORKER_STATE_DIR", "/var/lib/vorlen-worker"))
    location.mkdir(parents=True, exist_ok=True)
    path = location / "status.json"
    print("vorlen-worker started (standby, no account automation)", flush=True)
    while not STOP:
        heartbeat(path)
        for _ in range(30):
            if STOP:
                break
            time.sleep(1)
    print("vorlen-worker stopped", flush=True)


if __name__ == "__main__":
    main()
