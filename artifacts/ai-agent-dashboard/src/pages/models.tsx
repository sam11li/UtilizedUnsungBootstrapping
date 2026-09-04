import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Box, DownloadCloud, HardDrive, LoaderCircle, MoreHorizontal, PackageOpen, Play, Trash2 } from 'lucide-react';
import {
  getGetActiveModelQueryKey,
  getGetDashboardQueryKey,
  getGetModelStatusQueryKey,
  getListModelsQueryKey,
  useActivateModel,
  useDownloadModel,
  useGetModelStatus,
  useListModels,
  useRemoveModel,
  useUnloadModel,
} from '@workspace/api-client-react';
import { AppShell } from '@/components/app-shell';
import { EmptyState, LoadingButton, PageIntro, Panel, ProgressBar, QueryState, StatusPill } from '@/components/ui-blocks';

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'unknown date'
    : new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

export default function Models() {
  const [repository, setRepository] = useState('');
  const [notice, setNotice] = useState('');
  const queryClient = useQueryClient();
  const models = useListModels({ query: { queryKey: getListModelsQueryKey(), refetchInterval: 5000 } });
  const status = useGetModelStatus({ query: { queryKey: getGetModelStatusQueryKey(), refetchInterval: 2500 } });
  const download = useDownloadModel();
  const activate = useActivateModel();
  const remove = useRemoveModel();
  const unload = useUnloadModel();

  const onDownload = (event: FormEvent) => {
    event.preventDefault();
    if (!repository.trim()) return;
    setNotice('');
    download.mutate(
      { data: { repository: repository.trim() } },
      {
        onSuccess: () => {
          setRepository('');
          setNotice('Download queued.');
          queryClient.invalidateQueries({ queryKey: getListModelsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetModelStatusQueryKey() });
        },
        onError: () => setNotice('Could not register that Ollama model. Check the reference and try again.'),
      },
    );
  };

  const onActivate = (modelId: string) => {
    setNotice('');
    activate.mutate(
      { data: { modelId } },
      {
        onSuccess: () => {
          setNotice('Model activated.');
          queryClient.invalidateQueries({ queryKey: getListModelsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetActiveModelQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
        },
        onError: () => setNotice('Activation failed. The model may still be loading.'),
      },
    );
  };

  const onUnload = (modelId: string) => {
    setNotice('');
    unload.mutate(
      { data: { modelId } },
      {
        onSuccess: () => {
          setNotice('Model unloaded from Ollama.');
          queryClient.invalidateQueries({ queryKey: getListModelsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetActiveModelQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetModelStatusQueryKey() });
        },
        onError: () => setNotice('Could not unload the model. Check the Ollama connection.'),
      },
    );
  };

  const onRemove = (modelId: string, name: string) => {
    if (!window.confirm(`Remove ${name} from this server?`)) return;
    remove.mutate(
      { modelId },
      {
        onSuccess: () => {
          setNotice(`${name} removed.`);
          queryClient.invalidateQueries({ queryKey: getListModelsQueryKey() });
        },
        onError: () => setNotice('Could not remove this model.'),
      },
    );
  };

  return (
    <AppShell>
      <PageIntro
        eyebrow="Model registry"
        title="Installed models"
        description="Choose the engine behind your agent, or register an Ollama model from Hugging Face."
        action={
          <span className="hidden items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-[11px] font-bold text-muted-foreground sm:flex">
            <HardDrive size={14} className="text-primary" /> Local storage only
          </span>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[0.68fr_1.32fr]">
        <Panel title="Add an Ollama model" kicker="Paste a reference or command to begin">
          <form onSubmit={onDownload} className="p-5">
            <label htmlFor="repository" className="text-xs font-extrabold">Ollama reference or command</label>
            <div className="relative mt-2">
              <DownloadCloud size={16} className="absolute left-3 top-3.5 text-muted-foreground" />
              <input
                id="repository"
                value={repository}
                onChange={(event) => setRepository(event.target.value)}
                placeholder="ollama run hf.co/ICEPVP8977/Uncensored_Qwen1.5_1.8B_Chat:Q4_K_M"
                className="h-11 w-full rounded-xl border border-input bg-background pl-10 pr-3 text-xs outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/15"
                data-testid="input-model-repository"
              />
            </div>
            <p className="mt-2 text-[11px] leading-5 text-muted-foreground">Paste the full <span className="font-mono">ollama run</span> command or only the <span className="font-mono">hf.co/...</span> reference. Ollama handles the local download.</p>
            <LoadingButton type="submit" pending={download.isPending} className="mt-5 w-full" data-testid="button-download-model">Register model</LoadingButton>
            {notice && <p className={`mt-3 text-center text-xs font-bold ${notice.includes('failed') || notice.includes('Could') ? 'text-destructive' : 'text-primary'}`} data-testid="status-model-action">{notice}</p>}
          </form>
          <div className="border-t border-border/70 p-5">
            <div className="flex items-center gap-2 text-xs font-extrabold"><PackageOpen size={15} className="text-primary" /> Download guidance</div>
            <ul className="mt-3 space-y-2 text-[11px] leading-5 text-muted-foreground">
              <li>Quantized GGUF variants such as Q4_K_M are a good fit for Ollama.</li>
              <li>Run the command on the machine where Ollama is installed.</li>
              <li>Only use model repositories you trust.</li>
            </ul>
          </div>
        </Panel>
        <Panel
          title="Model fleet"
          kicker={`${models.data?.length ?? 0} installed`}
          action={status.data && status.data.state !== 'idle' && status.data.state !== 'active' ? <StatusPill tone={status.data.state === 'error' ? 'danger' : 'warning'}>{statusLabel(status.data.state)}</StatusPill> : undefined}
        >
          {status.data?.state === 'downloading' && (
            <div className="border-b border-border/70 bg-secondary/45 px-5 py-4">
              <div className="flex items-center justify-between text-[11px] font-bold"><span className="flex items-center gap-2"><LoaderCircle size={14} className="animate-spin text-primary" /> Download in progress</span><span className="font-mono text-primary">{status.data.progress}%</span></div>
              <ProgressBar value={status.data.progress} tone="accent" />
              <p className="mt-2 truncate text-[11px] text-muted-foreground">{status.data.message}</p>
            </div>
          )}
          <QueryState loading={models.isLoading} error={models.isError} retry={() => models.refetch()} label="models">
            {models.data?.length ? (
              <div className="divide-y divide-border/70">
                {models.data.map((model) => (
                  <article key={model.id} className="px-5 py-5" data-testid={`card-model-${model.id}`}>
                    <div className="flex items-start gap-3">
                      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${model.active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}><Box size={18} /></span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-sm font-extrabold">{model.name}</h3>
                          {model.isDefault && <StatusPill>Default</StatusPill>}
                          {model.active && <StatusPill>Active</StatusPill>}
                          <StatusPill tone={model.status === 'error' ? 'danger' : ['downloaded', 'loaded', 'active'].includes(model.status) ? 'success' : ['downloading', 'loading'].includes(model.status) ? 'warning' : 'muted'}>{statusLabel(model.status)}</StatusPill>
                        </div>
                        <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">{model.repository}</p>
                      </div>
                      <button onClick={() => setNotice(`${model.name}: ${model.size ?? 'size pending'}, ${model.format || 'format pending'}.`)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Show details for ${model.name}`} data-testid={`button-model-menu-${model.id}`}><MoreHorizontal size={17} /></button>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <Info label="Parameters" value={model.parameters ?? '—'} />
                      <Info label="Format" value={model.format || '—'} />
                      <Info label="Size" value={model.size ?? '—'} />
                      <Info label="Updated" value={formatDate(model.updatedAt)} />
                    </div>
                    {model.status === 'downloading' && <div className="mt-4"><div className="mb-1.5 flex justify-between text-[10px] font-bold text-muted-foreground"><span>Downloading model weights</span><span>{model.progress}%</span></div><ProgressBar value={model.progress} tone="accent" /></div>}
                    <div className="mt-4 flex justify-end gap-2">
                      {!model.active && ['downloaded', 'loaded'].includes(model.status) && <button onClick={() => onActivate(model.id)} disabled={activate.isPending} className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 px-3 py-2 text-[11px] font-extrabold text-primary hover:bg-primary/10 disabled:opacity-50" data-testid={`button-activate-model-${model.id}`}><Play size={13} /> {activate.isPending ? 'Activating…' : 'Activate'}</button>}
                      {model.active && <button onClick={() => onUnload(model.id)} disabled={unload.isPending} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[11px] font-extrabold text-muted-foreground hover:bg-muted disabled:opacity-50" data-testid={`button-unload-model-${model.id}`}>{unload.isPending ? 'Unloading…' : 'Unload'}</button>}
                      {!model.active && <button onClick={() => onRemove(model.id, model.name)} disabled={remove.isPending} className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/20 px-3 py-2 text-[11px] font-extrabold text-destructive hover:bg-destructive/10 disabled:opacity-50" data-testid={`button-remove-model-${model.id}`}><Trash2 size={13} /> Remove</button>}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState icon={<PackageOpen size={22} />} title="Your model shelf is empty" description="Add a trusted repository to give the agent an engine." action={<button onClick={() => document.getElementById('repository')?.focus()} className="rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-foreground" data-testid="button-focus-download">Add first model</button>} />
            )}
          </QueryState>
        </Panel>
      </div>
    </AppShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-1 truncate font-mono text-[11px] font-medium">{value}</p></div>;
}

function statusLabel(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}