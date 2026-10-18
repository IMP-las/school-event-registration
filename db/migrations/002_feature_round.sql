-- SERS — feature round migration
-- Run once in the Supabase SQL Editor. Safe to run again (idempotent).
--
-- Assumes registrations.status uses: 'registered' | 'attended' | 'cancelled'
-- and events.status uses: 'open' | 'closed' | 'cancelled'.
-- If either column has a CHECK constraint that rejects these values, widen it.

-- 1. Users: split name parts + forced password change -------------------------
alter table users add column if not exists first_name text;
alter table users add column if not exists middle_name text;
alter table users add column if not exists last_name text;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'users'
      and column_name = 'must_change_password'
  ) then
    alter table users add column must_change_password boolean not null default false;
    -- Existing organizer/admin accounts still use their default passwords.
    update users set must_change_password = true where role in ('organizer', 'admin');
  end if;
end $$;

-- Backfill: "Juan Dela Cruz" -> first Juan, middle Dela, last Cruz (editable in Settings).
with parts as (
  select id, regexp_split_to_array(btrim(full_name), '\s+') as p
  from users
  where role = 'student' and first_name is null and btrim(full_name) <> ''
)
update users u
set first_name  = parts.p[1],
    last_name   = case when array_length(parts.p, 1) > 1
                       then parts.p[array_length(parts.p, 1)] end,
    middle_name = case when array_length(parts.p, 1) > 2
                       then array_to_string(parts.p[2:array_length(parts.p, 1) - 1], ' ') end
from parts
where u.id = parts.id;

-- Emails are matched in lowercase.
update users set email = lower(email) where email <> lower(email);

-- 2. Events: store the date as a real timestamp with time zone ----------------
-- Needed so "auto close after the event date" compares correctly.
do $$
begin
  if (select data_type from information_schema.columns
      where table_schema = 'public' and table_name = 'events'
        and column_name = 'event_date') <> 'timestamp with time zone' then
    alter table events
      alter column event_date type timestamptz
      using (event_date::timestamp at time zone 'Asia/Manila');
  end if;
end $$;

create index if not exists idx_events_status_date on events (status, event_date);
create index if not exists idx_registrations_event on registrations (event_id, status);
create index if not exists idx_registrations_student on registrations (student_id);

-- 3. Registered counts per event (registered + attended), used by event lists --
create or replace view event_registration_counts as
select event_id, count(*)::int as registered_count
from registrations
where status in ('registered', 'attended')
group by event_id;

-- 4. Audit log ---------------------------------------------------------------
create table if not exists audit_logs (
  id          bigint generated always as identity primary key,
  actor_id    text,
  actor_name  text,
  actor_role  text,
  action      text not null,
  description text not null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_audit_logs_created_at on audit_logs (created_at desc);
