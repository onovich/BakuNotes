-- Run in the SQL editor of the user's own Supabase project.
-- Every dream field (including title, date, tags and body) is inside AES-GCM ciphertext.

create table if not exists public.dream_vaults (
  user_id uuid primary key references auth.users(id) on delete cascade,
  envelope jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.dream_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (id ~ '^[0-9a-f]{64}$'),
  payload text not null,
  version bigint not null default 1 check (version >= 1),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists dream_records_user_updated_idx
  on public.dream_records (user_id, updated_at desc);

alter table public.dream_vaults enable row level security;
alter table public.dream_records enable row level security;

revoke all on public.dream_vaults from anon, authenticated;
revoke all on public.dream_records from anon, authenticated;
grant select, insert on public.dream_vaults to authenticated;
grant select, insert, update on public.dream_records to authenticated;

create policy "Owner can read own vault" on public.dream_vaults
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Owner can create own vault" on public.dream_vaults
  for insert to authenticated with check (user_id = (select auth.uid()));

create policy "Owner can read own encrypted dreams" on public.dream_records
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Owner can create own encrypted dreams" on public.dream_records
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Owner can update own encrypted dreams" on public.dream_records
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
