-- Tenant isolation lives in the database. The application never passes an org id in a WHERE clause.
create extension if not exists pgcrypto;

-- The role the API connects as. It must NOT be a superuser, must NOT bypass RLS, and must NOT own tables.
do $$
begin
  if not exists (select from pg_roles where rolname = 'app_user') then
    create role app_user login password 'app_pw' nosuperuser nobypassrls nocreatedb nocreaterole;
  end if;
end $$;

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 120),
  created_at timestamptz not null default now()
);

create table projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  created_at timestamptz not null default now(),
  unique (id, org_id) -- lets child tables prove they belong to the same org
);

create table notes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  project_id uuid not null,
  title text not null check (length(title) between 1 and 200),
  body text not null default '' check (length(body) <= 10000),
  created_at timestamptz not null default now(),
  -- A note cannot point at another org's project, even if someone forges the project id.
  foreign key (project_id, org_id) references projects (id, org_id) on delete cascade
);

-- RLS policies filter on org_id for every query, so index it.
create index projects_org on projects (org_id, created_at desc);
create index notes_org_created on notes (org_id, created_at desc);
create index notes_project on notes (project_id);

-- Current tenant, set per transaction by the API. NULL when unset, which matches no rows.
create function app_org() returns uuid language sql stable as
$$ select nullif(current_setting('app.org_id', true), '')::uuid $$;

alter table organizations enable row level security;
alter table organizations force row level security;
alter table projects enable row level security;
alter table projects force row level security;
alter table notes enable row level security;
alter table notes force row level security;

create policy org_self on organizations using (id = app_org());
create policy tenant_isolation on projects
  using (org_id = app_org()) with check (org_id = app_org());
create policy tenant_isolation on notes
  using (org_id = app_org()) with check (org_id = app_org());

grant usage on schema public to app_user;
grant select on organizations to app_user;
grant select, insert, update, delete on projects, notes to app_user;
