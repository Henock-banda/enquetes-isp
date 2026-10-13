-- À coller dans Supabase > SQL Editor > Run
create table if not exists fiches (
  id text primary key,
  qid text not null,
  enq text,
  quartier text,
  date timestamptz,
  lat double precision,
  lng double precision,
  acc double precision,
  rep jsonb,
  created_at timestamptz default now()
);
alter table fiches enable row level security;
create policy "lecture" on fiches for select to anon using (true);
create policy "ajout" on fiches for insert to anon with check (true);
create policy "maj" on fiches for update to anon using (true) with check (true);
