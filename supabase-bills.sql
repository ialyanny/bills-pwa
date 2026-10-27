-- 帳單備忘錄：Supabase 資料表
-- 用法：Supabase 主控台 → SQL Editor → New query → 貼上 → Run
-- 專案：https://nutkocotbncqxgvjkfxi.supabase.co

create table if not exists public.bills_state (
  room       text primary key,           -- 由「同步碼」雜湊而來，不存明文
  payload    text not null,              -- AES-GCM 加密後的整份帳本（base64）
  updated_at timestamptz not null default now(),
  device     text                        -- 哪台裝置最後寫入（僅供除錯）
);

comment on table public.bills_state is '帳單備忘錄的加密備份，一台裝置一列（room 由同步碼決定）';

alter table public.bills_state enable row level security;

-- 因為資料本身已用同步碼加密，這裡開放 anon key 讀寫；
-- 拿到 anon key 的人只能看到密文，沒有同步碼無法解開。
drop policy if exists "bills anon all" on public.bills_state;
create policy "bills anon all" on public.bills_state
  for all
  using (true)
  with check (true);

-- 即時同步（Realtime）需要把表加入 publication
do $$
begin
  alter publication supabase_realtime add table public.bills_state;
exception
  when others then null;
end $$;

-- 選用：保留每日快照，防止誤刪
-- create table if not exists public.bills_snapshots (
--   id bigint generated always as identity primary key,
--   room text not null,
--   payload text not null,
--   created_at timestamptz not null default now()
-- );
