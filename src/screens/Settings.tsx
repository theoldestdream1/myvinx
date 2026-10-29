import { useEffect, useState } from 'react';
import { useNavigate } from "@/lib/router-compat";
import { useAuth } from '@/hooks/useAuth';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { User, Database, LogOut, Trash2, Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { NotificationCard } from '@/components/settings/NotificationCard';
import { InstallCard } from '@/components/settings/InstallCard';
import { AvatarCard } from '@/components/settings/AvatarCard';
import { TelegramCard } from '@/components/settings/TelegramCard';
import { EmailCard } from '@/components/settings/EmailCard';
import { CalendarCard } from '@/components/settings/CalendarCard';
import { QuickCaptureCard } from '@/components/settings/QuickCaptureCard';
import { SearchHealthCard } from '@/components/settings/SearchHealthCard';
import { DeviceKeys } from '@/components/settings/DeviceKeys';

export default function Settings() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const handleExportData = async () => {
    setExporting(true);
    try {
      const [memories, events, entities, intents] = await Promise.all([
        supabase.from('raw_memories').select('*').order('created_at', { ascending: false }),
        supabase.from('structured_events').select('*').order('created_at', { ascending: false }),
        supabase.from('entities').select('*'),
        supabase.from('pending_intents').select('*'),
      ]);
      const firstError = [memories, events, entities, intents].find((r) => r.error)?.error;
      if (firstError) throw firstError;

      const payload = {
        exported_at: new Date().toISOString(),
        raw_memories: memories.data,
        structured_events: events.data,
        entities: entities.data,
        pending_intents: intents.data,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vinx-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Export downloaded');
    } catch (e) {
      console.error(e);
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      const { error } = await supabase.functions.invoke('delete-account');
      if (error) throw error;
      await signOut();
      toast.success('Your account and data were deleted');
      navigate('/');
    } catch (e) {
      console.error(e);
      toast.error('Could not delete your account. Please try again.');
      setDeleting(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Settings</h1>
          <p className="text-muted-foreground mt-1">
            Manage your account and preferences
          </p>
        </div>

        {/* Profile Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5 text-primary" />
              Profile
            </CardTitle>
            <CardDescription>Your account information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-muted-foreground text-sm">Email</Label>
              <p className="text-foreground font-medium">{user.email}</p>
            </div>
            <div>
              <Label className="text-muted-foreground text-sm">Account ID</Label>
              <p className="text-foreground font-mono text-sm">{user.id.slice(0, 8)}...</p>
            </div>
          </CardContent>
        </Card>

        <AvatarCard />
        <InstallCard />
        <NotificationCard />
        <QuickCaptureCard />
        <TelegramCard />
        <EmailCard />
        <CalendarCard />
        <SearchHealthCard />

        {/* Data Management */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5 text-primary" />
              Data Management
            </CardTitle>
            <CardDescription>Export or manage your stored data</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button variant="outline" className="w-full justify-start" onClick={handleExportData} disabled={exporting}>
              {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
              Export All Memories (JSON)
            </Button>
          </CardContent>
        </Card>

        {/* Device Keys (Phase 2 — Android ingestion) */}
        <DeviceKeys />

        {/* Account Actions */}
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="text-destructive">Danger Zone</CardTitle>
            <CardDescription>Irreversible account actions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button variant="outline" className="w-full justify-start" onClick={handleSignOut}>
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="w-full justify-start" disabled={deleting}>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Account
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently deletes your account, every memory, screenshot, and device key. This cannot be undone.
                    Consider exporting your memories first.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteAccount}>Yes, delete everything</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
