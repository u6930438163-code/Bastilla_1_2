#!/usr/bin/env python3
"""Adapted from the user's earlier bastilla_chatgpt_adapter.py.
Local diagnostics by default; --dispatch sends the EXACT mission to the authenticated
Bastilla live-chat API only when a real deployment and credentials are provided.
Does not claim that any original AI has accepted or executed the mission.
"""
import argparse
import json
import os
import platform
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib import request, error, parse

REPOSITORY = "u6930438163-code/Bastilla_1_2"
INSTRUCTION = "ulepsz I zaktualizuj system maksymalnie"
AGENTS = ("Aria", "Alex", "Astyria", "Aurelius")

def version(cmd):
    path = shutil.which(cmd)
    if not path:
        return {"available": False}
    try:
        result = subprocess.run([path, "--version"], capture_output=True, text=True, timeout=4, check=False)
        return {"available": True, "version": (result.stdout or result.stderr).strip().splitlines()[0][:160]}
    except Exception as exc:
        return {"available": True, "error": type(exc).__name__}

def dispatch():
    base = os.environ.get("BASTILLA_LIVE_CHAT_BASE_URL", "").rstrip("/")
    password = os.environ.get("BASTILLA_LIVE_CHAT_USER_PASSWORD", "")
    if not base.startswith("https://") and not base.startswith("http://localhost:"):
        raise ValueError("Provide an authenticated HTTPS Bastilla deployment URL")
    if len(password) < 16:
        raise ValueError("Provide the operator password via environment, not CLI")
    import http.cookiejar
    jar = http.cookiejar.CookieJar()
    opener = request.build_opener(request.HTTPCookieProcessor(jar))
    def post(path, payload):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        req = request.Request(base + path, data=data, headers={"Content-Type": "application/json", "Origin": base}, method="POST")
        with opener.open(req, timeout=20) as response:
            return json.load(response)
    # Check server's session.login contract before production use.
    post("/api/live-chat/session", {"password": password})
    result = post("/api/live-chat/messages", {"channel": "Wszyscy", "text": INSTRUCTION})
    return {"queuedFor": result.get("queuedFor", []), "queued": result.get("queued", [])}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dispatch", action="store_true", help="Send mission to authenticated live-chat deployment")
    args = parser.parse_args()
    report = {
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "repository": REPOSITORY,
        "instruction": INSTRUCTION,
        "agents": AGENTS,
        "python": sys.version.split()[0],
        "platform": platform.platform(),
        "tools": {name: version(name) for name in ("python3", "node", "npm", "git")},
        "dispatch_attempted": args.dispatch,
        "dispatch_confirmed": False,
        "agent_execution_verified": False,
    }
    if args.dispatch:
        try:
            report["dispatch_response"] = dispatch()
            report["dispatch_confirmed"] = True
        except (ValueError, error.URLError, error.HTTPError, TimeoutError) as exc:
            report["dispatch_error"] = type(exc).__name__ + ": " + str(exc)[:200]
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if not args.dispatch or report["dispatch_confirmed"] else 1

if __name__ == "__main__":
    raise SystemExit(main())
