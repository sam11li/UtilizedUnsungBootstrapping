import { useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { Activity, BrainCircuit, ChevronRight, Cpu, Database, Layers3, Menu, MessageSquare, Settings2, ShieldCheck, X } from 'lucide-react';
import { getHealthCheckQueryKey, useHealthCheck } from '@workspace/api-client-react';

const navigation = [
  { href: '/', label: 'Overview', icon: Activity },
  { href: '/models', label: 'Models', icon: Layers3 },
  { href: '/chat', label: 'Chat', icon: MessageSquare },
  { href: '/memory', label: 'Shared memory', icon: BrainCircuit },
  { href: '/settings', label: 'Settings', icon: Settings2 },
];

export function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const health = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey(), refetchInterval: 30000 } });

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col border-r border-sidebar-border bg-sidebar px-4 py-5 text-sidebar-foreground transition-transform duration-300 md:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between px-3">
          <Link href="/" className="flex items-center gap-3" data-testid="link-brand">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
              <Cpu size={19} strokeWidth={2.4} />
            </span>
            <span>
              <span className="block text-[13px] font-extrabold tracking-[0.08em] text-sidebar-primary">NORTHSTAR</span>
              <span className="block text-[11px] text-sidebar-foreground/55">agent control center</span>
            </span>
          </Link>
          <button className="rounded-lg p-2 text-sidebar-foreground/60 hover:bg-sidebar-accent md:hidden" onClick={() => setMobileOpen(false)} aria-label="Close navigation" data-testid="button-close-navigation">
            <X size={18} />
          </button>
        </div>

        <div className="mt-10 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-sidebar-foreground/35">Workspace</div>
        <nav className="mt-3 space-y-1" aria-label="Main navigation">
          {navigation.map(({ href, label, icon: Icon }) => {
            const active = href === '/' ? location === '/' : location.startsWith(href);
            return (
              <Link href={href} key={href} onClick={() => setMobileOpen(false)} className={`group flex items-center justify-between rounded-xl px-3 py-3 text-sm font-semibold transition-colors ${active ? 'bg-sidebar-accent text-sidebar-foreground' : 'text-sidebar-foreground/60 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground'}`} data-testid={`link-nav-${label.toLowerCase().replace(/\s/g, '-')}`}>
                <span className="flex items-center gap-3"><Icon size={17} /><span>{label}</span></span>
                {active && <ChevronRight size={15} className="text-sidebar-primary" />}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto">
          <div className="rounded-2xl border border-sidebar-border bg-sidebar-accent/45 p-4">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.13em] text-sidebar-foreground/55"><ShieldCheck size={14} className="text-sidebar-primary" /> Protected console</div>
            <p className="mt-3 text-xs leading-5 text-sidebar-foreground/55">Private by default. Your model stays on your Replit server.</p>
          </div>
          <div className="mt-4 flex items-center gap-3 border-t border-sidebar-border px-3 pt-4">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-accent text-xs font-extrabold text-accent-foreground">OP</span>
            <div className="min-w-0"><p className="truncate text-xs font-bold">Operator</p><p className="truncate text-[11px] text-sidebar-foreground/45">solo workspace</p></div>
            <Database size={14} className="ml-auto text-sidebar-foreground/35" />
          </div>
        </div>
      </aside>

      {mobileOpen && <button className="fixed inset-0 z-30 bg-sidebar/45 backdrop-blur-sm md:hidden" onClick={() => setMobileOpen(false)} aria-label="Close menu overlay" data-testid="button-close-overlay" />}

      <div className="md:pl-[248px]">
        <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between border-b border-border/70 bg-background/90 px-5 backdrop-blur-md md:px-10">
          <button className="rounded-xl border border-border bg-card p-2.5 md:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation" data-testid="button-open-navigation"><Menu size={19} /></button>
          <div className="hidden items-center gap-2 text-xs text-muted-foreground md:flex"><span className="h-2 w-2 rounded-full bg-primary" /> Server console <span className="text-border">/</span> <span className="text-foreground">{navigation.find((item) => item.href === '/' ? location === '/' : location.startsWith(item.href))?.label ?? 'Overview'}</span></div>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-[11px] font-semibold text-muted-foreground sm:flex" data-testid="status-shell-api"><span className={`h-1.5 w-1.5 rounded-full ${health.data ? 'bg-primary' : health.isLoading ? 'bg-accent' : 'bg-destructive'}`} /> {health.data?.status ?? (health.isLoading ? 'API checking' : 'API offline')}</div>
            <span className="grid h-8 w-8 place-items-center rounded-full bg-sidebar text-[11px] font-extrabold text-sidebar-primary">OP</span>
          </div>
        </header>
        <main className="mx-auto max-w-[1440px] px-5 pb-24 pt-7 md:px-10 md:py-10 md:pb-10">{children}</main>
      </div>

      <nav className="fixed inset-x-3 bottom-3 z-20 grid grid-cols-5 rounded-2xl border border-border bg-card/95 p-1.5 shadow-xl backdrop-blur-md md:hidden" aria-label="Mobile navigation">
        {navigation.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? location === '/' : location.startsWith(href);
          return <Link href={href} key={href} className={`flex flex-col items-center gap-1 rounded-xl py-2 text-[10px] font-bold ${active ? 'bg-secondary text-primary' : 'text-muted-foreground'}`} data-testid={`link-mobile-nav-${label.toLowerCase().replace(/\s/g, '-')}`}><Icon size={17} /><span>{label === 'Shared memory' ? 'Memory' : label}</span></Link>;
        })}
      </nav>
    </div>
  );
}