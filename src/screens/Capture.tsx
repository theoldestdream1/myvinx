import { useEffect } from 'react';
import { useNavigate } from "@/lib/router-compat";
import { useAuth } from '@/hooks/useAuth';
import { AppLayout } from '@/components/layout/AppLayout';
import { CaptureForm } from '@/components/capture/CaptureForm';

export default function Capture() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

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

  return (
    <AppLayout>
      <div className="p-6 lg:p-8">
        <div className="max-w-3xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-foreground">Capture Memory</h1>
            <p className="text-muted-foreground mt-1">
              Add a new memory to be processed by the AI agents
            </p>
          </div>
          <CaptureForm />
        </div>
      </div>
    </AppLayout>
  );
}
