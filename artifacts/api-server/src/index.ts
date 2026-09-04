import { spawn, type ChildProcess } from "node:child_process";
import app from "./app";
import { logger } from "./lib/logger";

let localOllamaProcess: ChildProcess | undefined;

async function ensureLocalOllama(): Promise<void> {
  if (process.env.OLLAMA_AUTOSTART !== "true") return;

  const endpoint = process.env.OLLAMA_BASE_URL?.trim();
  if (!endpoint || !/^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/i.test(endpoint)) {
    return;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1_000);
    const response = await fetch(`${endpoint.replace(/\/+$/, "")}/api/version`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (response.ok) {
      logger.info({ endpoint }, "Local Ollama is already running");
      return;
    }
  } catch {
    // Start the bundled runtime below when the local endpoint is not ready.
  }

  localOllamaProcess = spawn("ollama", ["serve"], {
    env: process.env,
    stdio: "inherit",
  });
  localOllamaProcess.on("error", (error) => {
    logger.error({ error }, "Could not start local Ollama");
  });
  logger.info({ endpoint }, "Started local Ollama runtime");
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function start(): Promise<void> {
  await ensureLocalOllama();

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
  });
}

void start().catch((error: unknown) => {
  logger.error({ error }, "Could not start API server");
  process.exit(1);
});
