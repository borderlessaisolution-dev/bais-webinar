-- BAIS Webinar · Supabase schema
-- 在 Supabase → SQL Editor 贴上整份执行一次即可。
-- 所有读写都经过 Next.js 服务器（service role key），所以表格开 RLS 但不开放任何 policy。

create extension if not exists pgcrypto;

-- 报名名单
create table if not exists registrations (
  id uuid primary key default gen_random_uuid(),
  webinar_slug text not null,
  name text not null,
  email text not null,
  phone text not null,
  country text not null default 'MY',
  interest text,
  utm_source text,
  utm_campaign text,
  created_at timestamptz not null default now(),
  joined_at timestamptz,
  unique (webinar_slug, phone)
);
create index if not exists registrations_slug_email on registrations (webinar_slug, lower(email));

-- 投票 / 抢答题库
create table if not exists activities (
  id uuid primary key default gen_random_uuid(),
  webinar_slug text not null,
  type text not null check (type in ('poll', 'quiz')),
  question text not null,
  options jsonb not null,               -- ["A", "B", "C", "D"]
  correct_index int,                    -- quiz 才有
  duration_sec int not null default 20,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists activities_slug on activities (webinar_slug, sort);

-- 学员作答
create table if not exists responses (
  id uuid primary key default gen_random_uuid(),
  webinar_slug text not null,
  activity_id uuid not null references activities(id) on delete cascade,
  registration_id uuid not null references registrations(id) on delete cascade,
  choice int not null,
  correct boolean,
  points int not null default 0,
  elapsed_ms int not null default 0,
  created_at timestamptz not null default now(),
  unique (activity_id, registration_id)
);
create index if not exists responses_slug on responses (webinar_slug);

-- 直播当下的状态（现在在投票 / 抢答 / 排行榜 …）
create table if not exists live_state (
  webinar_slug text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table registrations enable row level security;
alter table activities enable row level security;
alter table responses enable row level security;
alter table live_state enable row level security;

-- 每个选项的票数
create or replace function activity_counts(p_activity uuid)
returns table (choice int, total bigint)
language sql stable as $$
  select choice, count(*) from responses where activity_id = p_activity group by choice;
$$;

-- 排行榜（累积分数）
create or replace function leaderboard(p_slug text, p_limit int default 10)
returns table (registration_id uuid, name text, score bigint)
language sql stable as $$
  select r.registration_id, g.name, sum(r.points) as score
  from responses r join registrations g on g.id = r.registration_id
  where r.webinar_slug = p_slug and r.points > 0
  group by r.registration_id, g.name
  order by score desc, min(r.created_at) asc
  limit p_limit;
$$;
