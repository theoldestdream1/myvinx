import { ReactNode } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { BottomNav } from '@/components/layout/BottomNav';
import { useIsMobile } from '@/hooks/use-mobile';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const isMobile = useIsMobile();

  return (
    <div className="min-h-screen flex bg-background">
      {!isMobile && <Sidebar />}
      <main className={`flex-1 overflow-auto ${isMobile ? 'pb-20' : ''}`}>
        {children}
      </main>
      {isMobile && <BottomNav />}
    </div>
  );
}
