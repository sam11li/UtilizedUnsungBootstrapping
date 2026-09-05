#!/usr/bin/env python3
"""Northstar Kali bridge: register, heartbeat, poll tasks, and run Open Interpreter locally."""

import json
import os
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request

API_BASE_URL = os.environ["NORTHSTAR_API_BASE_URL"].rstrip("/")
AGENT_ID = os.environ["NORTHSTAR_AGENT_ID"]
CREDENTIAL = os.environ["NORTHSTAR_AGENT_CREDENTIAL"]
AGENT_NAME = os.environ.get("NORTHSTAR_AGENT_NAME", "Kali Linux")
MODEL = os.environ.get("NORTHSTAR_MODEL", "hf.co/ICEPVP8977/Uncensored_Qwen1.5_1.8B_Chat:Q4_K_M")


def request(path, method="GET", body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        f"{API_BASE_URL}{path}",
        data=data,
        method=method,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.loads(response.read().decode())


def run_interpreter(messages):
    prompt = "\n\n".join(f"{item['role'].upper()}: {item['content']}" for item in messages)
    env = os.environ.copy()
    env["OPENAI_API_BASE"] = API_BASE_URL
    env["OPENAI_API_KEY"] = CREDENTIAL
    command = [
        "interpreter",
        "--model",
        MODEL,
        "--api_base",
        API_BASE_URL,
        "--api_key",
        CREDENTIAL,
        "--no-stream",
    ]
    completed = subprocess.run(command, input=prompt, text=True, capture_output=True, env=env, timeout=600)
    if completed.returncode:
        raise RuntimeError(completed.stderr.strip() or "Open Interpreter failed.")
    return completed.stdout.strip()


def main():
    request("/agents/register", "POST", {"agentId": AGENT_ID, "credential": CREDENTIAL, "name": AGENT_NAME})
    print(f"Northstar Kali Agent online: {AGENT_ID}", flush=True)
    while True:
        try:
            result = request(
                "/agents/heartbeat",
                "POST",
                {"agentId": AGENT_ID, "credential": CREDENTIAL},
            )
            task = result.get("task")
            if task:
                try:
                    output = run_interpreter(task["messages"])
                    request(
                        f"/agents/tasks/{task['id']}/result",
                        "POST",
                        {"agentId": AGENT_ID, "credential": CREDENTIAL, "result": output},
                    )
                except Exception as error:
                    request(
                        f"/agents/tasks/{task['id']}/result",
                        "POST",
                        {"agentId": AGENT_ID, "credential": CREDENTIAL, "result": "", "error": str(error)},
                    )
            time.sleep(3)
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as error:
            print(f"Northstar bridge reconnecting: {error}", flush=True)
            time.sleep(5)


if __name__ == "__main__":
    main()