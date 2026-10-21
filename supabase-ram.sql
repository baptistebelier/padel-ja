-- RAM Club : clubs, adhérents et éléments du club (publications, messages, groupes, rencontres, profils…)
-- Accès uniquement par le serveur (clé secrète) : RLS activée, aucune règle publique.
create table if not exists ram_clubs (
  id text primary key,
  code text unique not null,
  name text not null,
  created_by text,
  created_at bigint
);
create table if not exists ram_members (
  club_id text not null references ram_clubs(id) on delete cascade,
  user_id text not null,
  key text not null,
  role text not null default 'mem',
  created_at bigint,
  primary key (club_id, user_id),
  unique (club_id, key)
);
create table if not exists ram_items (
  club_id text not null references ram_clubs(id) on delete cascade,
  coll text not null,
  id text not null,
  data jsonb,
  rev bigint not null,
  deleted boolean not null default false,
  primary key (club_id, coll, id)
);
create index if not exists ram_items_rev on ram_items (club_id, rev);
create index if not exists ram_members_user on ram_members (user_id);
alter table ram_clubs enable row level security;
alter table ram_members enable row level security;
alter table ram_items enable row level security;
