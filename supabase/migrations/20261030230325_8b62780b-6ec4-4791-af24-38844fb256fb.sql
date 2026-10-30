ALTER TABLE public.raw_memories ADD COLUMN deleted_at timestamptz, ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.structured_events ADD COLUMN deleted_at timestamptz;
ALTER TABLE public.memory_vectors ADD COLUMN deleted_at timestamptz;
ALTER TABLE public.pending_intents ADD COLUMN deleted_at timestamptz;
CREATE TRIGGER update_memories_updated_at BEFORE UPDATE ON public.raw_memories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX raw_memories_trash_idx ON public.raw_memories(user_id, deleted_at);
CREATE UNIQUE INDEX memory_vectors_event_upsert_unique ON public.memory_vectors(structured_event_id);

CREATE OR REPLACE FUNCTION public.inherit_memory_visibility() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE parent public.raw_memories;
BEGIN
 IF NEW.raw_memory_id IS NOT NULL THEN
  SELECT * INTO parent FROM public.raw_memories WHERE id=NEW.raw_memory_id FOR SHARE;
  IF NOT FOUND OR parent.user_id<>NEW.user_id THEN RAISE EXCEPTION 'Invalid memory owner'; END IF;
  NEW.deleted_at:=parent.deleted_at;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.inherit_memory_visibility() FROM PUBLIC;
CREATE TRIGGER event_memory_visibility BEFORE INSERT OR UPDATE ON public.structured_events FOR EACH ROW EXECUTE FUNCTION public.inherit_memory_visibility();
CREATE TRIGGER vector_memory_visibility BEFORE INSERT OR UPDATE ON public.memory_vectors FOR EACH ROW EXECUTE FUNCTION public.inherit_memory_visibility();
CREATE TRIGGER intent_memory_visibility BEFORE INSERT OR UPDATE ON public.pending_intents FOR EACH ROW EXECUTE FUNCTION public.inherit_memory_visibility();
CREATE OR REPLACE FUNCTION public.sync_memory_visibility() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
  UPDATE public.structured_events SET deleted_at=NEW.deleted_at WHERE raw_memory_id=NEW.id;
  UPDATE public.memory_vectors SET deleted_at=NEW.deleted_at WHERE raw_memory_id=NEW.id;
  UPDATE public.pending_intents SET deleted_at=NEW.deleted_at WHERE raw_memory_id=NEW.id;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sync_memory_visibility() FROM PUBLIC;
CREATE TRIGGER sync_memory_trash AFTER UPDATE OF deleted_at ON public.raw_memories FOR EACH ROW EXECUTE FUNCTION public.sync_memory_visibility();
CREATE POLICY active_events_only ON public.structured_events AS RESTRICTIVE FOR SELECT TO authenticated USING (deleted_at IS NULL);
CREATE POLICY active_vectors_only ON public.memory_vectors AS RESTRICTIVE FOR SELECT TO authenticated USING (deleted_at IS NULL);
CREATE POLICY active_intents_only ON public.pending_intents AS RESTRICTIVE FOR SELECT TO authenticated USING (deleted_at IS NULL);

CREATE OR REPLACE FUNCTION public.memory_lifecycle(_id uuid, _action text, _expected_updated_at timestamptz, _content text DEFAULT NULL, _event_id uuid DEFAULT NULL, _title text DEFAULT NULL, _summary text DEFAULT NULL, _topics text[] DEFAULT NULL) RETURNS public.raw_memories LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE m public.raw_memories; ev public.structured_events; txt text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 SELECT * INTO m FROM public.raw_memories WHERE id=_id AND user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Memory not found'; END IF;
 IF _expected_updated_at IS NULL OR m.updated_at IS DISTINCT FROM _expected_updated_at THEN RAISE EXCEPTION 'Memory changed. Refresh and try again.'; END IF;
 IF _action='trash' THEN
  IF m.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Already in Trash'; END IF;
  UPDATE public.raw_memories SET deleted_at=now() WHERE id=m.id RETURNING * INTO m;
 ELSIF _action='restore' THEN
  IF m.deleted_at IS NULL THEN RAISE EXCEPTION 'Memory is not in Trash'; END IF;
  UPDATE public.raw_memories SET deleted_at=NULL WHERE id=m.id RETURNING * INTO m;
 ELSIF _action='purge' THEN
  IF m.deleted_at IS NULL THEN RAISE EXCEPTION 'Move to Trash before deleting permanently'; END IF;
  DELETE FROM public.raw_memories WHERE id=m.id;
 ELSIF _action='edit' THEN
  IF m.deleted_at IS NOT NULL OR m.status<>'processed' THEN RAISE EXCEPTION 'Wait until V has finished reading before editing'; END IF;
  IF _content IS NULL OR length(btrim(_content))=0 THEN RAISE EXCEPTION 'Note cannot be empty'; END IF;
  IF _event_id IS NOT NULL THEN
   SELECT * INTO ev FROM public.structured_events WHERE id=_event_id AND raw_memory_id=m.id AND user_id=auth.uid() FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Insight not found'; END IF;
   IF _title IS NULL OR length(btrim(_title))=0 THEN RAISE EXCEPTION 'Title cannot be empty'; END IF;
   UPDATE public.structured_events SET title=btrim(_title), summary=NULLIF(btrim(_summary),''), topics=COALESCE(_topics,'{}') WHERE id=ev.id;
  END IF;
  UPDATE public.raw_memories SET raw_content=btrim(_content) WHERE id=m.id RETURNING * INTO m;
  UPDATE public.memory_vectors v SET content_text=concat_ws(E'\n', e.title,e.summary,array_to_string(e.topics,', '),array_to_string(e.participants,', '),e.location,m.raw_content,m.metadata->>'image_description',m.metadata->>'extracted_text'), embedding=NULL, embedding_model=NULL FROM public.structured_events e WHERE v.structured_event_id=e.id AND e.raw_memory_id=m.id;
 ELSE RAISE EXCEPTION 'Unknown memory action'; END IF;
 RETURN m;
END $$;
REVOKE ALL ON FUNCTION public.memory_lifecycle(uuid,text,timestamptz,text,uuid,text,text,text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.memory_lifecycle(uuid,text,timestamptz,text,uuid,text,text,text[]) TO authenticated;

DO $$ DECLARE def text; BEGIN
 SELECT pg_get_functiondef(oid) INTO def FROM pg_proc WHERE oid='public.match_memories(uuid,extensions.vector,text,integer,timestamptz,timestamptz,text)'::regprocedure;
 def:=replace(def,'WHERE mv.user_id = _user_id','WHERE mv.user_id = _user_id AND mv.deleted_at IS NULL AND rm.deleted_at IS NULL AND se.deleted_at IS NULL'); EXECUTE def;
 SELECT pg_get_functiondef(oid) INTO def FROM pg_proc WHERE oid='public.build_brief(uuid,text,text)'::regprocedure;
 def:=replace(def,'WHERE user_id = _user_id','WHERE deleted_at IS NULL AND user_id = _user_id');
 def:=replace(def,'WHERE se.user_id = _user_id','WHERE se.deleted_at IS NULL AND se.user_id = _user_id'); EXECUTE def;
 SELECT pg_get_functiondef(oid) INTO def FROM pg_proc WHERE oid='public.claim_due_intents(integer)'::regprocedure;
 def:=replace(def,'WHERE i.status =','WHERE i.deleted_at IS NULL AND i.status ='); EXECUTE def;
 SELECT pg_get_functiondef(oid) INTO def FROM pg_proc WHERE oid='public.claim_stuck_memories(integer)'::regprocedure;
 def:=replace(def,'WHERE m.process_attempts <','WHERE m.deleted_at IS NULL AND m.process_attempts <'); EXECUTE def;
 SELECT pg_get_functiondef(oid) INTO def FROM pg_proc WHERE oid='public.memory_search_stats(uuid)'::regprocedure;
 def:=replace(def,'WHERE user_id = _user_id','WHERE deleted_at IS NULL AND user_id = _user_id'); EXECUTE def;
END $$;