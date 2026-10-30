import { PageHeader } from '@/components/layout/PageHeader';
import { useEffect, useState, useRef } from 'react';
import { useNavigate } from "@/lib/router-compat";
import { useAuth } from '@/hooks/useAuth';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { vAgent } from '@/lib/avatar/bus';
import { lines, spokenSummary } from '@/lib/avatar/scripts';
import { Badge } from '@/components/ui/badge';
import { describeRepair, repairSearch } from '@/lib/searchRepair';
import { format } from 'date-fns';
import { Search, Send, Loader2, MessageSquare, User, Image as ImageIcon } from 'lucide-react';
import { RichAnswer } from '@/components/query/RichAnswer';

interface Source {
  index: number;
  structured_event_id: string | null;
  raw_memory_id: string | null;
  title: string;
  summary: string | null;
  date: string | null;
  source: string | null;
  image_url: string | null;
  excerpt: string;
}

interface SearchInfo {
  semantic: boolean;
  embedding_error: string | null;
  stats: { failed: number; waiting: number; total: number; processed: number } | null;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  sourcesKind?: 'cited' | 'closest';
  search?: SearchInfo;
}

/** Explains (and offers to fix) the usual reasons a search comes back thin. */
function SearchNotice({ info }: { info: SearchInfo }) {
  const [busy, setBusy] = useState(false);
  const failed = info.stats?.failed ?? 0;
  const waiting = info.stats?.waiting ?? 0;
  if (info.semantic && failed === 0 && waiting === 0) return null;

  const fix = async () => {
    setBusy(true);
    try {
      const r = await repairSearch();
      if (r.problem) toast.error(r.problem);
      else toast.success(`Done: ${describeRepair(r)}. Ask again.`);
    } finally {
      setBusy(false);
    }
  };

  const reasons: string[] = [];
  if (!info.semantic) reasons.push('Search by meaning is off right now, so I matched on keywords only.');
  if (failed > 0) reasons.push(`${failed} saved ${failed === 1 ? 'item' : 'items'} couldn't be read yet.`);
  if (waiting > 0) reasons.push(`${waiting} ${waiting === 1 ? 'item is' : 'items are'} still being processed.`);

  return (
    <div className="mt-3 rounded-md border border-yellow-500/30 bg-yellow-500/5 p-3 text-xs text-muted-foreground">
      <p>{reasons.join(' ')}</p>
      {!info.semantic && info.embedding_error && <p className="mt-1 break-words opacity-70">{info.embedding_error}</p>}
      <Button size="sm" variant="outline" className="mt-2 h-7" onClick={fix} disabled={busy}>
        {busy ? 'Fixing…' : 'Fix it'}
      </Button>
    </div>
  );
}

const EXAMPLES = [
  'What did Sarah say about the project deadline?',
  'That pricing screenshot from last month',
  'What do I still need to follow up on?',
];

function SourceCards({ sources, kind }: { sources: Source[]; kind?: 'cited' | 'closest' }) {
  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {kind === 'closest' ? 'Closest matches (not an exact fit)' : 'From your memories'}
      </p>
      {sources.slice(0, 4).map((s) => (
        <div key={s.index} className="flex gap-3 rounded-lg border border-border/50 bg-muted/30 p-3">
          {s.image_url ? (
            <a href={s.image_url} target="_blank" rel="noreferrer" className="shrink-0">
              <img src={s.image_url} alt={s.title} className="h-16 w-16 rounded-md object-cover" />
            </a>
          ) : null}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-muted-foreground">[{s.index}]</span>
              <p className="truncate text-sm font-medium text-foreground">{s.title}</p>
            </div>
            {s.summary && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{s.summary}</p>}
            <div className="mt-2 flex items-center gap-2">
              {s.source && (
                <Badge variant="outline" className="text-[10px] capitalize">
                  {s.source === 'image' && <ImageIcon className="mr-1 h-3 w-3" />}
                  {s.source}
                </Badge>
              )}
              {s.date && (
                <span className="text-xs text-muted-foreground">{format(new Date(s.date), 'MMM d, yyyy')}</span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Query() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isQuerying, setIsQuerying] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const ask = async (text: string) => {
    const userMessage = text.trim();
    if (!userMessage || isQuerying) return;

    // Send the last few turns so follow-up questions have context
    const history = messages.slice(-6).map((m) => ({ role: m.role, content: m.content }));

    setQuery('');
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setIsQuerying(true);
    vAgent.thinking();

    try {
      const { data, error } = await supabase.functions.invoke('query-memories', {
        body: { query: userMessage, history },
      });

      if (error) throw error;

      const foundSomething = (data.sources?.length ?? 0) > 0;
      const spoken = spokenSummary(String(data.response ?? ''));
      vAgent.say(spoken || (foundSomething ? lines.found().text : lines.notFound().text), foundSomething ? 'happy' : 'concerned');

      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data.response, sources: data.sources ?? [], sourcesKind: data.sources_kind, search: data.search },
      ]);
    } catch (err) {
      console.error('Query error:', err);
      toast.error('Failed to query memories');
      vAgent.say(lines.error().text, 'concerned');
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Sorry, I encountered an error while searching your memories. Please try again.' },
      ]);
    } finally {
      vAgent.idle();
      setIsQuerying(false);
    }
  };

  const handleQuery = (e: React.FormEvent) => {
    e.preventDefault();
    ask(query);
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <AppLayout>
      <div className="flex-1 flex flex-col h-full">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-border/40">
          <PageHeader eyebrow="Ask" title={<>Ask V <span className="serif-accent">anything</span></>} sub="Questions in plain words, answered from your memories." />
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-auto p-6 space-y-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center mb-4">
                <Search className="w-8 h-8 text-primary-foreground" />
              </div>
              <h2 className="text-xl font-semibold text-foreground mb-2">Ask me anything</h2>
              <p className="text-muted-foreground max-w-md mb-6">
                Describe it the way you remember it. Rough details are fine.
              </p>
              <div className="flex flex-wrap justify-center gap-2 max-w-xl">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => ask(ex)}
                    className="rounded-full border border-border/60 bg-muted/40 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center flex-shrink-0">
                    <MessageSquare className="w-4 h-4 text-primary-foreground" />
                  </div>
                )}
                <Card
                  className={`max-w-[80%] ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-card/50 border-border/50'
                  }`}
                >
                  <CardContent className="p-3">
                    {msg.role === 'assistant' ? <RichAnswer text={msg.content} /> : <p className="text-sm whitespace-pre-wrap">{msg.content}</p>}
                    {msg.sources && msg.sources.length > 0 && <SourceCards sources={msg.sources} kind={msg.sourcesKind} />}
                    {msg.search && i === messages.length - 1 && <SearchNotice info={msg.search} />}
                  </CardContent>
                </Card>
                {msg.role === 'user' && (
                  <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                    <User className="w-4 h-4 text-muted-foreground" />
                  </div>
                )}
              </div>
            ))
          )}
          {isQuerying && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center flex-shrink-0">
                <MessageSquare className="w-4 h-4 text-primary-foreground animate-pulse" />
              </div>
              <Card className="bg-card/50 border-border/50">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Searching memories...</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-6 border-t border-border">
          <form onSubmit={handleQuery} className="flex gap-3">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. the guy who recommended that book on pricing..."
              className="flex-1 bg-muted/50 border-border/50 focus:border-primary"
              disabled={isQuerying}
            />
            <Button
              type="submit"
              disabled={isQuerying || !query.trim()}
              className="gradient-primary text-primary-foreground"
            >
              {isQuerying ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </form>
        </div>
      </div>
    </AppLayout>
  );
}
