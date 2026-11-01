-- /RAM Coach : les tables deviennent la référence pour les élèves, les cours et les séances.
-- À appliquer après supabase-coach.sql. Les anciennes lignes de ram_items ne sont ni modifiées ni supprimées :
-- elles restent figées comme filet de sécurité ; coach_export_to_items() permet de revenir en arrière.
-- Les groupes restent dans ram_items (ils servent aussi au Club) et sont toujours recopiés par le déclencheur.
alter table coach_students add column if not exists data jsonb;
alter table coach_groups add column if not exists data jsonb;
alter table coach_sessions add column if not exists data jsonb;

-- éléments supprimés : un appareil qui revient (cache local) doit encore l'apprendre
create table if not exists coach_tombstones (
  club_id text not null references ram_clubs(id) on delete cascade,
  coll text not null,
  id text not null,
  rev bigint not null,
  at timestamptz not null default now(),
  primary key (club_id, coll, id)
);
create index if not exists coach_tombstones_rev on coach_tombstones (club_id, rev);
alter table coach_tombstones enable row level security;

create or replace function coach_project_item(p_club text, p_coll text, p_id text, d jsonb, p_rev bigint, p_deleted boolean)
returns void language plpgsql set search_path = '' as $$
declare k text;
begin
  if p_coll in ('eleve', 'cours', 'seance') then
    if p_deleted or d is null then
      insert into public.coach_tombstones (club_id, coll, id, rev) values (p_club, p_coll, p_id, p_rev)
      on conflict (club_id, coll, id) do update set rev = excluded.rev, at = now();
    else
      delete from public.coach_tombstones where club_id = p_club and coll = p_coll and id = p_id;
    end if;
  end if;
  if p_coll = 'eleve' then
    if p_deleted or d is null then
      delete from public.coach_students where club_id = p_club and id = p_id;
      return;
    end if;
    insert into public.coach_students (club_id, id, name, mail, tel, sport, level, note, parents, details, rev, data)
    values (p_club, p_id, d->>'n', d->>'mail', d->>'tel', d->>'sport', public.coach_num(d->'lvl')::int, d->>'note', public.coach_texts(d->'parents'),
      d - array['id', 'n', 'mail', 'tel', 'sport', 'lvl', 'note', 'parents', 'achats'], p_rev, d)
    on conflict (club_id, id) do update set name = excluded.name, mail = excluded.mail, tel = excluded.tel, sport = excluded.sport, level = excluded.level,
      note = excluded.note, parents = excluded.parents, details = excluded.details, rev = excluded.rev, data = excluded.data;
    delete from public.coach_purchases where club_id = p_club and student_id = p_id;
    insert into public.coach_purchases (club_id, student_id, id, position, kind, product_ref, name, purchased_on, ends_on, sessions_count, price, note, details)
    select p_club, p_id, a->>'id', o::int, a->>'t', a->>'ref', a->>'nom', public.coach_date(a->>'d'), public.coach_date(a->>'fin'), public.coach_num(a->'n')::int, public.coach_num(a->'prix'), a->>'note',
      a - array['id', 't', 'ref', 'nom', 'd', 'fin', 'n', 'prix', 'note']
    from jsonb_array_elements(case when jsonb_typeof(d->'achats') = 'array' then d->'achats' else '[]'::jsonb end) with ordinality as x(a, o)
    where a->>'id' is not null
    on conflict do nothing;

  elsif p_coll in ('group', 'cours') then
    k := case p_coll when 'cours' then 'cours' else 'groupe' end;
    if p_deleted or d is null or (p_coll = 'group' and coalesce(d->>'type', '') <> 'train') then
      delete from public.coach_groups where club_id = p_club and id = p_id and kind = k;
      return;
    end if;
    insert into public.coach_groups (club_id, id, kind, coach_key, name, sport, once_date, day, h, start_time, dur, duration_min, from_date, to_date, every,
      skip_dates, extra_dates, cancelled_dates, off_periods, max_students, tarif_mode, tarif_prix, offre, cal, goal, archived, created_ms, details, rev, data)
    values (p_club, p_id, k, d->>'coach', d->>'name', d->>'sport', public.coach_date(d->>'once'), public.coach_num(d->'day')::smallint, d->>'h', public.coach_time(d->>'h'), d->>'dur', public.coach_minutes(d->>'dur'),
      public.coach_date(d->>'from'), public.coach_date(d->>'to'), public.coach_num(d->'every')::smallint,
      public.coach_dates(d->'skip'), public.coach_dates(d->'extra'), public.coach_dates(d->'cancel'), d->'off', public.coach_num(d->'max')::int,
      d#>>'{tarif,mode}', public.coach_num(d#>'{tarif,prix}'), d->>'offre', d->>'cal', d->>'goal', coalesce((d->>'old') is not null and (d->>'old') not in ('0', 'false'), false), public.coach_num(d->'at')::bigint,
      d - array['id', 'coach', 'name', 'sport', 'once', 'day', 'h', 'dur', 'from', 'to', 'every', 'skip', 'extra', 'cancel', 'off', 'max', 'tarif', 'offre', 'cal', 'goal', 'old', 'at', 'mem', 'ext', 'type'], p_rev, d)
    on conflict (club_id, id) do update set kind = excluded.kind, coach_key = excluded.coach_key, name = excluded.name, sport = excluded.sport, once_date = excluded.once_date, day = excluded.day,
      h = excluded.h, start_time = excluded.start_time, dur = excluded.dur, duration_min = excluded.duration_min, from_date = excluded.from_date, to_date = excluded.to_date, every = excluded.every,
      skip_dates = excluded.skip_dates, extra_dates = excluded.extra_dates, cancelled_dates = excluded.cancelled_dates, off_periods = excluded.off_periods, max_students = excluded.max_students,
      tarif_mode = excluded.tarif_mode, tarif_prix = excluded.tarif_prix, offre = excluded.offre, cal = excluded.cal, goal = excluded.goal, archived = excluded.archived, created_ms = excluded.created_ms,
      details = excluded.details, rev = excluded.rev, data = excluded.data;
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
    insert into public.coach_sessions (club_id, id, group_id, session_date, theme, details, rev, data)
    values (p_club, p_id, d->>'g', public.coach_date(d->>'d'), d->>'theme', d - array['id', 'g', 'd', 'theme', 'pres'], p_rev, d)
    on conflict (club_id, id) do update set group_id = excluded.group_id, session_date = excluded.session_date, theme = excluded.theme, details = excluded.details, rev = excluded.rev, data = excluded.data;
    delete from public.coach_attendance where club_id = p_club and session_id = p_id;
    insert into public.coach_attendance (club_id, session_id, student_key, status, session_date)
    select p_club, p_id, key, value, public.coach_date(d->>'d') from jsonb_each_text(case when jsonb_typeof(d->'pres') = 'object' then d->'pres' else '{}'::jsonb end);
  end if;
end $$;

-- recopie des contenus complets et des suppressions déjà connues
select coach_rebuild();

-- ce que lit le serveur pour un club : ram_items, sauf ce qui a déménagé
create or replace view ram_items_v with (security_invoker = true) as
  select club_id, coll, id, data, rev, deleted from ram_items where coll not in ('eleve', 'cours', 'seance')
  union all select club_id, 'eleve', id, data, rev, false from coach_students
  union all select club_id, 'cours', id, data, rev, false from coach_groups where kind = 'cours'
  union all select club_id, 'seance', id, data, rev, false from coach_sessions
  union all select club_id, coll, id, null::jsonb, rev, true from coach_tombstones;
revoke all on ram_items_v from public, anon, authenticated;
grant select on ram_items_v to service_role;

-- l'écriture du serveur : un lot, une transaction. Une erreur annule tout le lot et remonte au serveur.
create or replace function ram_save_items(p_club text, p_rows jsonb) returns void language plpgsql set search_path = '' as $$
declare r jsonb;
begin
  for r in select * from jsonb_array_elements(p_rows) loop
    if r->>'coll' in ('eleve', 'cours', 'seance') then
      perform public.coach_project_item(p_club, r->>'coll', r->>'id', nullif(r->'data', 'null'::jsonb), (r->>'rev')::bigint, coalesce((r->>'deleted')::boolean, false));
    else
      insert into public.ram_items (club_id, coll, id, data, rev, deleted)
      values (p_club, r->>'coll', r->>'id', nullif(r->'data', 'null'::jsonb), (r->>'rev')::bigint, coalesce((r->>'deleted')::boolean, false))
      on conflict (club_id, coll, id) do update set data = excluded.data, rev = excluded.rev, deleted = excluded.deleted;
    end if;
  end loop;
end $$;

-- retour arrière : recopie l'état des tables dans ram_items
create or replace function coach_export_to_items() returns int language plpgsql set search_path = '' as $$
declare n int;
begin
  with src as (
    select club_id, 'eleve' coll, id, data, rev, false deleted from public.coach_students
    union all select club_id, 'cours', id, data, rev, false from public.coach_groups where kind = 'cours'
    union all select club_id, 'seance', id, data, rev, false from public.coach_sessions
    union all select club_id, coll, id, null, rev, true from public.coach_tombstones
  ), up as (
    insert into public.ram_items (club_id, coll, id, data, rev, deleted) select * from src
    on conflict (club_id, coll, id) do update set data = excluded.data, rev = excluded.rev, deleted = excluded.deleted
    returning 1
  ) select count(*) into n from up;
  return n;
end $$;

-- formules et échelles de l'enseignant, hors du bloc de données du compte
create table if not exists coach_settings (
  owner text not null,
  key text not null,    -- offers, scales
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (owner, key)
);
alter table coach_settings enable row level security;
insert into coach_settings (owner, key, data)
  select owner, 'offers', data->'coachOffers' from templates where jsonb_typeof(data) = 'object' and jsonb_typeof(data->'coachOffers') = 'object'
  union all select owner, 'scales', data->'coachScales' from templates where jsonb_typeof(data) = 'object' and jsonb_typeof(data->'coachScales') = 'object'
on conflict (owner, key) do nothing;

revoke all on function coach_project_item(text, text, text, jsonb, bigint, boolean), ram_save_items(text, jsonb), coach_export_to_items() from public, anon, authenticated;
grant execute on function ram_save_items(text, jsonb) to service_role;
