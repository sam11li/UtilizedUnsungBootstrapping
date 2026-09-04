# Northstar AI Agent Control Center

Mobile-friendly control center for a shared Replit API that routes VS Code and Kali Linux/Open Interpreter requests to an Ollama model and shared agent memory.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Optional/runtime env: `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, `OLLAMA_AUTH_TOKEN`, `OLLAMA_AUTOSTART`, `OLLAMA_HOST`, `OLLAMA_MODELS`, `AI_API_KEY`, and `AGENT_DATA_DIR`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/ai-agent-dashboard` — responsive dashboard routes for overview, models, memory, and settings
- `artifacts/api-server/src/routes/control-center.ts` — model manager, Ollama status, shared memory, and OpenAI-compatible proxy
- `artifacts/api-server/src/lib/ollama.ts` — Ollama connection, pull, chat, and unload behavior
- `lib/api-spec/openapi.yaml` — source of truth for generated API hooks and validation schemas
- `docs/OLLAMA_SETUP.md` — setup and two-environment connection guide

## Architecture decisions

- Ollama is configured through environment variables; the server never assumes `localhost` for a remote model host.
- Model registration and model availability are separate states; the dashboard only reports downloaded/loaded after Ollama verifies them.
- VS Code and Kali Linux remain separate client environments while using the same Replit API, active model, and shared memory.
- The control center stores model registrations and shared memory in the configured persistent data directory.
- When `OLLAMA_AUTOSTART=true` and the endpoint is local, the API server starts Ollama automatically; remote Ollama endpoints are never overridden.

## Product

The app manages Ollama model references, pull progress, availability, activation, unload/remove actions, API connection details, runtime status, shared memory, and the environment selection flow for VS Code or Kali Linux.

## User preferences

The default Ollama model is `hf.co/ICEPVP8977/Uncensored_Qwen1.5_1.8B_Chat:Q4_K_M`.

## Gotchas

- Ollama must be installed and running on a host reachable from the Replit API server; registering a reference does not download it.
- Regenerate client and Zod code after every OpenAPI change with `pnpm --filter @workspace/api-spec run codegen`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
