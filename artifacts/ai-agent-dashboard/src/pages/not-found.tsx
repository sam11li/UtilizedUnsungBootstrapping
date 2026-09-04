import { ArrowLeft, Compass } from 'lucide-react';
import { Link } from 'wouter';
import { AppShell } from '@/components/app-shell';

export default function NotFound() {
  return (
    <AppShell>
      <div className="flex min-h-[65vh] items-center justify-center">
        <div className="max-w-sm text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-secondary text-primary"><Compass size={25} /></span>
          <p className="mt-6 text-[11px] font-bold uppercase tracking-[0.18em] text-primary">Signal not found</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.05em]">This route is off the map.</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">The console could not find the workspace you requested.</p>
          <Link href="/" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-foreground" data-testid="link-return-overview"><ArrowLeft size={14} /> Return to overview</Link>
        </div>
      </div>
    </AppShell>
  );
}