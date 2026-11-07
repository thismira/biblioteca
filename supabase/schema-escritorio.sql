-- ==========================================================
-- M’s Library — Escritório (histórias, capítulos e fotos)
-- Cole tudo no SQL Editor do Supabase e clique em "Run".
-- Pode rodar mais de uma vez sem problema. Não mexe nos livros.
-- ==========================================================

-- Histórias: cada história é um documento JSON (título, sinopse, status,
-- ordem dos capítulos, personagens, mundo, best quotes, playlist…).
create table if not exists public.stories (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- Capítulos: o TEXTO de cada capítulo fica numa linha própria, para abrir o
-- escritório sem baixar todos os textos e salvar só o capítulo editado.
-- `updated_at` é usado para perceber quando outro aparelho salvou antes.
-- Apagar uma história apaga os capítulos dela (on delete cascade).
create table if not exists public.chapters (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  story_id text not null,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, story_id) references public.stories (user_id, id) on delete cascade
);
create index if not exists chapters_story_idx on public.chapters (user_id, story_id);

-- ---------- Segurança ----------
-- Cada pessoa só enxerga e altera as PRÓPRIAS linhas.
alter table public.stories enable row level security;
alter table public.chapters enable row level security;

drop policy if exists "stories: ler as minhas" on public.stories;
drop policy if exists "stories: criar as minhas" on public.stories;
drop policy if exists "stories: alterar as minhas" on public.stories;
drop policy if exists "stories: apagar as minhas" on public.stories;
create policy "stories: ler as minhas" on public.stories
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "stories: criar as minhas" on public.stories
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "stories: alterar as minhas" on public.stories
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "stories: apagar as minhas" on public.stories
  for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "chapters: ler os meus" on public.chapters;
drop policy if exists "chapters: criar os meus" on public.chapters;
drop policy if exists "chapters: alterar os meus" on public.chapters;
drop policy if exists "chapters: apagar os meus" on public.chapters;
create policy "chapters: ler os meus" on public.chapters
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "chapters: criar os meus" on public.chapters
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "chapters: alterar os meus" on public.chapters
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "chapters: apagar os meus" on public.chapters
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.stories, public.chapters from anon;
grant select, insert, update, delete on public.stories, public.chapters to authenticated;

-- ---------- Fotos (personagens e mundo) ----------
-- Bucket PRIVADO: as fotos só abrem com login, por links temporários.
-- Cada pessoa grava só na própria pasta: "<id da pessoa>/arquivo.jpg".
-- Limite de 2 MB por foto (o site já reduz para ~100 KB antes de enviar).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('escritorio', 'escritorio', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "escritorio: ver minhas fotos" on storage.objects;
drop policy if exists "escritorio: enviar minhas fotos" on storage.objects;
drop policy if exists "escritorio: trocar minhas fotos" on storage.objects;
drop policy if exists "escritorio: apagar minhas fotos" on storage.objects;
create policy "escritorio: ver minhas fotos" on storage.objects
  for select to authenticated
  using (bucket_id = 'escritorio' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "escritorio: enviar minhas fotos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'escritorio' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "escritorio: trocar minhas fotos" on storage.objects
  for update to authenticated
  using (bucket_id = 'escritorio' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'escritorio' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "escritorio: apagar minhas fotos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'escritorio' and (storage.foldername(name))[1] = (select auth.uid())::text);
