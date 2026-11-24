-- BAIS Webinar · 第 2 阶段：正式课程报名 + 付款
-- 在 Supabase → SQL Editor 贴上整份执行一次（schema.sql 之后跑）。

-- 直播中「开放正式课程报名」弹窗开关
alter table live_state add column if not exists offer_open boolean not null default false;
alter table live_state add column if not exists offer_v bigint not null default 0;

-- 开课日期 / 批次
create table if not exists course_sessions (
  id uuid primary key default gen_random_uuid(),
  webinar_slug text not null,
  label text not null,                 -- 例如「第 1 期 · 12月20–21日」
  starts_at timestamptz not null,
  location text not null default '',
  capacity int not null default 20,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists course_sessions_slug on course_sessions (webinar_slug, starts_at);

-- 订单
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,           -- 给学员看的订单号，例如 BW-7K3QX2
  webinar_slug text not null,
  session_id uuid not null references course_sessions(id),
  registration_id uuid references registrations(id) on delete set null,
  name text not null,
  email text not null,
  phone text not null,
  amount int not null,                 -- 以「分」为单位：RM 298.00 = 29800
  currency text not null default 'MYR',
  status text not null default 'pending' check (status in ('pending', 'paid', 'cancelled', 'expired')),
  provider text not null default 'mock',
  provider_ref text,
  hold_expires_at timestamptz not null,
  source text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists orders_slug on orders (webinar_slug, created_at desc);
create index if not exists orders_session on orders (session_id, status);
create index if not exists orders_ref on orders (provider_ref);

alter table course_sessions enable row level security;
alter table orders enable row level security;

-- 每个日期还剩几个位（已付款 + 还在保留期内的未付款 都算占位）
create or replace function session_availability(p_slug text)
returns table (id uuid, label text, starts_at timestamptz, location text, capacity int, active boolean, taken bigint, paid bigint)
language sql stable as $$
  select s.id, s.label, s.starts_at, s.location, s.capacity, s.active,
    (select count(*) from orders o where o.session_id = s.id
       and (o.status = 'paid' or (o.status = 'pending' and o.hold_expires_at > now()))) as taken,
    (select count(*) from orders o where o.session_id = s.id and o.status = 'paid') as paid
  from course_sessions s
  where s.webinar_slug = p_slug
  order by s.starts_at;
$$;

-- 建订单并锁位（同一时间很多人抢最后几个位也不会超卖）
create or replace function create_order(
  p_slug text, p_session uuid, p_reg uuid, p_name text, p_email text, p_phone text,
  p_amount int, p_currency text, p_provider text, p_hold_minutes int, p_code text, p_source text
) returns orders
language plpgsql as $$
declare
  s course_sessions;
  taken int;
  o orders;
begin
  select * into s from course_sessions
    where id = p_session and webinar_slug = p_slug and active
    for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;

  -- 同一个人之前没付款的订单先取消，避免一个人占好几个位
  update orders set status = 'cancelled'
    where webinar_slug = p_slug and lower(email) = lower(p_email) and status = 'pending';

  select count(*) into taken from orders
    where session_id = p_session
      and (status = 'paid' or (status = 'pending' and hold_expires_at > now()));
  if taken >= s.capacity then raise exception 'SESSION_FULL'; end if;

  insert into orders (code, webinar_slug, session_id, registration_id, name, email, phone,
                      amount, currency, provider, hold_expires_at, source)
  values (p_code, p_slug, p_session, p_reg, p_name, p_email, p_phone,
          p_amount, p_currency, p_provider, now() + make_interval(mins => p_hold_minutes), p_source)
  returning * into o;
  return o;
end;
$$;
