-- PDSMatch — Supabase Schema v2
-- Run this in your Supabase SQL Editor

-- Players
create table if not exists players (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  pos        text not null check (pos in ('ATQ','MIL','DEF')),
  level      numeric not null default 5,
  created_at timestamptz default now()
);

-- Matches
create table if not exists matches (
  id         uuid primary key default gen_random_uuid(),
  name       text,
  date       date not null default current_date,
  lieu       text,
  score_a    int not null default 0,
  score_b    int not null default 0,
  mvp_id     uuid references players(id) on delete set null,
  created_at timestamptz default now()
);

-- Match players (who played, which team)
create table if not exists match_players (
  id         uuid primary key default gen_random_uuid(),
  match_id   uuid not null references matches(id) on delete cascade,
  player_id  uuid not null references players(id) on delete cascade,
  team       text not null check (team in ('A','B')),
  unique (match_id, player_id)
);

-- Stats per player per match
create table if not exists match_stats (
  id             uuid primary key default gen_random_uuid(),
  match_id       uuid not null references matches(id) on delete cascade,
  player_id      uuid not null references players(id) on delete cascade,
  buts           int not null default 0,
  pass_d         int not null default 0,
  clean_sheet    int not null default 0,
  note           numeric not null default 5,
  victoire       boolean not null default false,
  nul            boolean not null default false,
  score_calc     numeric,
  mvp_bonus      int not null default 0,
  presence_bonus numeric not null default 0.5,
  unique (match_id, player_id)
);

-- Sessions (saved team compositions)
create table if not exists sessions (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  team_a     uuid[] not null default '{}',
  team_b     uuid[] not null default '{}',
  created_at timestamptz default now()
);

-- RLS
alter table players      enable row level security;
alter table matches       enable row level security;
alter table match_players enable row level security;
alter table match_stats   enable row level security;
alter table sessions      enable row level security;

-- Policies — allow all with anon key (private friend group)
create policy "allow all players"       on players      for all using (true) with check (true);
create policy "allow all matches"       on matches       for all using (true) with check (true);
create policy "allow all match_players" on match_players for all using (true) with check (true);
create policy "allow all match_stats"   on match_stats   for all using (true) with check (true);
create policy "allow all sessions"      on sessions      for all using (true) with check (true);
