import fs from "node:fs";
import path from "node:path";
import { DEFAULT_OLLAMA_MODEL } from "./runtime-config";

export type ModelStatus =
  | "registered"
  | "downloading"
  | "downloaded"
  | "loading"
  | "loaded"
  | "active"
  | "error";

export type ModelRecord = {
  id: string;
  name: string;
  repository: string;
  parameters: string | null;
  format: string;
  status: ModelStatus;
  progress: number;
  active: boolean;
  isDefault: boolean;
  size: string | null;
  updatedAt: string;
  error?: string;
};

export type MemoryRecord = {
  id: string;
  title: string;
  content: string;
  category: string;
  updatedAt: string;
};

type Store = {
  models: ModelRecord[];
  memory: MemoryRecord[];
};

const dataDirectory =
  process.env.AGENT_DATA_DIR?.trim() ||
  path.resolve(process.cwd(), "data");
const storePath = path.join(dataDirectory, "control-center.json");

function defaultStore(): Store {
  return {
    models: [
      {
        id: "default-ollama-model",
        name: "Uncensored_Qwen1.5_1.8B_Chat Q4_K_M",
        repository: DEFAULT_OLLAMA_MODEL,
        parameters: "1.8B",
        format: "Ollama / GGUF",
        status: "registered",
        progress: 0,
        active: false,
        isDefault: true,
        size: null,
        updatedAt: new Date().toISOString(),
      },
    ],
    memory: [],
  };
}

function loadStore(): Store {
  try {
    const raw = fs.readFileSync(storePath, "utf8");
    const parsed = JSON.parse(raw) as Store;
    if (!Array.isArray(parsed.models) || !Array.isArray(parsed.memory)) {
      return defaultStore();
    }
    return parsed;
  } catch {
    return defaultStore();
  }
}

export const store = loadStore();

export function persistStore(): void {
  fs.mkdirSync(dataDirectory, { recursive: true });
  const temporaryPath = `${storePath}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(store, null, 2), "utf8");
  fs.renameSync(temporaryPath, storePath);
}