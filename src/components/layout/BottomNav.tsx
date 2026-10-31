import { useState } from 'react';
import { NavLink, useLocation } from "@/lib/router-compat";
import { appNavigation } from '@/lib/appNavigation';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Plus,
  Search,
  Clock,
  Settings, Bell, Menu,
} from 'lucide-react';

const navItems = [
  { icon: LayoutDashboard, label: 'Home', path: '/dashboard' },
  { icon: Clock, label: 'Timeline', path: '/timeline' },
  { icon: Plus, label: 'Capture', path: '/capture' },
  { icon: Bell, label: 'Reminders', path: '/intents' },
];

export function BottomNav() {
  const location = useLocation();
  const [open, setOpen] = useState(false);

  return (
    <><nav aria-label="Main navigation" className="device-nav fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background">
      <div className="grid grid-cols-5 items-center h-16 px-1">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const isCapture = item.path === '/capture';

          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={cn(
                'flex min-w-0 flex-col items-center justify-center gap-1 px-1 py-2 rounded-lg transition-colors duration-150',
                isCapture && 'relative -mt-7',
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {isCapture ? (
                <div className="w-14 h-14 press rounded-full bg-gradient-to-b from-primary to-primary/70 flex items-center justify-center shadow-[inset_0_1px_0_oklch(1_0_0/0.5),0_0_0_1px_var(--silver),0_0_28px_-6px_var(--silver)] ring-4 ring-background">
                  <item.icon className="w-6 h-6 text-primary-foreground" />
                </div>
              ) : (
                <item.icon className={cn('w-5 h-5', isActive && 'text-primary drop-shadow-[0_0_6px_var(--silver)]')} />
              )}
              <span className={cn('text-xs font-medium', isCapture && 'mt-1')}>
                {item.label}
              </span>
            </NavLink>
          );
        })}
        <Button variant="ghost" className="h-16 flex-col gap-1 px-1 text-muted-foreground" aria-label="More pages" onClick={() => setOpen(true)}><Menu className="h-5 w-5" /><span className="text-xs">More</span></Button>
      </div>
    </nav><Sheet open={open} onOpenChange={setOpen}><SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto bg-background rounded-t-lg"><SheetHeader><SheetTitle>Everything in Vinx</SheetTitle><SheetDescription>Make yourself at home.</SheetDescription></SheetHeader><nav className="grid grid-cols-2 gap-2 mt-4" aria-label="All pages">{appNavigation.map(item => <Button key={item.path} asChild variant={location.pathname === item.path ? 'secondary' : 'ghost'} className="h-auto min-h-12 justify-start whitespace-normal text-left"><NavLink to={item.path} onClick={() => setOpen(false)}><item.icon className="shrink-0 h-4 w-4" /><span className="min-w-0">{item.label}</span></NavLink></Button>)}</nav></SheetContent></Sheet></>
  );
}
