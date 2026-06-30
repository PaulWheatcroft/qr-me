-- QR Token Gift App schema
-- Two paper tokens; both must be scanned (either order) to trigger a transfer.

create table if not exists public.gift (
  id integer primary key default 1,
  status text not null default 'pending' check (status in ('pending', 'transferred')),
  updated_at timestamptz not null default now(),
  constraint gift_singleton check (id = 1)
);

create table if not exists public.tokens (
  token text primary key,
  label text not null,
  scanned_at timestamptz
);

-- Lock everything down. Only the edge function (service role) reads/writes.
alter table public.gift enable row level security;
alter table public.tokens enable row level security;

-- Seed the single gift row.
insert into public.gift (id, status)
values (1, 'pending')
on conflict (id) do nothing;

-- Seed the two token secrets.
insert into public.tokens (token, label)
values
  ('93ef95eccf1ae899f74e0271ed8397fa', 'A'),
  ('8257d4976487b680c6d0bdc360d62b18', 'B')
on conflict (token) do nothing;
