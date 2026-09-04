export const DEFAULT_OLLAMA_MODEL =
  "hf.co/ICEPVP8977/Uncensored_Qwen1.5_1.8B_Chat:Q4_K_M";

export function getOllamaBaseUrl(): string | null {
  const value = process.env.OLLAMA_BASE_URL?.trim();
  return value ? value.replace(/\/+$/, "") : null;
}

export function getOllamaModel(): string {
  return process.env.OLLAMA_MODEL?.trim() || DEFAULT_OLLAMA_MODEL;
}

export function isApiKeyConfigured(): boolean {
  return Boolean(process.env.AI_API_KEY?.trim());
}