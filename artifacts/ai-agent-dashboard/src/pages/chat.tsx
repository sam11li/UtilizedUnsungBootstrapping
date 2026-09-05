import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowDownToLine, BarChart3, Bot, Clock3, Gauge, MessageSquare, Send, SlidersHorizontal, Sparkles, UserRound, WifiOff } from 'lucide-react';
import {
  getGetActiveModelQueryKey,
  getGetOllamaStatusQueryKey,
  getListModelsQueryKey,
  useCreateDashboardChat,
  useGetActiveModel,
  useGetOllamaStatus,
  useListModels,
} from '@workspace/api-client-react';
import type { ChatCompletionResponse } from '@workspace/api-client-react';
import { Link } from 'wouter';
import { AppShell } from '@/components/app-shell';
import { EmptyState, LoadingButton, PageIntro, Panel, ProgressBar, StatusPill } from '@/components/ui-blocks';

type Message = { role: 'user' | 'assistant'; content: string; id: string; meta?: { total: number; prompt: number; completion: number; latency: number } };
type Environment = 'vscode' | 'kali';
const defaultModel = 'hf.co/ICEPVP8977/Uncensored_Qwen1.5_1.8B_Chat:Q4_K_M';

function isResponse(value: unknown): value is ChatCompletionResponse {
  return typeof value === 'object' && value !== null && 'choices' in value && 'usage' in value;
}

export default function Chat() {
  const [prompt, setPrompt] = useState('');
  const [temperature, setTemperature] = useState('0.7');
  const [maxTokens, setMaxTokens] = useState('512');
  const [selectedModel, setSelectedModel] = useState('');
  const [environment, setEnvironment] = useState<Environment>('vscode');
  const [agent, setAgent] = useState<{ status: string; agentId: string | null } | null>(null);
  const [kaliPending, setKaliPending] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [notice, setNotice] = useState('');
  const startedAt = useRef(0);
  const queryClient = useQueryClient();
  const active = useGetActiveModel({ query: { queryKey: getGetActiveModelQueryKey() } });
  const ollama = useGetOllamaStatus({ query: { queryKey: getGetOllamaStatusQueryKey(), refetchInterval: 15000 } });
  const models = useListModels({ query: { queryKey: getListModelsQueryKey(), refetchInterval: 15000 } });
  const completion = useCreateDashboardChat();
  const activeModel = active.data?.id ?? ollama.data?.activeModel ?? '';
  const availableModels = models.data?.filter((item) => ['downloaded', 'loaded', 'active'].includes(item.status)).map((item) => item.repository) ?? [];
  const model = selectedModel || activeModel || availableModels[0] || defaultModel;
  const canChat = environment === 'vscode' ? Boolean(ollama.data?.available) : agent?.status === 'online';
  const latestMeta = [...messages].reverse().find((message) => message.meta)?.meta;

  useEffect(() => {
    const refresh = () => { void fetch('/api/agents/status').then((response) => response.json()).then((value) => setAgent(value.agent)).catch(() => setAgent(null)); };
    refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => window.clearInterval(timer);
  }, []);

  const sendMessage = async (event: FormEvent) => {
    event.preventDefault();
    const content = prompt.trim();
    if (!content || completion.isPending) return;
    if (!canChat) {
      setNotice(environment === 'kali' ? 'Kali Agent is offline. Generate a pairing credential in Settings and run the bridge inside Kali.' : 'Ollama is unavailable. Start the local server, then test the connection in Settings.');
      return;
    }
    if (environment === 'vscode' && !ollama.data?.available) {
      setNotice('Ollama is unavailable. Start the local server, then test the connection in Settings.');
      return;
    }
    const userMessage: Message = { role: 'user', content, id: `user-${Date.now()}` };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setPrompt('');
    setNotice('');
    startedAt.current = performance.now();
    if (environment === 'kali') {
      setKaliPending(true);
      try {
        const response = await fetch('/api/agents/tasks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model, messages: nextMessages }) });
        if (!response.ok) throw new Error((await response.json()).error ?? 'Kali Agent is unavailable.');
        const task = await response.json();
        const poll = async (): Promise<void> => {
          const result = await fetch(`/api/agents/tasks/${task.id}`).then((value) => value.json());
          if (result.status === 'completed' || result.status === 'error') {
            const latency = Math.round(performance.now() - startedAt.current);
            setMessages((current) => [...current, { role: 'assistant', content: result.error ?? result.result ?? 'Kali Agent returned no result.', id: `kali-${task.id}`, meta: { total: 0, prompt: 0, completion: 0, latency } }]);
            setKaliPending(false);
            return;
          }
          window.setTimeout(() => { void poll(); }, 1200);
        };
        void poll();
      } catch (error) {
        setNotice(error instanceof Error ? error.message : 'Kali task could not be queued.');
        setKaliPending(false);
      }
      return;
    }
    completion.mutate(
      {
        data: {
          model,
          messages: nextMessages.map(({ role, content: messageContent }) => ({ role, content: messageContent })),
          stream: false,
          temperature: Number(temperature),
          max_tokens: Number(maxTokens),
        },
      },
      {
        onSuccess: (result) => {
          const latency = Math.round(performance.now() - startedAt.current);
          if (!isResponse(result)) {
            setMessages((current) => [...current, { role: 'assistant', content: result || 'The model returned no text.', id: `assistant-${Date.now()}`, meta: { total: 0, prompt: 0, completion: 0, latency } }]);
            return;
          }
          const reply = result.choices[0]?.message?.content ?? 'The model returned an empty response.';
          setMessages((current) => [...current, { role: 'assistant', content: reply, id: result.id, meta: { total: result.usage.total_tokens, prompt: result.usage.prompt_tokens, completion: result.usage.completion_tokens, latency } }]);
          queryClient.invalidateQueries({ queryKey: getGetActiveModelQueryKey() });
        },
        onError: () => setNotice('The completion could not be created. The model may be unloaded or still downloading.'),
      },
    );
  };

  const clearThread = () => {
    setMessages([]);
    setNotice('');
  };

  return (
    <AppShell>
       <PageIntro eyebrow="Inference bridge" title="Talk to your local model." description="Route work through VS Code or your authenticated Kali VM without changing the hosted model." action={<div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-[11px] font-bold"><span className={`h-1.5 w-1.5 rounded-full ${canChat ? 'bg-primary' : 'bg-accent'}`} /> {environment === 'kali' ? `Kali ${agent?.status === 'online' ? 'online' : 'offline'}` : ollama.data?.available ? 'Ollama connected' : 'Ollama unavailable'}</div>} />
      {!ollama.isLoading && !ollama.data?.available && (
        <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-accent/35 bg-accent/10 px-4 py-4 text-sm md:flex-row md:items-center" data-testid="status-chat-unavailable">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent/20 text-[hsl(18_75%_34%)]"><WifiOff size={17} /></span>
          <div className="flex-1"><p className="font-extrabold">Your model bridge is offline</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{ollama.data?.message ?? 'No Ollama status has been returned yet.'} Chat is paused until the local runtime is reachable.</p></div>
          <Link href="/settings" className="shrink-0 rounded-lg border border-accent/40 px-3 py-2 text-xs font-extrabold text-[hsl(18_75%_34%)]" data-testid="link-chat-settings">Open settings</Link>
        </div>
      )}
      {notice && <div className="mb-4 rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-xs font-bold text-destructive" data-testid="status-chat-action">{notice}</div>}
      <div className="mb-4 rounded-2xl border border-border bg-card p-4"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Where do you want to work?</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{(['vscode', 'kali'] as Environment[]).map((option) => <button key={option} onClick={() => setEnvironment(option)} className={`rounded-xl border px-4 py-3 text-left ${environment === option ? 'border-primary bg-primary/5' : 'border-border hover:bg-secondary'}`} data-testid={`button-environment-${option}`}><p className="text-xs font-extrabold">{option === 'vscode' ? 'VS Code' : 'Kali Linux'}</p><p className="mt-1 text-[10px] text-muted-foreground">{option === 'vscode' ? 'Application development · direct model route' : `Security workspace · Agent ${agent?.status === 'online' ? 'online' : 'offline'}`}</p></button>)}</div><p className="mt-3 font-mono text-[10px] text-muted-foreground">Environment: {environment === 'vscode' ? 'VS Code' : 'Kali Linux'} · Model: {model}</p></div>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_310px]">
        <Panel className="overflow-hidden" title="Conversation" kicker={`${messages.length} messages · private session`} action={messages.length > 0 ? <button onClick={clearThread} className="text-[11px] font-extrabold text-muted-foreground hover:text-foreground" data-testid="button-clear-chat">Clear thread</button> : undefined}>
          <div className="min-h-[340px] space-y-5 p-5 md:min-h-[465px]">
            {!messages.length && !completion.isPending ? (
              <EmptyState icon={<MessageSquare size={21} />} title="Ready when you are" description="Ask for a plan, a code review, or a short answer. The full thread stays in this browser session." action={<button onClick={() => setPrompt('Give me a concise status check for this workspace.')} className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5 text-xs font-extrabold text-primary" data-testid="button-suggest-prompt">Use a starter prompt</button>} />
            ) : (
              messages.map((message) => <MessageBubble key={message.id} message={message} />)
            )}
             {(completion.isPending || kaliPending) && <div className="flex items-start gap-3" data-testid="status-chat-generating"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Bot size={16} /></span><div className="rounded-2xl rounded-tl-sm border border-border bg-muted/55 px-4 py-3"><div className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" /><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary [animation-delay:120ms]" /><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary [animation-delay:240ms]" /></div></div></div>}
          </div>
          <form onSubmit={sendMessage} className="border-t border-border/70 bg-secondary/25 p-4">
            <div className="rounded-2xl border border-input bg-card p-2 shadow-sm focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/10">
               <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={3} placeholder="Message your local agent…" className="w-full resize-none bg-transparent px-2 py-1 text-sm leading-6 outline-none placeholder:text-muted-foreground/60" disabled={!canChat || completion.isPending || kaliPending} data-testid="input-chat-prompt" />
              <div className="flex items-center justify-between gap-2 border-t border-border/60 px-2 pt-2">
                <span className="flex items-center gap-2 text-[10px] text-muted-foreground"><Sparkles size={13} className="text-primary" /> Local inference only</span>
                 <LoadingButton type="submit" pending={completion.isPending || kaliPending} disabled={!prompt.trim() || !canChat} data-testid="button-send-chat"><Send size={14} /> Send</LoadingButton>
              </div>
            </div>
          </form>
        </Panel>
        <aside className="space-y-4">
          <Panel title="Inference controls" kicker="Applied to the next request">
            <div className="space-y-5 p-5">
              <div><label htmlFor="chat-model" className="text-[11px] font-extrabold uppercase tracking-wider">Model</label><select id="chat-model" value={selectedModel} onChange={(event) => setSelectedModel(event.target.value)} className="mt-2 h-10 w-full rounded-xl border border-input bg-background px-3 font-mono text-[10px] outline-none focus:border-primary" data-testid="select-chat-model"><option value="">{activeModel ? `Active · ${activeModel}` : defaultModel}</option>{availableModels.filter((item) => item !== activeModel).map((item) => <option value={item} key={item}>{item}</option>)}</select></div>
              <label className="block"><div className="mb-2 flex items-center justify-between"><span className="text-[11px] font-extrabold">Temperature</span><span className="font-mono text-[11px] text-primary">{temperature}</span></div><input type="range" min="0" max="1.5" step="0.1" value={temperature} onChange={(event) => setTemperature(event.target.value)} className="w-full accent-[hsl(var(--primary))]" data-testid="input-chat-temperature" /></label>
              <label className="block"><div className="mb-2 flex items-center justify-between"><span className="text-[11px] font-extrabold">Max tokens</span><span className="font-mono text-[11px] text-primary">{maxTokens}</span></div><input type="range" min="128" max="2048" step="128" value={maxTokens} onChange={(event) => setMaxTokens(event.target.value)} className="w-full accent-[hsl(var(--primary))]" data-testid="input-chat-max-tokens" /></label>
              <div className="flex items-center gap-2 border-t border-border/70 pt-4 text-[11px] text-muted-foreground"><SlidersHorizontal size={14} className="text-primary" /> Non-streaming response mode</div>
            </div>
          </Panel>
          <Panel title="Response telemetry" kicker="Captured from this session">
            <Telemetry meta={latestMeta} />
          </Panel>
          <Panel title="Runtime handoff" kicker="Current local route">
            <div className="p-5"><StatusPill tone={ollama.data?.available ? 'success' : 'warning'}>{ollama.data?.available ? 'Ready' : 'Unavailable'}</StatusPill><p className="mt-3 break-all font-mono text-[10px] leading-5 text-muted-foreground">{ollama.data?.endpoint ?? 'Endpoint not reported'}</p><p className="mt-3 text-[11px] leading-5 text-muted-foreground">{ollama.data?.version ? `Ollama ${ollama.data.version}` : 'Version will appear when the runtime responds.'}</p></div>
          </Panel>
        </aside>
      </div>
    </AppShell>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  return <div className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : ''}`} data-testid={`message-chat-${message.id}`}><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${isUser ? 'bg-sidebar text-sidebar-primary' : 'bg-primary/10 text-primary'}`}>{isUser ? <UserRound size={15} /> : <Bot size={16} />}</span><div className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-6 ${isUser ? 'rounded-tr-sm bg-sidebar text-sidebar-foreground' : 'rounded-tl-sm border border-border bg-muted/55'}`}><p className="whitespace-pre-wrap">{message.content}</p>{message.meta && <div className={`mt-3 flex items-center gap-3 border-t pt-2 text-[10px] font-mono ${isUser ? 'border-sidebar-border text-sidebar-foreground/55' : 'border-border text-muted-foreground'}`}><span>{message.meta.completion} tok</span><span>{message.meta.latency} ms</span></div>}</div></div>;
}

function Telemetry({ meta }: { meta?: Message['meta'] }) {
  const max = Math.max(meta?.prompt ?? 0, meta?.completion ?? 0, 1);
  const bars = [{ label: 'Prompt', value: meta?.prompt ?? 0, color: 'bg-chart-3' }, { label: 'Reply', value: meta?.completion ?? 0, color: 'bg-primary' }];
  return <div className="p-5"><div className="mb-5 grid grid-cols-2 gap-3"><div className="rounded-xl bg-secondary/70 p-3"><Clock3 size={14} className="text-primary" /><p className="mt-3 font-mono text-lg font-bold">{meta?.latency ?? '—'}<span className="ml-1 text-[10px] font-normal text-muted-foreground">{meta ? 'ms' : ''}</span></p><p className="mt-1 text-[10px] text-muted-foreground">response time</p></div><div className="rounded-xl bg-secondary/70 p-3"><Gauge size={14} className="text-accent" /><p className="mt-3 font-mono text-lg font-bold">{meta?.total ?? '—'}</p><p className="mt-1 text-[10px] text-muted-foreground">total tokens</p></div></div><div className="flex items-end gap-3"><BarChart3 size={14} className="mb-0.5 text-muted-foreground" /><span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Token mix</span></div><div className="mt-4 space-y-3">{bars.map((bar) => <div key={bar.label}><div className="mb-1 flex justify-between text-[10px]"><span>{bar.label}</span><span className="font-mono">{bar.value}</span></div><ProgressBar value={(bar.value / max) * 100} tone={bar.label === 'Reply' ? 'primary' : 'accent'} /></div>)}</div><div className="mt-4 flex items-center gap-2 text-[10px] text-muted-foreground"><ArrowDownToLine size={12} /> Usage returned by Ollama</div></div>;
}