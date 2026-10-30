CREATE TABLE public.memory_media_cleanup (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, paths text[] NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT, DELETE ON public.memory_media_cleanup TO authenticated;
GRANT ALL ON public.memory_media_cleanup TO service_role;
ALTER TABLE public.memory_media_cleanup ENABLE ROW LEVEL SECURITY;
CREATE POLICY cleanup_read ON public.memory_media_cleanup FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY cleanup_insert ON public.memory_media_cleanup FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid());
CREATE POLICY cleanup_delete ON public.memory_media_cleanup FOR DELETE TO authenticated USING(user_id=auth.uid());
CREATE TRIGGER update_cleanup_updated_at BEFORE UPDATE ON public.memory_media_cleanup FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE OR REPLACE FUNCTION public.queue_memory_media_cleanup() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p text[];
BEGIN
 SELECT array_agg(DISTINCT path) INTO p FROM unnest(ARRAY[OLD.media_url,OLD.metadata->>'audio_path']) path WHERE path LIKE OLD.user_id::text || '/%';
 IF cardinality(p)>0 THEN INSERT INTO public.memory_media_cleanup(user_id,paths) VALUES(OLD.user_id,p); END IF;
 RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION public.queue_memory_media_cleanup() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER queue_memory_files BEFORE DELETE ON public.raw_memories FOR EACH ROW EXECUTE FUNCTION public.queue_memory_media_cleanup();
CREATE OR REPLACE FUNCTION public.inherit_memory_visibility() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE parent public.raw_memories; event_owner uuid; linked_id uuid;
BEGIN
 IF TG_OP='UPDATE' AND OLD.raw_memory_id IS NOT NULL AND NEW.raw_memory_id IS DISTINCT FROM OLD.raw_memory_id THEN RAISE EXCEPTION 'Cannot detach a linked memory'; END IF;
 linked_id:=NEW.raw_memory_id;
 IF TG_TABLE_NAME IN ('memory_vectors','pending_intents') THEN
  IF NEW.structured_event_id IS NOT NULL THEN
   SELECT user_id,raw_memory_id INTO event_owner,linked_id FROM public.structured_events WHERE id=NEW.structured_event_id;
   IF event_owner IS DISTINCT FROM NEW.user_id THEN RAISE EXCEPTION 'Invalid insight owner'; END IF;
   IF NEW.raw_memory_id IS NOT NULL AND linked_id IS DISTINCT FROM NEW.raw_memory_id THEN RAISE EXCEPTION 'Mismatched source memory'; END IF;
   NEW.raw_memory_id:=linked_id;
  END IF;
 END IF;
 IF linked_id IS NOT NULL THEN
  SELECT * INTO parent FROM public.raw_memories WHERE id=linked_id FOR SHARE;
  IF NOT FOUND OR parent.user_id<>NEW.user_id THEN RAISE EXCEPTION 'Invalid memory owner'; END IF;
  NEW.deleted_at:=parent.deleted_at;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.inherit_memory_visibility() FROM PUBLIC, anon, authenticated;