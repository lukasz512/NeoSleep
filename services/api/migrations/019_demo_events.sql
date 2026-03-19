-- Demo events: 15 meetings spread relative to NOW(). Varied type/status for calendar.
-- Only inserts if there's at least one user and fewer than 5 events exist.

DO $$
DECLARE
  v_rep_id UUID;
BEGIN
  SELECT id INTO v_rep_id FROM tbl_users LIMIT 1;
  IF v_rep_id IS NULL OR (SELECT COUNT(*) FROM tbl_events) >= 5 THEN
    RETURN;
  END IF;

  -- Today / this week – scheduled
  INSERT INTO tbl_events (rep_id, start_at, end_at, type, title, region, status) VALUES
    (v_rep_id, NOW() + INTERVAL '1 hour',   NOW() + INTERVAL '2 hours',   'f2f',   'Dr Kowalska — Pulmonology visit',        'Central', 'scheduled'),
    (v_rep_id, NOW() + INTERVAL '4 hours',  NOW() + INTERVAL '5 hours',   'video', 'NeoSleep webinar — Region North',        'North',   'scheduled'),
    (v_rep_id, NOW() + INTERVAL '1 day 9 hours',  NOW() + INTERVAL '1 day 10 hours',  'f2f',   'Dr Nowak — Sleep medicine follow-up',    'Central', 'scheduled'),
    (v_rep_id, NOW() + INTERVAL '2 days 10 hours', NOW() + INTERVAL '2 days 11 hours', 'f2f',   'Dr Wiśniewska — NeoSleep presentation',  'North',   'scheduled'),
    (v_rep_id, NOW() + INTERVAL '2 days 13 hours', NOW() + INTERVAL '2 days 14 hours', 'video', 'Dr Zieliński — Internal medicine call',  'North',   'scheduled'),
    (v_rep_id, NOW() + INTERVAL '4 days 9 hours',  NOW() + INTERVAL '4 days 10 hours', 'f2f',   'Dr Wójcik — ENT consultation',          'South',   'scheduled'),
    (v_rep_id, NOW() + INTERVAL '4 days 14 hours', NOW() + INTERVAL '4 days 15 hours', 'f2f',   'Dr Kaczmarek — OrthApnea presentation', 'South',   'scheduled'),
    (v_rep_id, NOW() + INTERVAL '5 days 11 hours', NOW() + INTERVAL '5 days 12 hours', 'video', 'Dr Lewandowska — Sleep medicine video',  'West',    'scheduled'),
    (v_rep_id, NOW() + INTERVAL '7 days 10 hours', NOW() + INTERVAL '7 days 11 hours', 'f2f',   'Dr Szymańska — Pneumonology visit',     'Central', 'scheduled'),
    (v_rep_id, NOW() + INTERVAL '7 days 15 hours', NOW() + INTERVAL '7 days 16 hours', 'video', 'Monthly team call — Region Central',    'Central', 'scheduled'),
    (v_rep_id, NOW() + INTERVAL '10 days 9 hours', NOW() + INTERVAL '10 days 10 hours','f2f',   'Dr Jankowski — Internal medicine visit', 'Central', 'scheduled'),
    (v_rep_id, NOW() + INTERVAL '12 days 13 hours',NOW() + INTERVAL '12 days 14 hours','video', 'Dr Kowalczyk — OrthApnea call',         'South',   'scheduled'),

  -- Past events – completed and cancelled (for visual variety on calendar)
    (v_rep_id, NOW() - INTERVAL '2 days 9 hours',  NOW() - INTERVAL '2 days 8 hours',  'f2f',   'Dr Dąbrowski — Family medicine visit',  'West',    'completed'),
    (v_rep_id, NOW() - INTERVAL '3 days 11 hours', NOW() - INTERVAL '3 days 10 hours', 'video', 'Dr Wiśniewski — ENT follow-up',         'North',   'completed'),
    (v_rep_id, NOW() - INTERVAL '1 day 14 hours',  NOW() - INTERVAL '1 day 13 hours',  'f2f',   'Dr Mazur — intro visit',                'North',   'cancelled');

END $$;
