import { useState } from 'react';
import { NavLink, useLocation } from "@/lib/router-compat";
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  LayoutDashboard,
  PlusCircle,
  Clock,
  Search,
  Network,
  Bell,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
  { icon: PlusCircle, label: 'Capture', path: '/capture' },
  { icon: Clock, label: 'Timeline', path: '/timeline' },
  { icon: Search, label: 'Query', path: '/query' },
  { icon: Network, label: 'Graph', path: '/graph' },
  { icon: Bell, label: 'Intents', path: '/intents' },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const { signOut, user } = useAuth();
  const location = useLocation();

  return (
    <aside
      className={cn(
        'h-screen sticky top-0 bg-sidebar border-r border-sidebar-border/60 flex flex-col transition-all duration-300',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo */}
      <div className="p-4 flex items-center gap-3 border-b border-sidebar-border/60">
        <div className="relative w-10 h-10 flex items-center justify-center flex-shrink-0">
          <div className="absolute inset-0 rotate-45 rounded-[28%] bg-gradient-to-br from-primary via-primary/40 to-transparent" />
          <div className="absolute inset-[2px] rotate-45 rounded-[26%] bg-sidebar" />
          <span className="relative font-display italic text-primary text-lg leading-none translate-y-px">V</span>
        </div>
        {!collapsed && (
          <span className="font-semibold text-lg tracking-tight text-sidebar-foreground">
            <span className="font-display italic text-xl">V</span>inx
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1">
        {!collapsed && <p className="eyebrow px-3 pt-2 pb-3">Menu</p>}
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-primary shadow-[inset_0_1px_0] shadow-white/5'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground'
              )}
            >
              <item.icon className={cn('w-5 h-5 flex-shrink-0', isActive && 'text-primary drop-shadow-[0_0_8px_oklch(0.78_0.115_240/0.6)]')} />
              {!collapsed && <span className="font-medium">{item.label}</span>}
              {!collapsed && isActive && (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px] shadow-silver" />
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-3 space-y-1 border-t border-sidebar-border/60">
        <NavLink
          to="/settings"
          className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200',
            'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground'
          )}
        >
          <Settings className="w-5 h-5 flex-shrink-0" />
          {!collapsed && <span className="font-medium">Settings</span>}
        </NavLink>

        <button
          onClick={() => signOut()}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200',
            'text-sidebar-foreground/70 hover:bg-destructive/10 hover:text-destructive'
          )}
        >
          <LogOut className="w-5 h-5 flex-shrink-0" />
          {!collapsed && <span className="font-medium">Sign Out</span>}
        </button>

        {/* User info */}
        {!collapsed && user && (
          <div className="px-3 py-2 mt-1">
            <p className="font-mono text-[10px] tracking-wider text-muted-foreground truncate">{user.email}</p>
          </div>
        )}

        {/* Collapse toggle */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCollapsed(!collapsed)}
          className="w-full justify-center text-muted-foreground hover:text-foreground"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </Button>
      </div>
    </aside>
  );
}
