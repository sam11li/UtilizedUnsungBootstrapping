import { getOllamaBaseUrl, getOllamaModel } from "./runtime-config";

type OllamaTag = {
  name?: string;
  size?: number;
};

type OllamaListResponse = {
  models?: OllamaTag[];
};

type OllamaProcessResponse = {
  models?: OllamaTag[];
};

export type OllamaSnapshot = {
  available: boolean;
  endpoint: string | null;
  version: string | null;
  message: string;
  modelAvailable: boolean;
  activeModel: string | null;
  error: string | null;
  models: OllamaTag[];
};

export class OllamaUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OllamaUnavailableError";
  }
}

function authHeaders(): Record<string, string> {
  const token = process.env.OLLAMA_AUTH_TOKEN?.trim();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function ollamaFetch(
  pathname: string,
  init: RequestInit = {},
  timeoutMs = 5000,
): Promise<Response> {
  const endpoint = getOllamaBaseUrl();
  if (!endpoint) {
    throw new OllamaUnavailableError(
      "OLLAMA_BASE_URL is not configured. Install and run Ollama on the model host, then set its reachable endpoint.",
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${endpoint}${pathname}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...authHeaders(),
        ...init.headers,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new OllamaUnavailableError("Ollama connection timed out.");
    }
    throw new OllamaUnavailableError(
      error instanceof Error ? error.message : "Ollama connection failed.",
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Ollama returned HTTP ${response.status}.`);
  }
  return (await response.json()) as T;
}

export async function checkOllama(): Promise<OllamaSnapshot> {
  const endpoint = getOllamaBaseUrl();
  if (!endpoint) {
    return {
      available: false,
      endpoint: null,
      version: null,
      message: "Ollama needs to be installed and running on the Ollama host.",
      modelAvailable: false,
      activeModel: null,
      error: "OLLAMA_BASE_URL is not configured.",
      models: [],
    };
  }

  try {
    const [tagsResponse, versionResponse, processResponse] = await Promise.all([
      ollamaFetch("/api/tags"),
      ollamaFetch("/api/version"),
      ollamaFetch("/api/ps"),
    ]);
    const tags = await readJson<OllamaListResponse>(tagsResponse);
    const version = await readJson<{ version?: string }>(versionResponse);
    const processes = await readJson<OllamaProcessResponse>(processResponse);
    const models = tags.models ?? [];
    const configuredModel = getOllamaModel();
    const modelAvailable = models.some(
      (model) => model.name === configuredModel,
    );
    const activeModel = processes.models?.[0]?.name ?? null;

    return {
      available: true,
      endpoint,
      version: version.version ?? null,
      message: modelAvailable
        ? activeModel
          ? `Ollama is connected and ${activeModel} is loaded.`
          : "Ollama is connected and the default model is downloaded."
        : "Ollama is connected, but the default model is not downloaded.",
      modelAvailable,
      activeModel,
      error: null,
      models,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Ollama connection failed.";
    return {
      available: false,
      endpoint,
      version: null,
      message: "Ollama is unavailable at the configured endpoint.",
      modelAvailable: false,
      activeModel: null,
      error: message,
      models: [],
    };
  }
}

export async function pullOllamaModel(
  model: string,
  onProgress: (progress: number, message: string) => void,
): Promise<void> {
  const response = await ollamaFetch(
    "/api/pull",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: model, stream: true }),
    },
    60_000,
  );
  if (!response.ok || !response.body) {
    throw new Error(
      (await response.text()) || `Ollama returned HTTP ${response.status}.`,
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as {
        status?: string;
        completed?: number;
        total?: number;
        error?: string;
      };
      if (event.error) throw new Error(event.error);
      const progress =
        event.total && event.completed
          ? Math.round((event.completed / event.total) * 100)
          : 0;
      onProgress(progress, event.status ?? "Downloading model from Ollama.");
    }
    if (done) break;
  }
}

export async function ollamaChat(
  body: Record<string, unknown>,
): Promise<Response> {
  return ollamaFetch(
    "/api/chat",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    120_000,
  );
}

export async function unloadOllamaModel(model: string): Promise<void> {
  const response = await ollamaFetch(
    "/api/generate",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: "", keep_alive: 0, stream: false }),
    },
    30_000,
  );
  await readJson(response);
}