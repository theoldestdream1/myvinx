-- Create enum for memory sources (simulating Android capture)
CREATE TYPE public.memory_source AS ENUM (
  'whatsapp', 'sms', 'email', 'calendar', 'notes', 
  'voice', 'image', 'browser', 'notification', 'manual'
);

-- Create enum for memory status
CREATE TYPE public.memory_status AS ENUM ('pending', 'processing', 'processed', 'failed');

-- Create enum for intent status
CREATE TYPE public.intent_status AS ENUM ('pending', 'reminded', 'resolved', 'expired');

-- Create profiles table for user data
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  timezone TEXT DEFAULT 'UTC',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Trigger to create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (new.id, new.raw_user_meta_data ->> 'display_name');
  RETURN new;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Raw memories table (original captured content)
CREATE TABLE public.raw_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source memory_source NOT NULL DEFAULT 'manual',
  raw_content TEXT NOT NULL,
  media_url TEXT,
  metadata JSONB DEFAULT '{}',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status memory_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.raw_memories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own memories"
  ON public.raw_memories FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own memories"
  ON public.raw_memories FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own memories"
  ON public.raw_memories FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own memories"
  ON public.raw_memories FOR DELETE
  USING (auth.uid() = user_id);

-- Entities table (people, places, topics - graph nodes)
CREATE TABLE public.entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  entity_type TEXT NOT NULL, -- person, place, topic, organization, event
  attributes JSONB DEFAULT '{}',
  mention_count INTEGER DEFAULT 1,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, name, entity_type)
);

ALTER TABLE public.entities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own entities"
  ON public.entities FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own entities"
  ON public.entities FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own entities"
  ON public.entities FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own entities"
  ON public.entities FOR DELETE
  USING (auth.uid() = user_id);

-- Structured events (parsed who/what/when/where)
CREATE TABLE public.structured_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  raw_memory_id UUID REFERENCES public.raw_memories(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  summary TEXT,
  event_date TIMESTAMPTZ,
  location TEXT,
  participants TEXT[],
  topics TEXT[],
  salience_score REAL DEFAULT 0.5, -- 0-1 importance
  emotional_tone TEXT,
  confidence_score REAL DEFAULT 0.8,
  is_private BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.structured_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own events"
  ON public.structured_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own events"
  ON public.structured_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own events"
  ON public.structured_events FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own events"
  ON public.structured_events FOR DELETE
  USING (auth.uid() = user_id);

-- Entity relationships (knowledge graph edges)
CREATE TABLE public.entity_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_a_id UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  entity_b_id UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL, -- works_with, friends_with, located_at, related_to
  strength REAL DEFAULT 1.0,
  context TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, entity_a_id, entity_b_id, relationship_type)
);

ALTER TABLE public.entity_relationships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own relationships"
  ON public.entity_relationships FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own relationships"
  ON public.entity_relationships FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own relationships"
  ON public.entity_relationships FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own relationships"
  ON public.entity_relationships FOR DELETE
  USING (auth.uid() = user_id);

-- Pending intents (future actions to surface)
CREATE TABLE public.pending_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  raw_memory_id UUID REFERENCES public.raw_memories(id) ON DELETE SET NULL,
  structured_event_id UUID REFERENCES public.structured_events(id) ON DELETE SET NULL,
  intent_text TEXT NOT NULL,
  trigger_type TEXT NOT NULL, -- date, location, context, person
  trigger_value TEXT,
  trigger_date TIMESTAMPTZ,
  priority REAL DEFAULT 0.5,
  status intent_status NOT NULL DEFAULT 'pending',
  reminded_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pending_intents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own intents"
  ON public.pending_intents FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own intents"
  ON public.pending_intents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own intents"
  ON public.pending_intents FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own intents"
  ON public.pending_intents FOR DELETE
  USING (auth.uid() = user_id);

-- Memory vectors for semantic search
CREATE TABLE public.memory_vectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  structured_event_id UUID REFERENCES public.structured_events(id) ON DELETE CASCADE,
  content_text TEXT NOT NULL,
  embedding_text TEXT, -- Will store as text, parsed in app
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.memory_vectors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own vectors"
  ON public.memory_vectors FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own vectors"
  ON public.memory_vectors FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own vectors"
  ON public.memory_vectors FOR DELETE
  USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX idx_raw_memories_user_id ON public.raw_memories(user_id);
CREATE INDEX idx_raw_memories_status ON public.raw_memories(status);
CREATE INDEX idx_structured_events_user_id ON public.structured_events(user_id);
CREATE INDEX idx_structured_events_date ON public.structured_events(event_date);
CREATE INDEX idx_entities_user_id ON public.entities(user_id);
CREATE INDEX idx_entities_type ON public.entities(entity_type);
CREATE INDEX idx_pending_intents_user_id ON public.pending_intents(user_id);
CREATE INDEX idx_pending_intents_status ON public.pending_intents(status);
CREATE INDEX idx_pending_intents_trigger_date ON public.pending_intents(trigger_date);

-- Updated at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();