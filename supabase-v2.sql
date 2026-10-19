-- =====================================================================
-- PADEL JA — mise à jour v2 : base de joueurs partagée
-- À coller une seule fois dans Supabase > SQL Editor > New snippet > Run
-- (sans danger si exécuté deux fois)
-- =====================================================================

-- Joueurs : une fiche par joueur (licence, ou à défaut NOM + prénom)
create table if not exists public.players (
  id          text primary key,
  licence     text,
  last        text,
  first       text,
  rank        text,
  name_key    text,          -- « nom|prénom » normalisé (sans accents, minuscules)
  search      text,          -- texte de recherche normalisé
  created_at  bigint,
  updated_at  bigint,
  created_by  text           -- juge-arbitre qui a créé la fiche
);
create index if not exists players_licence_idx on public.players(licence);
create index if not exists players_name_key_idx on public.players(name_key);
create index if not exists players_search_idx on public.players(search);

-- Participations : une ligne par joueur et par tournoi clôturé
create table if not exists public.participations (
  id            text primary key,
  player_id     text not null references public.players(id) on delete cascade,
  tournament_id text not null,
  owner         text,        -- juge-arbitre organisateur
  t_name        text,
  t_club        text,
  t_category    text,
  t_gender      text,
  t_date        text,
  place         int,
  place_lo      int,
  points        int,
  partner       text,
  n_pairs       int,
  closed_at     bigint
);
create index if not exists participations_player_idx on public.participations(player_id);
create index if not exists participations_owner_idx on public.participations(owner);
create index if not exists participations_tournament_idx on public.participations(tournament_id);

-- Sécurité : accessibles uniquement par le serveur Padel JA (clé secrète)
alter table public.players enable row level security;
alter table public.participations enable row level security;
