import { ReactNode } from 'react';

interface Props {
  eyebrow: string;
  title: ReactNode;
  sub?: string;
  action?: ReactNode;
}

/** Shared editorial page header: mono eyebrow, serif title, quiet subline. */
export function PageHeader({ eyebrow, title, sub, action }: Props) {
  return (
    <header className="rise mb-8 flex items-end justify-between gap-4">
      <div>
        <p className="eyebrow mb-3 flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_10px_var(--primary)]" />
          {eyebrow}
        </p>
        <h1 className="font-display text-4xl leading-[1.05] tracking-tight text-foreground sm:text-5xl">{title}</h1>
        {sub && <p className="mt-2 max-w-md text-sm text-muted-foreground">{sub}</p>}
      </div>
      {action}
    </header>
  );
}
