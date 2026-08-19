create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  billing_email citext not null,
  status text not null default 'active' check(status in ('trial','active','past_due','suspended','cancelled')),
  subscription_status text not null default 'trial' check(subscription_status in ('trial','active','past_due','cancelled')),
  venue_limit integer not null default 1 check(venue_limit between 1 and 1000),
  billing_customer_id text unique,
  billing_subscription_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists account_memberships (
  account_id uuid not null references accounts(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null check(role in ('owner','admin','viewer')),
  created_at timestamptz not null default now(),
  primary key(account_id,user_id)
);

create table if not exists venue_memberships (
  venue_id uuid not null references venues(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null check(role in ('manager','viewer')),
  created_at timestamptz not null default now(),
  primary key(venue_id,user_id)
);

create table if not exists audit_events (
  id bigint generated always as identity primary key,
  actor_user_id uuid references users(id) on delete set null,
  account_id uuid references accounts(id) on delete set null,
  venue_id uuid references venues(id) on delete set null,
  action text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

alter table venues add column if not exists account_id uuid references accounts(id) on delete cascade;
create index if not exists venues_account_id on venues(account_id);
create index if not exists audit_events_account_created on audit_events(account_id,created_at desc);

do $$
declare legacy_account uuid;
begin
  if exists(select 1 from venues where account_id is null) then
    insert into accounts(name,billing_email,status,subscription_status,venue_limit)
      values('Legacy FreePour Account','admin@example.com','active','active',greatest(1,(select count(*) from venues where account_id is null)))
      returning id into legacy_account;
    update venues set account_id=legacy_account where account_id is null;
    insert into account_memberships(account_id,user_id,role)
      select legacy_account,id,'owner' from users where role='platform_admin'
      on conflict do nothing;
  end if;
end $$;

alter table venues alter column account_id set not null;
