-- Run this once in the Supabase SQL editor.
-- 1) Replace the email below with YOUR teacher email (the account you create in Authentication > Users).
-- 2) In Authentication > Providers > Email, turn OFF "Allow new users to sign up" so nobody else can register.

create table if not exists public.lessons (
  id text primary key,
  data jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.lessons enable row level security;

-- Everyone (including students with the public link) can read lessons.
create policy "lessons: public read" on public.lessons
  for select to anon, authenticated using (true);

-- Only the teacher account can add or delete lessons.
create policy "lessons: teacher insert" on public.lessons
  for insert to authenticated
  with check ((auth.jwt() ->> 'email') = 'REPLACE_WITH_TEACHER_EMAIL');

create policy "lessons: teacher delete" on public.lessons
  for delete to authenticated
  using ((auth.jwt() ->> 'email') = 'REPLACE_WITH_TEACHER_EMAIL');

-- Media bucket: public read, teacher-only upload and delete.
insert into storage.buckets (id, name, public)
values ('lesson-media', 'lesson-media', true)
on conflict (id) do nothing;

create policy "media: public read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'lesson-media');

create policy "media: teacher upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'lesson-media' and (auth.jwt() ->> 'email') = 'REPLACE_WITH_TEACHER_EMAIL');

create policy "media: teacher delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'lesson-media' and (auth.jwt() ->> 'email') = 'REPLACE_WITH_TEACHER_EMAIL');
