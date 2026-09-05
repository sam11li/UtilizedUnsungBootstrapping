# Ollama setup for the shared agent API

The project keeps VS Code and Kali Linux/Open Interpreter as separate environments. Both environments connect to the same Replit OpenAI-compatible API, which forwards inference to the configured Ollama server and reads the same shared memory.

## Default model

The configured default is:

```text
hf.co/ICEPVP8977/Uncensored_Qwen1.5_1.8B_Chat:Q4_K_M
```

On the machine that will host Ollama, install Ollama and run:

```bash
ollama pull hf.co/ICEPVP8977/Uncensored_Qwen1.5_1.8B_Chat:Q4_K_M
ollama run hf.co/ICEPVP8977/Uncensored_Qwen1.5_1.8B_Chat:Q4_K_M
```

`ollama pull` downloads the model. `ollama run` loads it for a conversation. Registering the reference in the dashboard does not claim that either operation has completed.

## Connect Replit to Ollama

Set these values in the Replit server environment. Use Replit Secrets for tokens and API keys:

| Variable | Required | Purpose |
| --- | --- | --- |
| `OLLAMA_BASE_URL` | Yes | A URL reachable from the Replit API server, such as a secured Ollama host or private network endpoint. Do not assume `localhost` when Ollama runs on another machine. |
| `AI_API_KEY` | Yes for `/api/v1` | Shared key used by VS Code and Open Interpreter. |
| `OLLAMA_MODEL` | No | Overrides the default model reference when intentionally switching models. |
| `OLLAMA_AUTH_TOKEN` | No | Bearer token when the secured Ollama endpoint requires one. |
| `OLLAMA_AUTOSTART` | No | Set to `true` to let the API server start Ollama when `OLLAMA_BASE_URL` points to localhost. |
| `OLLAMA_HOST` | No | Local Ollama bind address, normally `127.0.0.1:11434`. |
| `OLLAMA_MODELS` | No | Directory where Ollama stores downloaded model layers. |
| `AGENT_DATA_DIR` | No | Persistent directory for model registrations and shared memory. |

The dashboard's Settings page reports whether Ollama is reachable, the configured endpoint, whether the default model is downloaded, which model is loaded, and the last connection error. For a local Replit-hosted runtime, use `OLLAMA_AUTOSTART=true` so the API server starts Ollama when the app starts.

## Status meanings

- **Registered** — the reference is saved, but Ollama has not verified a downloaded model.
- **Downloading** — Ollama is actively processing a pull request.
- **Downloaded** — Ollama reports the model in `/api/tags`.
- **Loading** — the model is being prepared by the runtime.
- **Loaded** — Ollama reports the model in `/api/ps`.
- **Active** — the project has selected the verified model for new requests.
- **Error** — the endpoint is unavailable or Ollama returned an error.

## Shared API

The Replit server exposes the central API under `/api/v1`:

```text
GET  /api/v1/models
POST /api/v1/chat/completions
```

Send the shared `AI_API_KEY` as `Authorization: Bearer <key>` or `X-API-Key: <key>`. The server forwards chat requests to Ollama and supports both regular JSON responses and server-sent event streaming.

There are no application-level RPM, TPM, hourly, cooldown, or session limits. Actual capacity depends on the Replit server, Ollama host, and model hardware.

## Two separate environments

### VS Code on Windows

Configure the VS Code AI extension to use the Replit API base URL from Settings and the shared API key. VS Code remains the application-development environment.

### Kali Linux in VirtualBox

Install Open Interpreter inside the Kali VM, not on the Windows host. Configure it with the same Replit API base URL and API key. Kali remains a separate security-tooling environment.

## Kali Agent bridge

The dashboard can issue tasks to a connector that runs inside Kali. In Settings, generate a one-time pairing credential and copy the displayed values into Kali:

```bash
sudo apt update && sudo apt install -y python3
python3 -m pip install --user open-interpreter
export NORTHSTAR_API_BASE_URL="https://YOUR-REPLIT-DOMAIN/api"
export NORTHSTAR_AGENT_ID="kali-..."
export NORTHSTAR_AGENT_CREDENTIAL="northstar_..."
export NORTHSTAR_MODEL="hf.co/ICEPVP8977/Uncensored_Qwen1.5_1.8B_Chat:Q4_K_M"
python3 tools/kali-agent.py
```

The bridge makes outbound HTTPS requests only; it does not expose a Kali port publicly. It registers, sends heartbeats, polls authorized tasks, runs Open Interpreter locally, and posts results back. The credential is shown once and must be kept in Kali environment variables.

Both clients use the same active Ollama model and shared memory, while their local files and tools remain isolated.

## Troubleshooting

1. If the dashboard says Ollama is unavailable, confirm Ollama is running and that `OLLAMA_BASE_URL` is reachable from the Replit server.
2. If the default model says “Not verified,” run the `ollama pull` command on the Ollama host and test the connection again.
3. If the API returns `401`, check that the client is sending the same `AI_API_KEY` configured on the Replit server.
4. If the API returns `503`, inspect the dashboard's Ollama error and verify the model host, endpoint, and available CPU/RAM/storage.