create extension if not exists "pgcrypto";

create table if not exists memos (
  id uuid primary key default gen_random_uuid(),
  raw text not null,
  title text not null,
  category text not null default 'other',
  action text not null default 'memo',
  priority text not null default 'low',
  due_hint text,
  source text not null default 'manual',
  done boolean not null default false,
  tags jsonb not null default '[]'::jsonb,
  classifier text not null default 'local',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists memos_created_at_idx on memos (created_at desc);
create index if not exists memos_category_idx on memos (category);
create index if not exists memos_done_idx on memos (done);
