import { LayoutDashboard, Plus, Clock, Search, Network, Bell, CreditCard, Settings, Smartphone } from 'lucide-react';
export const appNavigation = [
  { icon: LayoutDashboard, label: 'Home', path: '/dashboard' },
  { icon: Clock, label: 'Timeline', path: '/timeline' },
  { icon: Plus, label: 'Capture', path: '/capture' },
  { icon: Bell, label: 'Reminders', path: '/intents' },
  { icon: Search, label: 'Ask V', path: '/query' },
  { icon: Network, label: 'Knowledge graph', path: '/graph' },
  { icon: CreditCard, label: 'Plans & pricing', path: '/pricing' },
  { icon: Smartphone, label: 'Shortcuts', path: '/setup/shortcuts' },
  { icon: Settings, label: 'Settings', path: '/settings' },
];