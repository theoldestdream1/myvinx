import { ReactNode } from 'react';
import { Link } from "@/lib/router-compat";
import { Sidebar } from '@/components/layout/Sidebar';
import { BottomNav } from '@/components/layout/BottomNav';
import { GemMark } from '@/components/layout/GemMark';
import { useIsMobile } from '@/hooks/use-mobile';
import { Bell } from 'lucide-react';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const isMobile = useIsMobile();

  return (
    <div className="min-h-screen flex bg-background">
      {!isMobile && <Sidebar />}
      <main className={`flex-1 flex flex-col overflow-auto ${isMobile ? 'pb-20' : ''}`}>
        {isMobile && (
          <header className="sticky top-0 z-40 flex items-center justify-between border-b border-border/50 bg-background/85 backdrop-blur-xl px-5 py-3">
            <Link to="/dashboard" className="flex items-center gap-2.5">
              <GemMark className="h-7 w-7" textClass="text-xs" />
              <span className="font-semibold tracking-tight">
                <span className="font-display italic text-lg">V</span>inx
              </span>
            </Link>
            <Link
              to="/intents"
              aria-label="Reminders"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition-colors hover:text-foreground"
            >
              <Bell className="h-4 w-4" />
            </Link>
          </header>
        )}
        {children}
      </main>
      {isMobile && <BottomNav />}
    </div>
  );
}
