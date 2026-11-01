-- /RAM Coach : vraies tables (élèves, achats, groupes, cours, séances, présences), tous clubs confondus.
-- Transition : ram_items reste la référence. Un déclencheur recopie chaque changement dans ces tables,
-- dans la même transaction, tant que les écrans lisent encore ram_items.
-- Une erreur de recopie ne bloque jamais l'appli : elle est notée dans coach_sync_errors.
-- Accès uniquement par le serveur (clé secrète) : RLS activée, aucune règle publique.

create table if not exists coach_students (
  club_id text not null references ram_clubs(id) on delete cascade,
  id text not null,
  name text, mail text, tel text, sport text, level int, note text,
  parents text[] not null default '{}',
  details jsonb not null default '{}',   -- le reste de la fiche (main, côté, objectifs, grille technique…)
  rev bigint not null,
  primary key (club_id, id)
);
create table if not exists coach_purchases (
  club_id text not null,
  student_id text not null,
  id text not null,
  position int not null,
  kind text,                   -- pack, abo, seance
  product_ref text, name text,
  purchased_on date, ends_on date,
  sessions_count int, price numeric(10, 2), note text,
  details jsonb not null default '{}',
  primary key (club_id, student_id, id),
  foreign key (club_id, student_id) references coach_students(club_id, id) on delete cascade
);
create index if not exists coach_purchases_date on coach_purchases (club_id, purchased_on);
create index if not exists coach_purchases_ref on coach_purchases (club_id, product_ref);

-- un groupe (chaque semaine, ou cycle) ou un cours particulier (une seule date) : kind = groupe | cours
create table if not exists coach_groups (
  club_id text not null references ram_clubs(id) on delete cascade,
  id text not null,
  kind text not null,
  coach_key text, name text, sport text,
  once_date date, day smallint, h text, start_time time, dur text, duration_min int,
  from_date date, to_date date, every smallint,
  skip_dates date[] not null default '{}', extra_dates date[] not null default '{}', cancelled_dates date[] not null default '{}',
  off_periods jsonb,
  max_students int, tarif_mode text, tarif_prix numeric(10, 2), offre text, cal text, goal text,
  archived boolean not null default false,
  created_ms bigint,
  details jsonb not null default '{}',
  rev bigint not null,
  primary key (club_id, id)
);
create index if not exists coach_groups_coach on coach_groups (club_id, coach_key);
create index if not exists coach_groups_once on coach_groups (club_id, once_date) where once_date is not null;
create index if not exists coach_groups_cal on coach_groups (cal) where cal is not null;

create table if not exists coach_group_students (
  club_id text not null,
  group_id text not null,
  student_key text not null,
  has_account boolean not null,   -- false : élève sans compte (liste ext)
  position int not null,
  primary key (club_id, group_id, student_key),
  foreign key (club_id, group_id) references coach_groups(club_id, id) on delete cascade
);
create index if not exists coach_group_students_student on coach_group_students (club_id, student_key);

-- une séance datée d'un groupe ou d'un cours (pas de clé étrangère : l'historique survit à son groupe)
create table if not exists coach_sessions (
  club_id text not null references ram_clubs(id) on delete cascade,
  id text not null,
  group_id text,
  session_date date,
  theme text,
  details jsonb not null default '{}',
  rev bigint not null,
  primary key (club_id, id)
);
create index if not exists coach_sessions_date on coach_sessions (club_id, session_date);
create index if not exists coach_sessions_group on coach_sessions (club_id, group_id, session_date);

create table if not exists coach_attendance (
  club_id text not null,
  session_id text not null,
  student_key text not null,
  status text not null,    -- P présent, E excusé, A absent
  session_date date,
  primary key (club_id, session_id, student_key),
  foreign key (club_id, session_id) references coach_sessions(club_id, id) on delete cascade
);
create index if not exists coach_attendance_student on coach_attendance (club_id, student_key, session_date);

create table if not exists coach_sync_errors (
  id bigint generated always as identity primary key,
  club_id text, coll text, item_id text,
  message text,
  at timestamptz not null default now()
);

alter table coach_students enable row level security;
alter table coach_purchases enable row level security;
alter table coach_groups enable row level security;
alter table coach_group_students enable row level security;
alter table coach_sessions enable row level security;
alter table coach_attendance enable row level security;
alter table coach_sync_errors enable row level security;

/* ---------- lectures prudentes : une valeur inattendue donne null, jamais une erreur ---------- */
create or replace function coach_date(v text) returns date language plpgsql immutable set search_path = '' as $$
begin
  if v ~ '^\d{4}-\d{2}-\d{2}$' then return v::date; end if;
  return null;
exception when others then return null;
end $$;
create or replace function coach_dates(v jsonb) returns date[] language sql immutable set search_path = '' as $$
  select coalesce(array_agg(public.coach_date(x)) filter (where public.coach_date(x) is not null), '{}')
  from jsonb_array_elements_text(case when jsonb_typeof(v) = 'array' then v else '[]'::jsonb end) x
$$;
create or replace function coach_texts(v jsonb) returns text[] language sql immutable set search_path = '' as $$
  select coalesce(array_agg(x), '{}') from jsonb_array_elements_text(case when jsonb_typeof(v) = 'array' then v else '[]'::jsonb end) x
$$;
create or replace function coach_num(v jsonb) returns numeric language plpgsql immutable set search_path = '' as $$
begin
  if jsonb_typeof(v) = 'number' then return (v #>> '{}')::numeric; end if;
  if jsonb_typeof(v) = 'string' and (v #>> '{}') ~ '^-?\d+(\.\d+)?$' then return (v #>> '{}')::numeric; end if;
  return null;
exception when others then return null;
end $$;
-- « 18 h 30 », « 18 h », « 18:30 »
create or replace function coach_time(v text) returns time language plpgsql immutable set search_path = '' as $$
declare m text[];
begin
  m := regexp_match(v, '^\s*(\d{1,2})\s*(?:h|:)\s*(\d{2})?');
  if m is null then return null; end if;
  return make_time(m[1]::int, coalesce(m[2], '0')::int, 0);
exception when others then return null;
end $$;
-- même règle que REGLES.durMin (club/regles.js) : 1 h par défaut
create or replace function coach_minutes(v text) returns int language plpgsql immutable set search_path = '' as $$
declare m text[];
begin
  m := regexp_match(coalesce(v, ''), '(\d+) h(?: (\d+))?|(\d+) min');
  if m is null then return 60; end if;
  if m[3] is not null then return m[3]::int; end if;
  return m[1]::int * 60 + coalesce(m[2], '0')::int;
exception when others then return 60;
end $$;

/* ---------- un élément de ram_items → ses lignes ---------- */
create or replace function coach_project_item(p_club text, p_coll text, p_id text, d jsonb, p_rev bigint, p_deleted boolean)
returns void language plpgsql set search_path = '' as $$
declare k text;
begin
  if p_coll = 'eleve' then
    if p_deleted or d is null then
      delete from public.coach_students where club_id = p_club and id = p_id;
      return;
    end if;
    insert into public.coach_students (club_id, id, name, mail, tel, sport, level, note, parents, details, rev)
    values (p_club, p_id, d->>'n', d->>'mail', d->>'tel', d->>'sport', public.coach_num(d->'lvl')::int, d->>'note', public.coach_texts(d->'parents'),
      d - array['id', 'n', 'mail', 'tel', 'sport', 'lvl', 'note', 'parents', 'achats'], p_rev)
    on conflict (club_id, id) do update set name = excluded.name, mail = excluded.mail, tel = excluded.tel, sport = excluded.sport, level = excluded.level,
      note = excluded.note, parents = excluded.parents, details = excluded.details, rev = excluded.rev;
    delete from public.coach_purchases where club_id = p_club and student_id = p_id;
    insert into public.coach_purchases (club_id, student_id, id, position, kind, product_ref, name, purchased_on, ends_on, sessions_count, price, note, details)
    select p_club, p_id, a->>'id', o::int, a->>'t', a->>'ref', a->>'nom', public.coach_date(a->>'d'), public.coach_date(a->>'fin'), public.coach_num(a->'n')::int, public.coach_num(a->'prix'), a->>'note',
      a - array['id', 't', 'ref', 'nom', 'd', 'fin', 'n', 'prix', 'note']
    from jsonb_array_elements(case when jsonb_typeof(d->'achats') = 'array' then d->'achats' else '[]'::jsonb end) with ordinality as x(a, o)
    where a->>'id' is not null
    on conflict do nothing;

  elsif p_coll in ('group', 'cours') then
    k := case p_coll when 'cours' then 'cours' else 'groupe' end;
    -- seuls les groupes d'entraînement concernent /RAM Coach (les équipes restent au Club)
    if p_deleted or d is null or (p_coll = 'group' and coalesce(d->>'type', '') <> 'train') then
      delete from public.coach_groups where club_id = p_club and id = p_id and kind = k;
      return;
    end if;
    insert into public.coach_groups (club_id, id, kind, coach_key, name, sport, once_date, day, h, start_time, dur, duration_min, from_date, to_date, every,
      skip_dates, extra_dates, cancelled_dates, off_periods, max_students, tarif_mode, tarif_prix, offre, cal, goal, archived, created_ms, details, rev)
    values (p_club, p_id, k, d->>'coach', d->>'name', d->>'sport', public.coach_date(d->>'once'), public.coach_num(d->'day')::smallint, d->>'h', public.coach_time(d->>'h'), d->>'dur', public.coach_minutes(d->>'dur'),
      public.coach_date(d->>'from'), public.coach_date(d->>'to'), public.coach_num(d->'every')::smallint,
      public.coach_dates(d->'skip'), public.coach_dates(d->'extra'), public.coach_dates(d->'cancel'), d->'off', public.coach_num(d->'max')::int,
      d#>>'{tarif,mode}', public.coach_num(d#>'{tarif,prix}'), d->>'offre', d->>'cal', d->>'goal', coalesce((d->>'old') is not null and (d->>'old') not in ('0', 'false'), false), public.coach_num(d->'at')::bigint,
      d - array['id', 'coach', 'name', 'sport', 'once', 'day', 'h', 'dur', 'from', 'to', 'every', 'skip', 'extra', 'cancel', 'off', 'max', 'tarif', 'offre', 'cal', 'goal', 'old', 'at', 'mem', 'ext', 'type'], p_rev)
    on conflict (club_id, id) do update set kind = excluded.kind, coach_key = excluded.coach_key, name = excluded.name, sport = excluded.sport, once_date = excluded.once_date, day = excluded.day,
      h = excluded.h, start_time = excluded.start_time, dur = excluded.dur, duration_min = excluded.duration_min, from_date = excluded.from_date, to_date = excluded.to_date, every = excluded.every,
      skip_dates = excluded.skip_dates, extra_dates = excluded.extra_dates, cancelled_dates = excluded.cancelled_dates, off_periods = excluded.off_periods, max_students = excluded.max_students,
      tarif_mode = excluded.tarif_mode, tarif_prix = excluded.tarif_prix, offre = excluded.offre, cal = excluded.cal, goal = excluded.goal, archived = excluded.archived, created_ms = excluded.created_ms,
      details = excluded.details, rev = excluded.rev;
    delete from public.coach_group_students where club_id = p_club and group_id = p_id;
    insert into public.coach_group_students (club_id, group_id, student_key, has_account, position)
    select p_club, p_id, x, true, o::int from jsonb_array_elements_text(case when jsonb_typeof(d->'mem') = 'array' then d->'mem' else '[]'::jsonb end) with ordinality as t(x, o)
    on conflict do nothing;
    insert into public.coach_group_students (club_id, group_id, student_key, has_account, position)
    select p_club, p_id, x, false, 1000 + o::int from jsonb_array_elements_text(case when jsonb_typeof(d->'ext') = 'array' then d->'ext' else '[]'::jsonb end) with ordinality as t(x, o)
    on conflict do nothing;

  elsif p_coll = 'seance' then
    if p_deleted or d is null then
      delete from public.coach_sessions where club_id = p_club and id = p_id;
      return;
    end if;
    insert into public.coach_sessions (club_id, id, group_id, session_date, theme, details, rev)
    values (p_club, p_id, d->>'g', public.coach_date(d->>'d'), d->>'theme', d - array['id', 'g', 'd', 'theme', 'pres'], p_rev)
    on conflict (club_id, id) do update set group_id = excluded.group_id, session_date = excluded.session_date, theme = excluded.theme, details = excluded.details, rev = excluded.rev;
    delete from public.coach_attendance where club_id = p_club and session_id = p_id;
    insert into public.coach_attendance (club_id, session_id, student_key, status, session_date)
    select p_club, p_id, key, value, public.coach_date(d->>'d') from jsonb_each_text(case when jsonb_typeof(d->'pres') = 'object' then d->'pres' else '{}'::jsonb end);
  end if;
end $$;

/* ---------- le déclencheur : jamais d'erreur vers l'appli, un souci est noté et se voit à la comparaison ---------- */
create or replace function coach_on_item() returns trigger language plpgsql set search_path = '' as $$
begin
  begin
    if tg_op = 'DELETE' then
      perform public.coach_project_item(old.club_id, old.coll, old.id, null, old.rev, true);
    else
      perform public.coach_project_item(new.club_id, new.coll, new.id, new.data, new.rev, new.deleted);
    end if;
  exception when others then
    insert into public.coach_sync_errors (club_id, coll, item_id, message)
    values (case when tg_op = 'DELETE' then old.club_id else new.club_id end, case when tg_op = 'DELETE' then old.coll else new.coll end, case when tg_op = 'DELETE' then old.id else new.id end, sqlerrm);
  end;
  return null;
end $$;
drop trigger if exists coach_items_write on ram_items;
create trigger coach_items_write after insert or update on ram_items for each row
  when (new.coll in ('eleve', 'group', 'cours', 'seance')) execute function coach_on_item();
drop trigger if exists coach_items_delete on ram_items;
create trigger coach_items_delete after delete on ram_items for each row
  when (old.coll in ('eleve', 'group', 'cours', 'seance')) execute function coach_on_item();

/* ---------- reconstruire toutes les tables depuis ram_items (recopie initiale, et réparation) ---------- */
create or replace function coach_rebuild() returns int language plpgsql set search_path = '' as $$
declare r record; n int := 0;
begin
  for r in select club_id, coll, id, data, rev, deleted from public.ram_items where coll in ('eleve', 'group', 'cours', 'seance') order by rev loop
    begin
      perform public.coach_project_item(r.club_id, r.coll, r.id, r.data, r.rev, r.deleted);
      n := n + 1;
    exception when others then
      insert into public.coach_sync_errors (club_id, coll, item_id, message) values (r.club_id, r.coll, r.id, sqlerrm);
    end;
  end loop;
  return n;
end $$;

-- réservé au serveur : rien de tout cela n'est appelable par l'API publique
revoke all on function coach_date(text), coach_dates(jsonb), coach_texts(jsonb), coach_num(jsonb), coach_time(text), coach_minutes(text),
  coach_project_item(text, text, text, jsonb, bigint, boolean), coach_on_item(), coach_rebuild() from public, anon, authenticated;

select coach_rebuild();
