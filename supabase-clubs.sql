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

-- =========================================================================
-- Adhésions : qui appartient à quel club, avec quel rôle, pour quelle saison
-- Une ligne par personne, club, saison et origine :
--   ramclub : adhésion /RAM Club (rôle bureau, coach ou adherent ; en attente tant que le bureau n'a pas validé)
--   compte  : club indiqué sur le compte /RAM (rôle joueur, club de licence)
--   tournoi : club saisi par un juge-arbitre pour un joueur à la clôture d'un tournoi (rôle joueur)
-- =========================================================================
create table if not exists public.club_members (
  id            text primary key,
  club_id       text not null references public.clubs(id) on delete cascade,
  user_id       text references public.users(id) on delete cascade,
  player_id     text references public.players(id) on delete cascade,
  role          text not null check (role in ('bureau', 'coach', 'adherent', 'joueur')),
  status        text not null default 'actif' check (status in ('actif', 'attente')),
  season        text not null,          -- « 2026-2027 » : de septembre à août
  source        text not null check (source in ('ramclub', 'compte', 'tournoi')),
  licence_club  boolean not null default false,
  created_at    bigint,
  updated_at    bigint,
  check (user_id is not null or player_id is not null)
);
create index if not exists club_members_club_idx on public.club_members(club_id, season);
create index if not exists club_members_user_idx on public.club_members(user_id);
create index if not exists club_members_player_idx on public.club_members(player_id);
alter table public.club_members enable row level security;

-- =========================================================================
-- Progression : compteurs d'actions, trophées et points d'investissement de chaque adhérent,
-- par club et par saison. Calculée par le serveur à partir des données du club (lib/ram-score.js) :
-- personne ne peut la modifier à la main. Mise à jour après chaque changement dans le club.
-- =========================================================================
create table if not exists public.member_progress (
  id          text primary key,
  club_id     text not null references public.clubs(id) on delete cascade,
  user_id     text not null references public.users(id) on delete cascade,
  season      text not null,
  points      int  not null default 0,
  counts      jsonb not null default '{}',   -- { like: 12, com: 4, … }
  trophies    jsonb not null default '{}',   -- { like: 2 (palier argent), hello: 1 (rare), … }
  updated_at  bigint
);
create unique index if not exists member_progress_key on public.member_progress(club_id, user_id, season);
create index if not exists member_progress_rank_idx on public.member_progress(club_id, season, points desc);
create index if not exists member_progress_user_idx on public.member_progress(user_id);
alter table public.member_progress enable row level security;

-- =========================================================================
-- Groupes du club : groupes d'entraînement (cours) et équipes, avec leurs membres.
-- Recopiés par le serveur depuis l'espace /RAM Club à chaque changement (lib/groupes.js).
-- =========================================================================
create table if not exists public.club_groups (
  id              text primary key,
  club_id         text not null references public.clubs(id) on delete cascade,
  space_id        text not null,           -- espace /RAM Club (ram_clubs.id)
  group_key       text not null,           -- identifiant du groupe dans l'espace
  type            text not null check (type in ('train', 'team')),
  name            text not null,
  sport           text,
  day             int,                     -- 0 = dimanche … 6 = samedi
  start_time      text,                    -- « 19 h »
  duration        text,                    -- « 1 h 30 »
  location        text,                    -- « Extérieur », « En salle »
  coach_user_id   text references public.users(id) on delete set null,
  season          text,
  archived        boolean not null default false,
  updated_at      bigint
);
create unique index if not exists club_groups_key on public.club_groups(space_id, group_key);
create index if not exists club_groups_club_idx on public.club_groups(club_id, season);

create table if not exists public.club_group_members (
  id          text primary key,
  group_id    text not null references public.club_groups(id) on delete cascade,
  club_id     text not null references public.clubs(id) on delete cascade,
  user_id     text references public.users(id) on delete cascade,   -- vide pour un enfant sans compte
  member_key  text not null,                                         -- adhérent dans l'espace /RAM Club
  role        text not null default 'membre' check (role in ('membre', 'capitaine')),
  updated_at  bigint
);
create index if not exists club_group_members_group_idx on public.club_group_members(group_id);
create index if not exists club_group_members_user_idx on public.club_group_members(user_id);
create index if not exists club_group_members_club_idx on public.club_group_members(club_id);
alter table public.club_groups enable row level security;
alter table public.club_group_members enable row level security;

-- présences aux cours : annoncée (élève ou parents), relevée à l'appel (enseignant), cours annulé
create table if not exists public.club_attendance (
  id text primary key,
  group_id text not null references public.club_groups(id) on delete cascade,
  club_id text not null references public.clubs(id) on delete cascade,
  session_date text not null,
  user_id text references public.users(id) on delete set null,
  member_key text not null,
  announced text,
  present boolean,
  cancelled boolean not null default false,
  updated_at bigint
);
create index if not exists club_attendance_club_idx on public.club_attendance(club_id);
create index if not exists club_attendance_group_idx on public.club_attendance(group_id);
create index if not exists club_attendance_user_idx on public.club_attendance(user_id);
alter table public.club_attendance enable row level security;
