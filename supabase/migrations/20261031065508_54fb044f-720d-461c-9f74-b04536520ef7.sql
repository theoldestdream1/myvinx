ALTER TABLE public.pending_intents ADD COLUMN repeat_frequency text NOT NULL DEFAULT 'none', ADD COLUMN repeat_interval integer NOT NULL DEFAULT 1, ADD COLUMN repeat_timezone text NOT NULL DEFAULT 'UTC', ADD COLUMN scheduled_for timestamptz, ADD COLUMN previous_occurrence_id uuid;
CREATE UNIQUE INDEX pending_intents_previous_occurrence ON public.pending_intents(previous_occurrence_id) WHERE previous_occurrence_id IS NOT NULL;
CREATE OR REPLACE FUNCTION public.next_reminder_date(_anchor timestamptz, _frequency text, _interval integer, _timezone text, _after timestamptz) RETURNS timestamptz LANGUAGE plpgsql SET search_path=public AS $$
DECLARE local_anchor timestamp; candidate timestamp; result timestamptz; n integer:=1; days integer; month_start timestamp;
BEGIN
 IF _frequency NOT IN ('daily','weekly','monthly','weekdays') OR _frequency IS NULL OR _interval IS NULL OR _interval<1 OR _interval>365 OR _anchor IS NULL OR _after IS NULL OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=_timezone) THEN RAISE EXCEPTION 'Invalid repeat schedule'; END IF;
 local_anchor:=_anchor AT TIME ZONE _timezone;
 IF _frequency='monthly' THEN
 n:=greatest(1, floor(((extract(year FROM (_after AT TIME ZONE _timezone))-extract(year FROM local_anchor))*12+extract(month FROM (_after AT TIME ZONE _timezone))-extract(month FROM local_anchor))/_interval)::integer);
 ELSE
 days:=CASE WHEN _frequency='weekly' THEN 7*_interval ELSE _interval END;
 n:=greatest(1,floor(((_after AT TIME ZONE _timezone)::date-local_anchor::date)::numeric/days)::integer);
 END IF;
 LOOP
 IF _frequency='monthly' THEN
 month_start:=date_trunc('month',local_anchor)+make_interval(months=>n*_interval);
 candidate:=month_start+(least(extract(day FROM local_anchor)::integer,extract(day FROM month_start+interval '1 month - 1 day')::integer)-1)*interval '1 day'+local_anchor::time;
 ELSE
 candidate:=local_anchor+make_interval(days=>n*days);
 IF _frequency='weekdays' THEN
 WHILE extract(isodow FROM candidate)>5 LOOP candidate:=candidate+interval '1 day'; END LOOP;
 END IF;
 END IF;
 result:=candidate AT TIME ZONE _timezone;
 IF result>_after THEN RETURN result; END IF;
 n:=n+1;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.next_reminder_date(timestamptz,text,integer,text,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.next_reminder_date(timestamptz,text,integer,text,timestamptz) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.validate_reminder_schedule() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.repeat_frequency NOT IN ('none','daily','weekly','monthly','weekdays') OR NEW.repeat_interval<1 OR NEW.repeat_interval>365 OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=NEW.repeat_timezone) THEN RAISE EXCEPTION 'Invalid repeat schedule'; END IF;
 IF NEW.repeat_frequency<>'none' AND (NEW.trigger_type<>'date' OR NEW.trigger_date IS NULL) THEN RAISE EXCEPTION 'Repeating reminders need a date'; END IF;
 IF NEW.repeat_frequency<>'none' AND NEW.scheduled_for IS NULL THEN NEW.scheduled_for:=NEW.trigger_date; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_reminder_schedule BEFORE INSERT OR UPDATE ON public.pending_intents FOR EACH ROW EXECUTE FUNCTION public.validate_reminder_schedule();
CREATE OR REPLACE FUNCTION public.advance_recurring_reminder() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE next_date timestamptz;
BEGIN
 IF OLD.status IN ('pending','reminded') AND NEW.status='resolved' AND NEW.repeat_frequency<>'none' AND NEW.deleted_at IS NULL THEN
 next_date:=public.next_reminder_date(coalesce(NEW.scheduled_for,NEW.trigger_date),NEW.repeat_frequency,NEW.repeat_interval,NEW.repeat_timezone,greatest(now(),coalesce(NEW.trigger_date,now())));
 INSERT INTO public.pending_intents(user_id,raw_memory_id,structured_event_id,intent_text,trigger_type,trigger_value,trigger_date,priority,repeat_frequency,repeat_interval,repeat_timezone,scheduled_for,previous_occurrence_id)
 VALUES(NEW.user_id,NEW.raw_memory_id,NEW.structured_event_id,NEW.intent_text,'date',NEW.trigger_value,next_date,NEW.priority,NEW.repeat_frequency,NEW.repeat_interval,NEW.repeat_timezone,
 CASE WHEN NEW.repeat_frequency='monthly' THEN (date_trunc('month',next_date AT TIME ZONE NEW.repeat_timezone)+(extract(day FROM coalesce(NEW.scheduled_for,NEW.trigger_date) AT TIME ZONE NEW.repeat_timezone)::integer-1)*interval '1 day'+(next_date AT TIME ZONE NEW.repeat_timezone)::time) AT TIME ZONE NEW.repeat_timezone ELSE next_date END,NEW.id)
 ON CONFLICT (previous_occurrence_id) WHERE previous_occurrence_id IS NOT NULL DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER advance_recurring_reminder AFTER UPDATE OF status ON public.pending_intents FOR EACH ROW EXECUTE FUNCTION public.advance_recurring_reminder();
REVOKE ALL ON FUNCTION public.advance_recurring_reminder() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.reminder_action(_id uuid,_action text,_date timestamptz DEFAULT NULL,_frequency text DEFAULT 'none',_interval integer DEFAULT 1,_timezone text DEFAULT 'UTC') RETURNS public.pending_intents LANGUAGE plpgsql SET search_path=public AS $$
DECLARE item public.pending_intents;
BEGIN
 SELECT * INTO item FROM public.pending_intents WHERE id=_id AND user_id=auth.uid() AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Reminder unavailable'; END IF;
 IF item.status NOT IN ('pending','reminded') THEN RAISE EXCEPTION 'Reminder already completed'; END IF;
 IF _action='done' THEN UPDATE public.pending_intents SET status='resolved',resolved_at=now() WHERE id=_id RETURNING * INTO item;
 ELSIF _action='snooze' THEN
 IF _date IS NULL OR _date<=now() THEN RAISE EXCEPTION 'Choose a future snooze time'; END IF;
 UPDATE public.pending_intents SET status='pending',trigger_type='date',trigger_date=_date,reminded_at=NULL WHERE id=_id RETURNING * INTO item;
 ELSIF _action='schedule' THEN
 IF _frequency<>'none' AND (_date IS NULL OR _date<=now()) THEN RAISE EXCEPTION 'Choose a future reminder time'; END IF;
 UPDATE public.pending_intents SET repeat_frequency=_frequency,repeat_interval=_interval,repeat_timezone=_timezone,scheduled_for=CASE WHEN _frequency='none' THEN NULL ELSE _date END, trigger_date=coalesce(_date,trigger_date),trigger_type=CASE WHEN _date IS NOT NULL THEN 'date' ELSE trigger_type END, status='pending',reminded_at=NULL WHERE id=_id RETURNING * INTO item;
 ELSE RAISE EXCEPTION 'Unknown reminder action'; END IF;
 RETURN item;
END $$;
REVOKE ALL ON FUNCTION public.reminder_action(uuid,text,timestamptz,text,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reminder_action(uuid,text,timestamptz,text,integer,text) TO authenticated;
GRANT SELECT,UPDATE ON public.pending_intents TO authenticated;
GRANT ALL ON public.pending_intents TO service_role;