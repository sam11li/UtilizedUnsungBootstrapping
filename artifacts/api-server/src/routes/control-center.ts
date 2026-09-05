import { randomUUID, timingSafeEqual } from "node:crypto";
import os from "node:os";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  ActivateModelBody,
  ActivateModelResponse,
  CreateChatCompletionBody,
  CreateChatCompletionResponse,
  CreateMemoryBody,
  CreateMemoryResponse,
  DownloadModelBody,
  DownloadModelResponse,
  GetActiveModelResponse,
  GetDashboardResponse,
  GetModelStatusResponse,
  GetOllamaStatusResponse,
  GetSystemStatusResponse,
  ListMemoryResponse,
  ListModelsResponse,
  ListOpenAiModelsResponse,
  RemoveModelParams,
} from "@workspace/api-zod";
import {
  checkOllama,
  OllamaUnavailableError,
  ollamaChat,
  pullOllamaModel,
  unloadOllamaModel,
} from "../lib/ollama";
import {
  type ModelRecord,
  persistStore,
  store,
} from "../lib/control-store";
import {
  DEFAULT_OLLAMA_MODEL,
  getOllamaModel,
  isApiKeyConfigured,
} from "../lib/runtime-config";
import {
  type AgentTask,
  claimNextTask,
  completeAgentTask,
  createPairing,
  getAgentStatus,
  getAgentTask,
  isAgentAuthenticated,
  queueAgentTask,
  registerAgent,
  revokeAgent,
} from "../lib/agent-bridge";

const router: IRouter = Router();
const pullJobs = new Map<
  string,
  { progress: number; message: string; error?: string }
>();

function normalizeOllamaReference(value: string): string {
  return value.trim().replace(/^ollama\s+(?:run|pull)\s+/i, "").replace(/\/+$/, "");
}

function isSupportedModelReference(value: string): boolean {
  const reference = normalizeOllamaReference(value);
  return /^hf\.co\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?::[A-Za-z0-9_.-]+)?$/.test(
    reference,
  );
}

function modelName(repository: string): string {
  const normalized = normalizeOllamaReference(repository);
  if (normalized === DEFAULT_OLLAMA_MODEL) {
    return "Uncensored_Qwen1.5_1.8B_Chat Q4_K_M";
  }
  return normalized.replace(/^hf\.co\//, "");
}

function now(): string {
  return new Date().toISOString();
}

function modelIsAvailable(
  model: ModelRecord,
  names: Set<string>,
): boolean {
  return names.has(model.repository);
}

async function refreshModels(): Promise<void> {
  const snapshot = await checkOllama();
  const names = new Set(snapshot.models.map((model) => model.name ?? ""));
  const loadedName = snapshot.activeModel;

  for (const model of store.models) {
    const job = pullJobs.get(model.id);
    if (job) {
      model.status = job.error ? "error" : "downloading";
      model.progress = job.progress;
      model.updatedAt = now();
      continue;
    }

    const available = snapshot.available && modelIsAvailable(model, names);
    if (!available) {
      model.status =
        snapshot.endpoint && !snapshot.available ? "error" : "registered";
      model.progress = 0;
      continue;
    }

    if (model.active) {
      model.status = "active";
    } else if (loadedName === model.repository) {
      model.status = "loaded";
    } else {
      model.status = "downloaded";
    }
  }
}

function apiKeyMatches(req: Request): boolean {
  const expected = process.env.AI_API_KEY?.trim();
  if (!expected) return false;
  const provided =
    req.header("x-api-key") ??
    req.header("authorization")?.replace(/^Bearer\s+/i, "");
  if (!provided) return false;
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  return (
    expectedBuffer.length === providedBuffer.length &&
    timingSafeEqual(expectedBuffer, providedBuffer)
  );
}

function requireApiKey(req: Request, res: Response): boolean {
  if (!isApiKeyConfigured()) {
    res.status(503).json({
      error: "AI_API_KEY is not configured in the server environment.",
    });
    return false;
  }
  if (!apiKeyMatches(req)) {
    res.status(401).json({ error: "Missing or invalid API key." });
    return false;
  }
  return true;
}

function openAiModel(model: ModelRecord) {
  return {
    id: model.repository,
    object: "model",
    created: Math.floor(new Date(model.updatedAt).getTime() / 1000),
    ownedBy: "ollama",
  };
}

router.get("/dashboard", async (_req, res): Promise<void> => {
  await refreshModels();
  const activeModel = store.models.find((model) => model.active);
  res.json(
    GetDashboardResponse.parse({
      installedModels: store.models.length,
      readyModels: store.models.filter((model) =>
        ["downloaded", "loaded", "active"].includes(model.status),
      ).length,
      activeModel: activeModel?.name ?? null,
      memoryEntries: store.memory.length,
      apiEndpoint: "/api/v1",
      apiStatus: isApiKeyConfigured() ? "ready" : "key required",
      apiKeyConfigured: isApiKeyConfigured(),
      defaultModel: getOllamaModel(),
    }),
  );
});

router.get("/models", async (_req, res): Promise<void> => {
  await refreshModels();
  res.json(ListModelsResponse.parse(store.models));
});

router.post("/models/download", async (req, res): Promise<void> => {
  const parsed = DownloadModelBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn(
      { errors: parsed.error.message },
      "Invalid model download request",
    );
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (!isSupportedModelReference(parsed.data.repository)) {
    res.status(400).json({
      error:
        "Enter an Ollama model reference or command, for example ollama pull hf.co/ICEPVP8977/Uncensored_Qwen1.5_1.8B_Chat:Q4_K_M",
    });
    return;
  }

  const repository = normalizeOllamaReference(parsed.data.repository);
  const existing = store.models.find((model) => model.repository === repository);
  if (existing) {
    await refreshModels();
    res.status(202).json(DownloadModelResponse.parse(existing));
    return;
  }

  const model: ModelRecord = {
    id: randomUUID(),
    name: modelName(repository),
    repository,
    parameters: repository === DEFAULT_OLLAMA_MODEL ? "1.8B" : null,
    format: "Ollama / GGUF",
    status: "registered",
    progress: 0,
    active: false,
    isDefault: false,
    size: null,
    updatedAt: now(),
  };
  store.models.push(model);
  persistStore();

  const snapshot = await checkOllama();
  if (snapshot.available) {
    model.status = "downloading";
    pullJobs.set(model.id, {
      progress: 0,
      message: "Starting Ollama pull.",
    });
    persistStore();
    void pullOllamaModel(repository, (progress, message) => {
      const job = pullJobs.get(model.id);
      if (!job) return;
      job.progress = progress;
      job.message = message;
      model.progress = progress;
      model.updatedAt = now();
    })
      .then(() => {
        pullJobs.delete(model.id);
        model.status = "downloaded";
        model.progress = 100;
        model.updatedAt = now();
        persistStore();
      })
      .catch((error: unknown) => {
        pullJobs.delete(model.id);
        model.status = "error";
        model.progress = 0;
        model.updatedAt = now();
        persistStore();
        req.log.error(
          { modelId: model.id, error },
          "Ollama model pull failed",
        );
      });
  }

  req.log.info({ modelId: model.id, repository }, "Model registration created");
  res.status(202).json(DownloadModelResponse.parse(model));
});

router.post("/models/activate", async (req, res): Promise<void> => {
  const parsed = ActivateModelBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const model = store.models.find((candidate) => candidate.id === parsed.data.modelId);
  if (!model) {
    res.status(404).json({ error: "Model not found" });
    return;
  }

  const snapshot = await checkOllama();
  if (!snapshot.available) {
    res.status(400).json({
      error: snapshot.error ?? "Ollama is unavailable at the configured endpoint.",
    });
    return;
  }
  if (!modelIsAvailable(model, new Set(snapshot.models.map((item) => item.name ?? "")))) {
    res.status(400).json({
      error: `Model is not downloaded in Ollama yet. Run ollama pull ${model.repository}.`,
    });
    return;
  }

  for (const candidate of store.models) {
    candidate.active = candidate.id === model.id;
  }
  model.status = "active";
  model.updatedAt = now();
  persistStore();
  res.json(ActivateModelResponse.parse(model));
});

router.post("/models/unload", async (req, res): Promise<void> => {
  const parsed = ActivateModelBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const model = store.models.find((candidate) => candidate.id === parsed.data.modelId);
  if (!model) {
    res.status(404).json({ error: "Model not found" });
    return;
  }

  try {
    await unloadOllamaModel(model.repository);
    model.active = false;
    model.status = "downloaded";
    model.updatedAt = now();
    persistStore();
    res.json(ActivateModelResponse.parse(model));
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Could not unload model.",
    });
  }
});

router.delete("/models/:modelId", (req, res): void => {
  const parsed = RemoveModelParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const index = store.models.findIndex((model) => model.id === parsed.data.modelId);
  if (index < 0) {
    res.status(404).json({ error: "Model not found" });
    return;
  }
  if (store.models[index].active) {
    res.status(400).json({ error: "Unload the active model before removing it" });
    return;
  }

  store.models.splice(index, 1);
  persistStore();
  res.sendStatus(204);
});

router.get("/models/active", async (_req, res): Promise<void> => {
  await refreshModels();
  const model = store.models.find((candidate) => candidate.active);
  res.json(GetActiveModelResponse.parse(model ?? null));
});

router.get("/models/status", async (_req, res): Promise<void> => {
  await refreshModels();
  const downloading = store.models.find((model) => pullJobs.has(model.id));
  const active = store.models.find((model) => model.active);
  const current = downloading ?? active ?? store.models.find((model) => model.isDefault);
  const status = current?.status ?? "registered";
  const state = current?.status ?? "registered";
  const message = downloading
    ? pullJobs.get(downloading.id)?.message ?? "Downloading through Ollama."
    : status === "registered"
      ? "Model registered. Install and run Ollama on the model host, then pull this model."
      : status === "error"
        ? "Ollama is unavailable or returned an error."
        : active
          ? `${active.name} is the active model.`
          : `${current?.name ?? "No model"} is ${status}.`;

  res.json(
    GetModelStatusResponse.parse({
      state,
      message,
      progress: current?.progress ?? 0,
      modelId: current?.id ?? null,
    }),
  );
});

router.get("/ollama/status", async (_req, res): Promise<void> => {
  const status = await checkOllama();
  res.json(GetOllamaStatusResponse.parse(status));
});

router.post("/ollama/test", async (_req, res): Promise<void> => {
  const status = await checkOllama();
  res.json(GetOllamaStatusResponse.parse(status));
});

router.post("/diagnostics/test", async (_req, res): Promise<void> => {
  const ollama = await checkOllama();
  let inference: { status: "success" | "failed" | "skipped"; message: string } = {
    status: "skipped",
    message: "Inference skipped because Ollama/model is unavailable.",
  };
  if (ollama.available && ollama.modelAvailable) {
    try {
      const response = await ollamaChat({
        model: getOllamaModel(),
        messages: [{ role: "user", content: "Reply with exactly: Northstar test passed." }],
        stream: false,
        options: { temperature: 0, num_predict: 32 },
      });
      inference = response.ok
        ? { status: "success", message: "Model inference succeeded." }
        : { status: "failed", message: `Model returned HTTP ${response.status}.` };
    } catch (error) {
      inference = { status: "failed", message: error instanceof Error ? error.message : "Inference failed." };
    }
  }
  res.json({
    api: {
      status: isApiKeyConfigured() ? "connected" : "not_configured",
      keyConfigured: isApiKeyConfigured(),
      message: isApiKeyConfigured()
        ? "Protected API key is configured."
        : "Set AI_API_KEY in Replit Secrets to enable external clients.",
    },
    ollama: {
      status: ollama.available ? "connected" : "disconnected",
      message: ollama.message,
    },
    model: {
      status: ollama.modelAvailable ? (ollama.activeModel ? "loaded" : "available") : "unavailable",
      reference: getOllamaModel(),
    },
    inference,
    testedAt: now(),
  });
});

router.get("/agents/status", (_req, res): void => {
  const agent = getAgentStatus();
  res.json({
    agent: agent ?? {
      agentId: null,
      name: "Kali Linux",
      status: "offline",
      lastSeen: null,
      connectedAt: null,
    },
  });
});

router.post("/agents/pair", (_req, res): void => {
  res.status(201).json(createPairing());
});

router.post("/agents/register", (req, res): void => {
  const { agentId, credential, name } = req.body as Record<string, unknown>;
  if (typeof agentId !== "string" || typeof credential !== "string") {
    res.status(400).json({ error: "agentId and credential are required." });
    return;
  }
  if (!registerAgent(agentId, credential, typeof name === "string" ? name : "Kali Linux")) {
    res.status(401).json({ error: "Invalid or expired pairing credential." });
    return;
  }
  res.json({ ok: true, agentId, status: "online" });
});

router.post("/agents/heartbeat", (req, res): void => {
  const { agentId, credential } = req.body as Record<string, unknown>;
  if (typeof agentId !== "string" || typeof credential !== "string" || !getAgentStatus()) {
    res.status(401).json({ error: "Agent authentication failed." });
    return;
  }
  const task = claimNextTask(agentId, credential);
  res.json({ ok: true, task });
});

router.get("/agents/tasks", (req, res): void => {
  const agentId = String(req.query.agentId ?? "");
  const credential = String(req.query.credential ?? "");
  if (!isAgentAuthenticated(agentId, credential)) {
    res.status(401).json({ error: "Agent authentication failed." });
    return;
  }
  const task = claimNextTask(agentId, credential);
  res.json({ task });
});

router.get("/agents/tasks/:taskId", (req, res): void => {
  const task = getAgentTask(req.params.taskId);
  if (!task) {
    res.status(404).json({ error: "Task not found." });
    return;
  }
  res.json(task);
});

router.post("/agents/tasks", (req, res): void => {
  const agent = getAgentStatus();
  if (!agent || agent.status !== "online") {
    res.status(409).json({ error: "Kali Agent is offline." });
    return;
  }
  const body = req.body as { messages?: AgentTask["messages"]; model?: string };
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    res.status(400).json({ error: "messages are required." });
    return;
  }
  res.status(202).json(queueAgentTask(body.messages, body.model ?? null));
});

router.post("/agents/tasks/:taskId/result", (req, res): void => {
  const { agentId, credential, result, error } = req.body as Record<string, unknown>;
  if (typeof agentId !== "string" || typeof credential !== "string" || typeof result !== "string") {
    res.status(400).json({ error: "agentId, credential, and result are required." });
    return;
  }
  if (!completeAgentTask(req.params.taskId, agentId, credential, result, typeof error === "string" ? error : null)) {
    res.status(401).json({ error: "Agent authentication failed or task is missing." });
    return;
  }
  res.json({ ok: true });
});

router.post("/agents/revoke", (req, res): void => {
  const { agentId } = req.body as Record<string, unknown>;
  if (typeof agentId !== "string" || !revokeAgent(agentId)) {
    res.status(404).json({ error: "Agent not found." });
    return;
  }
  res.json({ ok: true });
});

router.get("/system", (_req, res): void => {
  const totalMemory = os.totalmem();
  const usedMemory = totalMemory - os.freemem();
  const cpuLoad = Math.min(
    100,
    Math.round((os.loadavg()[0] / Math.max(os.cpus().length, 1)) * 100),
  );
  res.json(
    GetSystemStatusResponse.parse({
      server: "online",
      api: isApiKeyConfigured() ? "ready" : "key required",
      cpu: cpuLoad,
      memory: Math.round((usedMemory / totalMemory) * 100),
      storage: 0,
      uptime: `${Math.floor(process.uptime() / 60)} min`,
    }),
  );
});

router.get("/memory", (_req, res): void => {
  res.json(ListMemoryResponse.parse(store.memory));
});

router.post("/memory", (req, res): void => {
  const parsed = CreateMemoryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const entry = {
    id: randomUUID(),
    title: parsed.data.title,
    content: parsed.data.content,
    category: parsed.data.category,
    updatedAt: now(),
  };
  store.memory.unshift(entry);
  persistStore();
  res.status(201).json(CreateMemoryResponse.parse(entry));
});

// The dashboard uses a same-origin route so its browser UI never needs access
// to the shared AI_API_KEY used by external VS Code/Kali clients.
router.post("/chat", async (req, res): Promise<void> => {
  const parsed = CreateChatCompletionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const requestedModel =
    parsed.data.model ?? store.models.find((model) => model.active)?.repository ?? getOllamaModel();
  const ollamaBody = {
    model: requestedModel,
    messages: parsed.data.messages,
    stream: false,
    ...(parsed.data.temperature === undefined
      ? {}
      : { options: { temperature: parsed.data.temperature } }),
    ...(parsed.data.max_tokens === undefined
      ? {}
      : {
          options: {
            num_predict: parsed.data.max_tokens,
            ...(parsed.data.temperature === undefined
              ? {}
              : { temperature: parsed.data.temperature }),
          },
        }),
  };

  try {
    const upstream = await ollamaChat(ollamaBody);
    if (!upstream.ok) {
      res.status(503).json({
        error:
          (await upstream.text()) ||
          `Ollama returned HTTP ${upstream.status}.`,
      });
      return;
    }

    const data = (await upstream.json()) as {
      model?: string;
      message?: { role?: string; content?: string };
      prompt_eval_count?: number;
      eval_count?: number;
    };
    res.json(
      CreateChatCompletionResponse.parse({
        id: `chatcmpl-${randomUUID()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: data.model ?? requestedModel,
        choices: [
          {
            index: 0,
            message: {
              role: data.message?.role ?? "assistant",
              content: data.message?.content ?? "",
            },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: data.prompt_eval_count ?? 0,
          completion_tokens: data.eval_count ?? 0,
          total_tokens:
            (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
        },
      }),
    );
  } catch (error) {
    if (error instanceof OllamaUnavailableError) {
      res.status(503).json({ error: error.message });
      return;
    }
    req.log.error({ error }, "Dashboard chat completion failed");
    res.status(503).json({ error: "Ollama inference failed." });
  }
});

router.get("/v1/models", async (req, res): Promise<void> => {
  if (!requireApiKey(req, res)) return;
  const snapshot = await checkOllama();
  const models = store.models.filter((model) =>
    modelIsAvailable(model, new Set(snapshot.models.map((item) => item.name ?? ""))),
  );
  res.json(
    ListOpenAiModelsResponse.parse({
      object: "list",
      data: models.map(openAiModel),
    }),
  );
});

router.post("/v1/chat/completions", async (req, res): Promise<void> => {
  if (!requireApiKey(req, res)) return;
  const parsed = CreateChatCompletionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const requestedModel = parsed.data.model ?? getOllamaModel();
  const ollamaBody = {
    model: requestedModel,
    messages: parsed.data.messages,
    stream: parsed.data.stream ?? false,
    ...(parsed.data.temperature === undefined
      ? {}
      : { options: { temperature: parsed.data.temperature } }),
    ...(parsed.data.max_tokens === undefined
      ? {}
      : {
          options: {
            num_predict: parsed.data.max_tokens,
            ...(parsed.data.temperature === undefined
              ? {}
              : { temperature: parsed.data.temperature }),
          },
        }),
  };

  try {
    const upstream = await ollamaChat(ollamaBody);
    if (!upstream.ok || !upstream.body) {
      res.status(503).json({
        error:
          (await upstream.text()) ||
          `Ollama returned HTTP ${upstream.status}.`,
      });
      return;
    }

    if (parsed.data.stream) {
      res.status(200);
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      const reader = upstream.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const completionId = `chatcmpl-${randomUUID()}`;
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as {
            model?: string;
            message?: { role?: string; content?: string };
            done?: boolean;
          };
          res.write(
            `data: ${JSON.stringify({
              id: completionId,
              object: "chat.completion.chunk",
              created: Math.floor(Date.now() / 1000),
              model: event.model ?? requestedModel,
              choices: [
                {
                  index: 0,
                  delta: {
                    role: event.message?.role,
                    content: event.message?.content ?? "",
                  },
                  finish_reason: event.done ? "stop" : null,
                },
              ],
            })}\n\n`,
          );
        }
        if (done) break;
      }
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }

    const data = (await upstream.json()) as {
      model?: string;
      message?: { role?: string; content?: string };
      prompt_eval_count?: number;
      eval_count?: number;
    };
    res.json(
      CreateChatCompletionResponse.parse({
        id: `chatcmpl-${randomUUID()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: data.model ?? requestedModel,
        choices: [
          {
            index: 0,
            message: {
              role: data.message?.role ?? "assistant",
              content: data.message?.content ?? "",
            },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: data.prompt_eval_count ?? 0,
          completion_tokens: data.eval_count ?? 0,
          total_tokens:
            (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
        },
      }),
    );
  } catch (error) {
    if (error instanceof OllamaUnavailableError) {
      res.status(503).json({ error: error.message });
      return;
    }
    req.log.error({ error }, "Chat completion failed");
    res.status(503).json({ error: "Ollama inference failed." });
  }
});

export default router;