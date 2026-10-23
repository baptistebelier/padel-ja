-- =========================================================================
-- /RAM — référentiel des clubs, commun à /RAM JA et /RAM Club
-- À exécuter une fois dans Supabase (SQL Editor), après supabase.sql, supabase-v2.sql et supabase-ram.sql.
-- Un club = une ligne. Les comptes, les fiches joueurs, les tournois, les participations et les
-- espaces /RAM Club y sont reliés par club_id. Les anciens champs texte (users.club, t_club…) restent.
-- =========================================================================

create table if not exists public.clubs (
  id          text primary key,
  name        text not null,
  name_key    text not null,     -- nom réduit (sans accents, espaces ni ponctuation) : « chiquitapadel »
  short       text,              -- sigle
  city        text,
  sports      text[] not null default '{}',
  fft         text,              -- numéro d'affiliation FFT
  logo        text,
  created_by  text,
  created_at  bigint,
  updated_at  bigint
);
create index if not exists clubs_name_key_idx on public.clubs(name_key);

-- Noms déjà rencontrés pour un club (« Chiquita Padel », « CHIQUITA PADEL CLUB »…) : une forme = un club
create table if not exists public.club_aliases (
  key      text primary key,
  club_id  text not null references public.clubs(id) on delete cascade
);
create index if not exists club_aliases_club_idx on public.club_aliases(club_id);

-- Liens vers le club
alter table public.users          add column if not exists club_id text references public.clubs(id) on delete set null;
alter table public.players        add column if not exists club_id text references public.clubs(id) on delete set null;   -- club de licence
alter table public.tournaments    add column if not exists club_id text references public.clubs(id) on delete set null;   -- club organisateur
alter table public.participations add column if not exists club_id text references public.clubs(id) on delete set null;   -- club organisateur du tournoi
alter table public.ram_clubs      add column if not exists club_id text references public.clubs(id) on delete set null;   -- espace /RAM Club du club
create index if not exists users_club_idx on public.users(club_id);
create index if not exists players_club_idx on public.players(club_id);
create index if not exists tournaments_club_idx on public.tournaments(club_id);
create index if not exists participations_club_idx on public.participations(club_id);
create unique index if not exists ram_clubs_club_key on public.ram_clubs(club_id) where club_id is not null;

-- Sécurité : accessibles uniquement par le serveur (clé secrète)
alter table public.clubs enable row level security;
alter table public.club_aliases enable row level security;
