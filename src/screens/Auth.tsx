import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from "@/lib/router-compat";
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Eye, EyeOff, Loader2, MailCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const RETURNING_KEY = 'vinx.returning.v1';
import { z } from 'zod';
import { PASSWORD_RULES, passwordProblem } from '@/lib/password';

const authSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
  displayName: z.string().min(2, 'Name must be at least 2 characters').optional(),
});

export default function Auth() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { signIn, signUp, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Only follow same-site paths (blocks open redirects like ?next=//evil.com)
  const rawNext = searchParams.get('next');
  const next = rawNext && rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/dashboard';

  // New devices land on sign up; devices that have signed in before land on sign in.
  useEffect(() => {
    const mode = searchParams.get('mode');
    if (mode === 'signup') setIsSignUp(true);
    else if (mode === 'signin') setIsSignUp(false);
    else { try { setIsSignUp(!localStorage.getItem(RETURNING_KEY)); } catch { setIsSignUp(true); } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (user) {
      try { localStorage.setItem(RETURNING_KEY, '1'); } catch { /* storage blocked */ }
      navigate(next, { replace: true });
    }
  }, [user, navigate, next]);

  // While waiting on the confirmation link: when it's clicked in this browser (another tab),
  // the session arrives through storage and the user is taken in automatically.
  useEffect(() => {
    if (!pendingEmail) return;
    const check = () => supabase.auth.getUser().then(({ data }) => { if (data.user?.email_confirmed_at) navigate(next, { replace: true }); });
    const id = window.setInterval(check, 4000);
    window.addEventListener('focus', check);
    return () => { window.clearInterval(id); window.removeEventListener('focus', check); };
  }, [pendingEmail, navigate, next]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  const resend = async () => {
    if (!pendingEmail || cooldown > 0) return;
    const { error } = await supabase.auth.resend({ type: 'signup', email: pendingEmail, options: { emailRedirectTo: `${window.location.origin}/auth?confirmed=1` } });
    if (error) toast.error(error.message); else { toast.success('Sent again. Check your inbox.'); setCooldown(60); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const validationData = isSignUp 
        ? { email, password, displayName } 
        : { email, password };
      
      authSchema.parse(validationData);
      const weak = isSignUp ? passwordProblem(password) : null;
      if (weak) { toast.error(weak); return; }

      if (isSignUp) {
        const { error, needsConfirmation, exists } = await signUp(email, password, displayName);
        if (exists) {
          toast.error('This email is already registered. Please sign in instead.');
        } else if (error) {
          if (error.message.includes('already registered')) {
            toast.error('This email is already registered. Please sign in instead.');
          } else {
            toast.error(error.message);
          }
        } else if (needsConfirmation) {
          setPendingEmail(email.trim().toLowerCase());
          setPassword('');
          setCooldown(60);
        } else {
          toast.success('Account created! Welcome to Vinx.');
        }
      } else {
        const { error } = await signIn(email, password);
        if (error) {
          if (/email not confirmed/i.test(error.message)) {
            setPendingEmail(email.trim().toLowerCase());
            toast.error('Confirm your email first. We can send the link again.');
          } else if (error.message.includes('Invalid login')) {
            toast.error('Invalid email or password. Please try again.');
          } else {
            toast.error(error.message);
          }
        } else {
          toast.success('Welcome back!');
        }
      }
    } catch (err) {
      if (err instanceof z.ZodError) {
        toast.error(err.errors[0].message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background relative overflow-hidden">
      {/* Background effects */}
      <div className="pointer-events-none absolute inset-0 aurora" />
      <div className="pointer-events-none absolute inset-0 v-grain" />

      <Card className="w-full max-w-md card-lit glass relative z-10">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto relative w-16 h-16 flex items-center justify-center">
            <div className="absolute inset-0 rotate-45 rounded-[28%] bg-gradient-to-br from-primary via-primary/40 to-transparent" />
            <div className="absolute inset-[3px] rotate-45 rounded-[26%] bg-card" />
            <span className="relative font-display italic text-3xl text-primary leading-none translate-y-0.5">V</span>
          </div>
          <div>
            <p className="eyebrow mb-2">{isSignUp ? 'New here' : 'Welcome back'}</p>
            <CardTitle className="font-display text-4xl tracking-tight">
              {isSignUp ? (
                <>Meet your <span className="serif-accent">second brain.</span></>
              ) : (
                <>Your memories <span className="serif-accent">missed you.</span></>
              )}
            </CardTitle>
            <CardDescription className="text-muted-foreground mt-3">
              {isSignUp ? 'Create your personal memory OS' : 'Sign in to pick up where you left off'}
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent>
          {pendingEmail ? (
            <div className="space-y-5 text-center" role="status" aria-live="polite">
              <span className="icon-well mx-auto h-12 w-12"><MailCheck className="h-5 w-5" /></span>
              <div className="space-y-2">
                <p className="font-display text-2xl">Check your inbox.</p>
                <p className="text-sm text-muted-foreground">I sent a confirmation link to <span className="font-medium text-foreground break-all">{pendingEmail}</span>. Tap it and I'll let you in. This page moves on by itself.</p>
              </div>
              <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Waiting for you to confirm…</p>
              <Button type="button" variant="outline" className="w-full rounded-full" disabled={cooldown > 0} onClick={resend}>
                {cooldown > 0 ? `Resend link in ${cooldown}s` : 'Resend confirmation link'}
              </Button>
              <button type="button" onClick={() => { setPendingEmail(null); setIsSignUp(false); }} className="text-sm text-muted-foreground hover:text-primary transition-colors">
                Wrong email, or already confirmed? Sign in
              </button>
            </div>
          ) : (<>
          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <div className="space-y-2">
                <Label htmlFor="displayName" className="text-foreground">Display Name</Label>
                <Input
                  id="displayName"
                  type="text"
                  placeholder="How should we call you?"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="bg-muted/50 border-border/50 focus:border-primary"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email" className="text-foreground">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="bg-muted/50 border-border/50 focus:border-primary"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-foreground">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="bg-muted/50 border-border/50 focus:border-primary pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {isSignUp && (
                <ul aria-label="Password requirements" className="grid grid-cols-2 gap-1 pt-1 text-xs">
                  {PASSWORD_RULES.map(r => {
                    const ok = r.test(password);
                    return <li key={r.id} className={ok ? 'text-primary' : 'text-muted-foreground'}>{ok ? '✓' : '•'} {r.label}</li>;
                  })}
                </ul>
              )}
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-all"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {isSignUp ? 'Creating...' : 'Signing in...'}
                </span>
              ) : (
                isSignUp ? 'Create Account' : 'Sign In'
              )}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
            </button>
          </div>
          </>)}
        </CardContent>
      </Card>
    </div>
  );
}
