import { ReactNode } from 'react';
import { Check, ChevronRight, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TaskCardProps {
  title: string;
  chip?: { label: string; tone?: 'primary' | 'destructive' | 'muted' };
  meta?: ReactNode;
  status?: ReactNode;
  footer?: string;
  lit?: boolean;
  done?: boolean;
  onToggle?: () => void;
}

export function TaskCard({ title, chip, meta, status, footer, lit, done, onToggle }: TaskCardProps) {
  return (
    <div
      className={cn(
        'beam group p-5 transition-all duration-300',
        lit
          ? 'card-lit'
          : 'card-ghost hover:border-silver/25 hover:shadow-[0_0_32px_-14px] hover:shadow-silver/25'
      )}
    >
      <div className="flex items-start gap-4">
        {onToggle && (
          <button
            type="button"
            aria-label={done ? 'Mark not done' : 'Mark done'}
            onClick={onToggle}
            className={cn(
              'mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg border-2 transition-all duration-200',
              done
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-muted-foreground/40 hover:border-primary hover:shadow-[0_0_12px] hover:shadow-silver/40'
            )}
          >
            {done && <Check className="h-3.5 w-3.5" />}
          </button>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <h3 className={cn('text-lg font-semibold leading-snug line-clamp-2', done && 'line-through text-muted-foreground')}>
              {title}
            </h3>
            {chip && (
              <span
                className={cn(
                  'chip flex-shrink-0',
                  chip.tone === 'primary' && 'border-primary/40 text-primary',
                  chip.tone === 'destructive' && 'border-destructive/40 text-destructive'
                )}
              >
                {chip.label}
              </span>
            )}
          </div>
          {meta && <div className="mt-3 flex items-center gap-2.5">{meta}</div>}
          {status && (
            <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
              <p className="flex-1 min-w-0">{status}</p>
              <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
            </div>
          )}
          {footer && <p className="mt-2.5 font-display italic text-[15px] text-primary/75">{footer}</p>}
        </div>
      </div>
    </div>
  );
}
