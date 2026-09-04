import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { AlertCircle, Check, CircleDashed, LoaderCircle, RefreshCw, Server, Sparkles } from 'lucide-react';

export function PageIntro({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-primary"><span className="h-1.5 w-1.5 rounded-full bg-primary" /> {eyebrow}</div><h1 className="font-sans text-3xl font-extrabold tracking-[-0.04em] text-foreground md:text-[42px]">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p></div>{action && <div className="shrink-0">{action}</div>}</div>;
}

export function Panel({ children, className = '', title, kicker, action }: { children: ReactNode; className?: string; title?: string; kicker?: string; action?: ReactNode }) {
  return <section className={`rounded-2xl border border-card-border bg-card shadow-[0_8px_28px_hsl(211_38%_15%/0.04)] ${className}`}><div className={title ? 'flex items-center justify-between border-b border-border/70 px-5 py-4' : ''}>{title && <div><h2 className="text-sm font-extrabold tracking-[-0.01em]">{title}</h2>{kicker && <p className="mt-0.5 text-[11px] text-muted-foreground">{kicker}</p>}</div>}{action}</div>{children}</section>;
}

export function Skeleton({ className = '' }: { className?: string }) { return <div className={`animate-pulse rounded-lg bg-muted ${className}`} />; }

export function QueryState({ loading, error, retry, children, label = 'data' }: { loading?: boolean; error?: boolean; retry?: () => void; children: ReactNode; label?: string }) {
  if (loading) return <div className="space-y-3"><Skeleton className="h-5 w-40" /><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>;
  if (error) return <div className="flex flex-col items-center justify-center px-6 py-12 text-center"><span className="grid h-11 w-11 place-items-center rounded-full bg-destructive/10 text-destructive"><AlertCircle size={21} /></span><p className="mt-4 text-sm font-bold">Could not load {label}</p><p className="mt-1 max-w-xs text-xs leading-5 text-muted-foreground">The server did not respond. Check the connection and try again.</p>{retry && <button onClick={retry} className="mt-5 flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-bold hover:bg-muted" data-testid={`button-retry-${label}`}><RefreshCw size={14} /> Retry</button>}</div>;
  return <>{children}</>;
}

export function StatusDot({ tone = 'success' }: { tone?: 'success' | 'warning' | 'danger' | 'muted' }) { return <span className={`inline-block h-2 w-2 rounded-full ${tone === 'success' ? 'bg-primary' : tone === 'warning' ? 'bg-accent' : tone === 'danger' ? 'bg-destructive' : 'bg-muted-foreground/50'}`} />; }

export function StatusPill({ children, tone = 'success' }: { children: ReactNode; tone?: 'success' | 'warning' | 'danger' | 'muted' }) { return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] ${tone === 'success' ? 'bg-primary/10 text-primary' : tone === 'warning' ? 'bg-accent/20 text-[hsl(31_65%_37%)]' : tone === 'danger' ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'}`}><StatusDot tone={tone} />{children}</span>; }

export function EmptyState({ icon = <CircleDashed size={22} />, title, description, action }: { icon?: ReactNode; title: string; description: string; action?: ReactNode }) { return <div className="flex flex-col items-center justify-center px-6 py-14 text-center"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-secondary text-primary">{icon}</span><h3 className="mt-4 text-sm font-extrabold">{title}</h3><p className="mt-1 max-w-xs text-xs leading-5 text-muted-foreground">{description}</p>{action && <div className="mt-5">{action}</div>}</div>; }

export function ProgressBar({ value, tone = 'primary' }: { value: number; tone?: 'primary' | 'accent' }) { return <div className="h-2 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full transition-all duration-700 ${tone === 'primary' ? 'bg-primary' : 'bg-accent'}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>; }

export function LoadingButton({ pending, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { pending?: boolean }) { return <button {...props} disabled={pending || props.disabled} className={`inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-foreground transition-transform hover:brightness-105 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55 ${props.className ?? ''}`}>{pending && <LoaderCircle size={14} className="animate-spin" />}{pending ? 'Working…' : children}</button>; }

export function SignalMark({ label, value, status = 'online' }: { label: string; value: string; status?: 'online' | 'idle' }) { return <div className="flex items-center gap-3"><span className={`grid h-9 w-9 place-items-center rounded-xl ${status === 'online' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}><Server size={17} /></span><div><p className="text-[11px] text-muted-foreground">{label}</p><p className="text-xs font-extrabold">{value}</p></div><StatusDot tone={status === 'online' ? 'success' : 'muted'} /></div>; }

export const checkIcon = <Check size={14} />;
export const sparkIcon = <Sparkles size={14} />;