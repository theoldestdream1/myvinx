CREATE OR REPLACE FUNCTION public.advance_recurring_reminder() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE next_date timestamptz;
BEGIN
 IF OLD.status IN ('pending','reminded') AND NEW.status='resolved' AND NEW.repeat_frequency<>'none' AND NEW.deleted_at IS NULL THEN
 next_date:=public.next_reminder_date(coalesce(NEW.scheduled_for,NEW.trigger_date),NEW.repeat_frequency,NEW.repeat_interval,NEW.repeat_timezone,greatest(now(),coalesce(NEW.trigger_date,now())));
 INSERT INTO public.pending_intents(user_id,raw_memory_id,structured_event_id,intent_text,trigger_type,trigger_value,trigger_date,priority,repeat_frequency,repeat_interval,repeat_timezone,scheduled_for,previous_occurrence_id)
 VALUES(NEW.user_id,NEW.raw_memory_id,NEW.structured_event_id,NEW.intent_text,'date',NEW.trigger_value,next_date,NEW.priority,NEW.repeat_frequency,NEW.repeat_interval,NEW.repeat_timezone,coalesce(NEW.scheduled_for,NEW.trigger_date),NEW.id)
 ON CONFLICT (previous_occurrence_id) WHERE previous_occurrence_id IS NOT NULL DO NOTHING;
 END IF;
 RETURN NEW;
END $$;