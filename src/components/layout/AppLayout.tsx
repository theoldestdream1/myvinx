import { ReactNode } from 'react';
import { Link } from "@/lib/router-compat";
import { Sidebar } from '@/components/layout/Sidebar';
import { BottomNav } from '@/components/layout/BottomNav';
import { GemMark } from '@/components/layout/GemMark';
import { useIsMobile } from '@/hooks/use-mobile';
import { Bell } from 'lucide-react';
import { VCompanion } from '@/components/v/VCompanion';
import { ThemeToggle } from './ThemeProvider';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const isMobile = useIsMobile();

  return (
    <div className="min-h-screen flex bg-background">
      {!isMobile && <Sidebar />}
      <main className={`min-w-0 flex-1 flex flex-col ${isMobile ? 'mobile-content' : ''}`}>
        {isMobile && (
          <header className="sticky top-0 z-40 grid grid-cols-[minmax(0,1fr)_auto] items-center border-b border-border/50 bg-background px-5 py-3">
            <Link to="/dashboard" className="flex items-center gap-2.5">
              <GemMark className="h-7 w-7" textClass="text-xs" />
              <span className="font-semibold tracking-tight">
                <span className="font-display italic text-lg">V</span>inx
              </span>
            </Link>
            <div className="flex shrink-0 items-center gap-1"><ThemeToggle /><Link
              to="/intents"
              aria-label="Reminders"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition-colors hover:text-foreground"
            >
              <Bell className="h-4 w-4" />
            </Link></div>
          </header>
        )}
        {children}
      </main>
      {isMobile && <BottomNav />}
      <VCompanion />
    </div>
  );
}
