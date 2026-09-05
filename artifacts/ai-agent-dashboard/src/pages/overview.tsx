import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'wouter';
import { ArrowUpRight, Bot, Braces, CheckCircle2, Code2, Download, HardDrive, LockKeyhole, Plus, Radar, RefreshCw, TerminalSquare, Zap } from 'lucide-react';
import { useGetActiveModel, useGetDashboard, useGetModelStatus, useHealthCheck, useListModels, getGetActiveModelQueryKey, getGetDashboardQueryKey, getGetModelStatusQueryKey, getHealthCheckQueryKey, getListModelsQueryKey } from '@workspace/api-client-react';
import { PageIntro, Panel, ProgressBar, QueryState, SignalMark, Skeleton, StatusPill } from '@/components/ui-blocks';
import { AppShell } from '@/components/app-shell';

function timeAgo(value?: string) {
  if (!value) return 'recently';
  const seconds = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  return `${Math.round(seconds / 3600)}h ago`;
}

export default function Overview() {
  const [agentStatus, setAgentStatus] = useState<'online' | 'offline' | 'revoked'>('offline');
  const dashboard = useGetDashboard({ query: { queryKey: getGetDashboardQueryKey(), refetchInterval: 30000 } });
  const health = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey(), refetchInterval: 30000 } });
  const models = useListModels({ query: { queryKey: getListModelsQueryKey() } });
  const active = useGetActiveModel({ query: { queryKey: getGetActiveModelQueryKey() } });
  const modelStatus = useGetModelStatus({ query: { queryKey: getGetModelStatusQueryKey(), refetchInterval: 3000 } });
  const overview = dashboard.data;
  const hasError = dashboard.isError && health.isError;
  useEffect(() => {
    const refresh = () => { void fetch('/api/agents/status').then((response) => response.json()).then((value) => setAgentStatus(value.agent?.status ?? 'offline')).catch(() => setAgentStatus('offline')); };
    refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => window.clearInterval(timer);
  }, []);

  return <AppShell><PageIntro eyebrow="Command center · live" title="Good morning, operator." description="A clear read on the agent that keeps both workspaces moving." action={<Link href="/models" className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-foreground transition-transform hover:brightness-105 active:scale-[0.98]" data-testid="link-manage-models"><Bot size={15} /> Manage models <ArrowUpRight size={14} /></Link>} />
    <QueryState loading={dashboard.isLoading} error={hasError} retry={() => { dashboard.refetch(); health.refetch(); }} label="overview">
       <div className="grid gap-4 md:grid-cols-4">
        <div className="console-grid relative overflow-hidden rounded-2xl bg-sidebar p-5 text-sidebar-foreground md:col-span-2"><div className="absolute -right-8 -top-12 h-40 w-40 rounded-full border-[18px] border-sidebar-primary/10" /><div className="relative"><div className="flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-[0.18em] text-sidebar-foreground/55">Agent runtime</span><StatusPill>{health.data?.status ?? 'online'}</StatusPill></div><div className="mt-7 flex items-end gap-3"><h2 className="text-3xl font-extrabold tracking-[-0.05em] text-sidebar-primary">{overview?.activeModel ?? 'No model active'}</h2><span className="mb-1 text-xs text-sidebar-foreground/45">active model</span></div><p className="mt-2 max-w-md text-xs leading-5 text-sidebar-foreground/55">{modelStatus.data?.message ?? 'Ready to receive work from your connected environments.'}</p><div className="mt-6 flex items-center gap-3 border-t border-sidebar-border pt-4"><SignalMark label="API endpoint" value={overview?.apiStatus ?? 'checking'} /><span className="h-8 w-px bg-sidebar-border" /><SignalMark label="Runtime" value={health.data?.status ?? 'checking'} /></div></div></div>
        <MetricCard label="Installed models" value={overview?.installedModels ?? models.data?.length ?? 0} hint={`${overview?.readyModels ?? models.data?.filter((model) => ['downloaded', 'loaded', 'active'].includes(model.status)).length ?? 0} ready to use`} icon={<HardDrive size={17} />} />
        <MetricCard label="Shared memory" value={overview?.memoryEntries ?? 0} hint="entries available to agent" icon={<Braces size={17} />} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
        <Panel title="Connected environments" kicker="Two workspaces, one shared agent">
           <div className="grid divide-y divide-border/70 md:grid-cols-2 md:divide-x md:divide-y-0"><Environment icon={<Code2 size={19} />} title="VS Code" detail="Application development" status={dashboard.data?.apiKeyConfigured ? 'ONLINE' : 'OFFLINE'} accent="primary" /><Environment icon={<TerminalSquare size={19} />} title="Kali Linux" detail="Security tooling" status={agentStatus === 'online' ? 'ONLINE' : 'OFFLINE'} accent="accent" /></div>
        </Panel>
        <Panel title="Quick actions" kicker="Common operator moves"><div className="grid grid-cols-2 gap-2 p-4"><QuickAction href="/models" icon={<Download size={16} />} label="Add model" /><QuickAction href="/memory" icon={<Plus size={16} />} label="Save memory" /><QuickAction href="/settings" icon={<LockKeyhole size={16} />} label="Check access" /><QuickAction href="/settings" icon={<Radar size={16} />} label="System status" /></div></Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
        <Panel title="Recent model activity" kicker="Latest changes from your local fleet" action={<Link href="/models" className="text-[11px] font-bold text-primary hover:underline" data-testid="link-view-all-models">View all</Link>}>
          {models.isLoading ? <div className="space-y-3 p-5"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div> : models.data?.length ? <div className="divide-y divide-border/70">{models.data.slice(0, 4).map((model) => <div key={model.id} className="flex items-center gap-3 px-5 py-4" data-testid={`row-activity-${model.id}`}><span className={`grid h-9 w-9 place-items-center rounded-xl ${model.active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}><Zap size={16} /></span><div className="min-w-0 flex-1"><p className="truncate text-xs font-extrabold">{model.name}</p><p className="mt-1 text-[11px] text-muted-foreground">{model.status === 'downloaded' ? 'Downloaded · ready for inference' : model.status === 'loaded' ? 'Loaded in Ollama' : model.status === 'active' ? 'Active for both environments' : model.status === 'downloading' ? `Downloading · ${model.progress}%` : model.status === 'error' ? 'Ollama connection error' : `Registered · ${timeAgo(model.updatedAt)}`}</p></div><StatusPill tone={model.status === 'error' ? 'danger' : ['downloading', 'loading'].includes(model.status) ? 'warning' : ['downloaded', 'loaded', 'active'].includes(model.status) ? 'success' : 'muted'}>{model.active ? 'Active' : model.status}</StatusPill></div>)}</div> : <div className="p-2"><div className="flex flex-col items-center justify-center px-6 py-12 text-center"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-secondary text-primary"><Bot size={20} /></span><p className="mt-3 text-sm font-extrabold">No model activity yet</p><p className="mt-1 text-xs text-muted-foreground">Download a model to give the agent a runtime.</p></div></div>}
        </Panel>
        <Panel title="Runtime signal" kicker="Polling every 30 seconds"><div className="p-5"><div className="flex items-center justify-between"><span className="text-xs font-bold">Health check</span><StatusPill tone={health.data ? 'success' : 'warning'}>{health.data?.status ?? 'checking'}</StatusPill></div><div className="mt-5 space-y-4"><SignalMark label="Model endpoint" value={active.data?.id ? 'responding' : 'standby'} status={active.data?.id ? 'online' : 'idle'} /><SignalMark label="Model loader" value={modelStatus.data?.state ?? 'idle'} status={modelStatus.data?.state === 'error' ? 'idle' : 'online'} /></div><div className="mt-5 rounded-xl bg-secondary/70 p-3 text-[11px] leading-5 text-muted-foreground"><RefreshCw size={13} className="mb-1 text-primary" /> Last check updates automatically while this page is open.</div></div></Panel>
      </div>
    </QueryState>
  </AppShell>;
}

function MetricCard({ label, value, hint, icon }: { label: string; value: string | number; hint: string; icon: ReactNode }) { return <div className="rounded-2xl border border-card-border bg-card p-5 shadow-[0_8px_28px_hsl(211_38%_15%/0.04)]"><span className="grid h-9 w-9 place-items-center rounded-xl bg-secondary text-primary">{icon}</span><p className="mt-6 text-3xl font-extrabold tracking-[-0.05em]">{value}</p><p className="mt-1 text-xs font-bold">{label}</p><p className="mt-1 text-[11px] text-muted-foreground">{hint}</p></div>; }
function Environment({ icon, title, detail, status, accent }: { icon: ReactNode; title: string; detail: string; status: string; accent: 'primary' | 'accent' }) { return <div className="flex items-center gap-4 px-5 py-5"><span className={`grid h-11 w-11 place-items-center rounded-2xl ${accent === 'primary' ? 'bg-primary/10 text-primary' : 'bg-accent/20 text-[hsl(31_65%_37%)]'}`}>{icon}</span><div className="flex-1"><p className="text-sm font-extrabold">{title}</p><p className="mt-1 text-[11px] text-muted-foreground">{detail}</p></div><span className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-primary"><CheckCircle2 size={14} />{status}</span></div>; }
function QuickAction({ href, icon, label }: { href: string; icon: ReactNode; label: string }) { return <Link href={href} className="flex min-h-[70px] flex-col justify-between rounded-xl border border-border/80 bg-background p-3 text-xs font-bold transition-colors hover:border-primary/50 hover:bg-secondary" data-testid={`link-quick-${label.toLowerCase().replace(/\s/g, '-')}`}><span className="text-primary">{icon}</span><span>{label}<ArrowUpRight size={12} className="ml-1 inline text-muted-foreground" /></span></Link>; }