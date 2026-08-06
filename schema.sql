-- 수능 대비 · Supabase 준비
--
-- 실행 순서
--   1) Supabase 에서 새 프로젝트를 만든다
--   2) Authentication > Providers > Email 에서 "Confirm email" 을 끈다
--      (아이디 로그인이라 확인 메일을 받을 주소가 없다)
--   3) SQL Editor 에 이 파일을 통째로 붙여넣고 실행한다
--   4) Project Settings > API 에서 Project URL 과 anon public 키를 복사해
--      _source.html 위쪽 SUPABASE_URL, SUPABASE_ANON_KEY 에 넣고 다시 빌드한다
--
-- 맨 아래 확인 쿼리로 표와 정책이 제대로 생겼는지 본다.

-- ── 1. 회원 ──────────────────────────────────────────────
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  username   text not null unique,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists profiles_read_own on public.profiles;
create policy profiles_read_own on public.profiles
  for select to authenticated using (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- 가입하면 profiles 행을 자동으로 만든다
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username)
  values (new.id, coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── 2. 모의고사 기록 ─────────────────────────────────────
create table if not exists public.exam_records (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  exam_name    text not null,
  exam_date    date not null,
  subject      text not null,          -- korean math english history tamgu1 tamgu2 lang2
  detail       text default '',        -- 미적분, 생명과학Ⅰ 처럼 세부 과목
  raw_score    numeric,
  std_score    numeric,
  percentile   numeric,
  grade        int check (grade is null or (grade between 1 and 9)),
  wrong_nos    int[] not null default '{}',
  duration_sec int,
  memo         text default '',
  created_at   timestamptz not null default now()
);

create index if not exists exam_records_user_date
  on public.exam_records (user_id, exam_date desc);

alter table public.exam_records enable row level security;

-- 기록은 남이 볼 이유가 없다. 네 줄 모두 본인 것만 허용한다.
drop policy if exists exam_records_select on public.exam_records;
create policy exam_records_select on public.exam_records
  for select to authenticated using (user_id = auth.uid());

drop policy if exists exam_records_insert on public.exam_records;
create policy exam_records_insert on public.exam_records
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists exam_records_update on public.exam_records;
create policy exam_records_update on public.exam_records
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists exam_records_delete on public.exam_records;
create policy exam_records_delete on public.exam_records
  for delete to authenticated using (user_id = auth.uid());

-- ── 3. 확인 쿼리 ─────────────────────────────────────────
-- 표 두 개가 나와야 한다
select table_name from information_schema.tables
where table_schema = 'public' and table_name in ('profiles', 'exam_records');

-- exam_records 정책 네 개, profiles 정책 두 개가 나와야 한다
select tablename, policyname, cmd, roles
from pg_policies
where tablename in ('profiles', 'exam_records')
order by tablename, cmd;

-- 두 표 모두 rowsecurity 가 true 여야 한다
select relname, relrowsecurity from pg_class
where relname in ('profiles', 'exam_records');
