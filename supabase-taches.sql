-- /RAM : file de tâches (lib/taches.js) : notifications, e-mails, réservations Calendly, plus tard les rappels.
-- Plusieurs serveurs peuvent la vider sans prendre deux fois la même tâche. Accès uniquement par le serveur.
create table if not exists tasks (
  id bigint generated always as identity primary key,
  kind text not null,
  payload jsonb not null default '{}',
  dedupe_key text unique,
  status text not null default 'pending',   -- pending, running, done, failed
  attempts int not null default 0,
  run_at timestamptz not null default now(),
  locked_until timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  done_at timestamptz
);
create index if not exists tasks_due on tasks (run_at, id) where status in ('pending', 'running');
create index if not exists tasks_done on tasks (done_at) where status = 'done';
alter table tasks enable row level security;

create or replace function tasks_claim(p_limit int, p_lock_seconds int) returns setof tasks language sql set search_path = '' as $$
  update public.tasks t set status = 'running', attempts = t.attempts + 1, locked_until = now() + make_interval(secs => p_lock_seconds)
  where t.id in (
    select x.id from public.tasks x
    where (x.status = 'pending' and x.run_at <= now()) or (x.status = 'running' and x.locked_until < now())
    order by x.run_at, x.id limit p_limit for update skip locked
  )
  returning t.*
$$;
revoke all on function tasks_claim(int, int) from public, anon, authenticated;
grant execute on function tasks_claim(int, int) to service_role;
