import { NavLink, useLocation } from "@/lib/router-compat";
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Plus,
  Search,
  Clock,
  Settings,
} from 'lucide-react';

const navItems = [
  { icon: LayoutDashboard, label: 'Home', path: '/dashboard' },
  { icon: Clock, label: 'Timeline', path: '/timeline' },
  { icon: Plus, label: 'Capture', path: '/capture' },
  { icon: Search, label: 'Query', path: '/query' },
  { icon: Settings, label: 'Settings', path: '/settings' },
];

export function BottomNav() {
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/50 bg-card/70 backdrop-blur-xl">
      <div className="flex items-center justify-around h-16 px-2">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const isCapture = item.path === '/capture';

          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={cn(
                'flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-lg transition-all duration-200 min-w-[60px]',
                isCapture && 'relative -mt-6',
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {isCapture ? (
                <div className="w-13 h-13 rounded-full bg-primary flex items-center justify-center shadow-[0_0_28px_-4px] shadow-primary/60 ring-4 ring-background">
                  <item.icon className="w-6 h-6 text-primary-foreground" />
                </div>
              ) : (
                <item.icon className={cn('w-5 h-5', isActive && 'text-primary drop-shadow-[0_0_8px_oklch(0.78_0.115_240/0.6)]')} />
              )}
              <span className={cn('text-[10px] font-mono uppercase tracking-wider', isCapture && 'mt-1')}>
                {item.label}
              </span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
