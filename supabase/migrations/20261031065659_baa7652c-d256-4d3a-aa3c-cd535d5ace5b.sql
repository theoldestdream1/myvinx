DO $$
DECLARE owner_id uuid; reminder_id uuid; child_count integer; scheduled timestamptz;
BEGIN
 IF public.next_reminder_date('2026-01-31 09:00Z','monthly',1,'UTC','2026-02-28 09:00Z') <> '2026-03-31 09:00Z'::timestamptz THEN RAISE EXCEPTION 'month-end failed'; END IF;
 IF public.next_reminder_date('2026-10-30 09:00Z','weekdays',1,'UTC','2026-10-30 10:00Z') <> '2026-11-02 09:00Z'::timestamptz THEN RAISE EXCEPTION 'weekdays failed'; END IF;
 IF public.next_reminder_date('2026-10-31 09:00Z','weekly',2,'UTC','2026-10-31 10:00Z') <> '2026-11-14 09:00Z'::timestamptz THEN RAISE EXCEPTION 'custom interval failed'; END IF;
 IF public.next_reminder_date('2026-10-31 13:00Z','daily',1,'America/New_York','2026-10-31 14:00Z') <> '2026-11-01 14:00Z'::timestamptz THEN RAISE EXCEPTION 'DST failed'; END IF;
 IF public.next_reminder_date('2026-01-01 09:00Z','daily',1,'UTC','2026-10-31 10:00Z') <> '2026-11-01 09:00Z'::timestamptz THEN RAISE EXCEPTION 'missed schedule failed'; END IF;
 SELECT id INTO owner_id FROM public.profiles LIMIT 1;
 IF owner_id IS NULL THEN RAISE EXCEPTION 'No fixture owner for rollback test'; END IF;
 BEGIN
 INSERT INTO public.pending_intents(user_id,intent_text,trigger_type,trigger_date,repeat_frequency) VALUES(owner_id,'Rollback-only recurrence check','date',now()+interval '1 day','daily') RETURNING id,scheduled_for INTO reminder_id,scheduled;
 UPDATE public.pending_intents SET trigger_date=now()+interval '3 days',status='pending',reminded_at=NULL WHERE id=reminder_id;
 IF EXISTS(SELECT 1 FROM public.pending_intents WHERE previous_occurrence_id=reminder_id) THEN RAISE EXCEPTION 'Snooze advanced recurrence'; END IF;
 UPDATE public.pending_intents SET status='resolved',resolved_at=now() WHERE id=reminder_id;
 SELECT count(*) INTO child_count FROM public.pending_intents WHERE previous_occurrence_id=reminder_id AND status='pending' AND trigger_date>now()+interval '3 days' AND scheduled_for=scheduled;
 IF child_count<>1 THEN RAISE EXCEPTION 'Completion failed to advance'; END IF;
 UPDATE public.pending_intents SET status='resolved' WHERE id=reminder_id;
 SELECT count(*) INTO child_count FROM public.pending_intents WHERE previous_occurrence_id=reminder_id;
 IF child_count<>1 THEN RAISE EXCEPTION 'Duplicate completion created successors'; END IF;
 INSERT INTO public.pending_intents(user_id,intent_text,trigger_type,trigger_date) VALUES(owner_id,'Rollback-only one-off check','date',now()+interval '1 day') RETURNING id INTO reminder_id;
 UPDATE public.pending_intents SET status='resolved' WHERE id=reminder_id;
 IF EXISTS(SELECT 1 FROM public.pending_intents WHERE previous_occurrence_id=reminder_id) THEN RAISE EXCEPTION 'One-off repeated'; END IF;
 INSERT INTO public.pending_intents(user_id,intent_text,trigger_type,trigger_date,repeat_frequency,deleted_at) VALUES(owner_id,'Rollback-only trash check','date',now()+interval '1 day','daily',now()) RETURNING id INTO reminder_id;
 UPDATE public.pending_intents SET status='resolved' WHERE id=reminder_id;
 IF EXISTS(SELECT 1 FROM public.pending_intents WHERE previous_occurrence_id=reminder_id) THEN RAISE EXCEPTION 'Trash repeated'; END IF;
 RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='Rollback successful test fixtures';
 EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL;
 END;
END $$;