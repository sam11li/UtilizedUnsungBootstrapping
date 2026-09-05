import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

export type AgentStatus = {
  agentId: string;
  name: string;
  status: "online" | "offline" | "revoked";
  lastSeen: string | null;
  connectedAt: string | null;
};

type AgentRecord = AgentStatus & { credentialHash: string };
type Pairing = { agentId: string; credentialHash: string; expiresAt: string };
export type AgentTask = {
  id: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  model: string | null;
  status: "queued" | "running" | "completed" | "error";
  result: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

const agents = new Map<string, AgentRecord>();
const pairings = new Map<string, Pairing>();
const tasks = new Map<string, AgentTask>();
const now = () => new Date().toISOString();
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

function tokenMatches(expectedHash: string, token: string): boolean {
  const actual = Buffer.from(hash(token));
  const expected = Buffer.from(expectedHash);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function createPairing() {
  const agentId = `kali-${randomUUID()}`;
  const credential = `northstar_${randomBytes(24).toString("hex")}`;
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  pairings.set(agentId, { agentId, credentialHash: hash(credential), expiresAt });
  return { agentId, credential, expiresAt };
}

export function registerAgent(agentId: string, credential: string, name: string) {
  const pairing = pairings.get(agentId);
  if (!pairing || new Date(pairing.expiresAt).getTime() < Date.now() || !tokenMatches(pairing.credentialHash, credential)) {
    return false;
  }
  agents.set(agentId, {
    agentId,
    name: name.trim() || "Kali Linux",
    status: "online",
    lastSeen: now(),
    connectedAt: now(),
    credentialHash: pairing.credentialHash,
  });
  pairings.delete(agentId);
  return true;
}

export function authenticateAgent(agentId: string, credential: string): AgentRecord | null {
  const agent = agents.get(agentId);
  if (!agent || agent.status === "revoked" || !tokenMatches(agent.credentialHash, credential)) return null;
  agent.lastSeen = now();
  agent.status = "online";
  return agent;
}

export function isAgentAuthenticated(agentId: string, credential: string): boolean {
  return authenticateAgent(agentId, credential) !== null;
}

export function getAgentStatus(): AgentStatus | null {
  const agent = [...agents.values()][0];
  if (!agent) return null;
  if (agent.status === "online" && agent.lastSeen && Date.now() - new Date(agent.lastSeen).getTime() > 45_000) {
    agent.status = "offline";
  }
  const { credentialHash: _credentialHash, ...safe } = agent;
  return safe;
}

export function revokeAgent(agentId: string): boolean {
  const agent = agents.get(agentId);
  if (!agent) return false;
  agent.status = "revoked";
  return true;
}

export function queueAgentTask(messages: AgentTask["messages"], model: string | null): AgentTask {
  const timestamp = now();
  const task: AgentTask = {
    id: randomUUID(),
    messages,
    model,
    status: "queued",
    result: null,
    error: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  tasks.set(task.id, task);
  return task;
}

export function claimNextTask(agentId: string, credential: string): AgentTask | null {
  if (!authenticateAgent(agentId, credential)) return null;
  const task = [...tasks.values()].find((candidate) => candidate.status === "queued");
  if (!task) return null;
  task.status = "running";
  task.updatedAt = now();
  return task;
}

export function getAgentTask(taskId: string): AgentTask | null {
  return tasks.get(taskId) ?? null;
}

export function completeAgentTask(taskId: string, agentId: string, credential: string, result: string, error: string | null) {
  if (!authenticateAgent(agentId, credential)) return false;
  const task = tasks.get(taskId);
  if (!task) return false;
  task.status = error ? "error" : "completed";
  task.result = result;
  task.error = error;
  task.updatedAt = now();
  return true;
}