-- =====================================================================
-- PADEL JA — structure de la base Supabase
-- À coller une seule fois dans Supabase > SQL Editor > New query > Run
-- =====================================================================
create table if not exists public.users (
  id          text primary key,
  email       text unique,
  name        text,
  club        text,
  pass_hash   text,
  plan        text default 'essai',
  guest       boolean default false,
  shopify_customer_id text,
  created_at  bigint
);

create table if not exists public.tournaments (
  id          text primary key,
  owner       text not null references public.users(id) on delete cascade,
  key         text not null,
  pin         text not null,
  created_at  bigint,
  updated_at  bigint,
  summary     jsonb,
  state       jsonb
);
create index if not exists tournaments_owner_idx on public.tournaments(owner);

create table if not exists public.templates (
  owner       text primary key references public.users(id) on delete cascade,
  data        jsonb default '[]'::jsonb
);

-- Sécurité : les tables ne sont accessibles QUE par le serveur Padel JA
-- (clé « service_role »). Aucun accès direct depuis un navigateur.
alter table public.users enable row level security;
alter table public.tournaments enable row level security;
alter table public.templates enable row level security;
