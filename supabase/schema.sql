-- ==========================================================
-- M’s Library — banco de dados no Supabase
-- Cole tudo no SQL Editor do Supabase e clique em "Run".
-- Pode rodar mais de uma vez sem problema.
-- ==========================================================

-- Livros: cada livro é guardado como um documento JSON, no mesmo formato
-- que o site já usa (title, author, status, quotes…). Assim o site não
-- precisa mudar a forma dos dados.
create table if not exists public.books (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)   -- também serve de índice para "livros desta pessoa"
);

-- Configurações (ordem personalizada, estantes dela, critérios de ordenação…):
-- uma linha por pessoa.
create table if not exists public.settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------- Segurança ----------
-- Row Level Security: cada pessoa só enxerga e altera as PRÓPRIAS linhas.
alter table public.books enable row level security;
alter table public.settings enable row level security;

drop policy if exists "books: ler os meus" on public.books;
drop policy if exists "books: criar os meus" on public.books;
drop policy if exists "books: alterar os meus" on public.books;
drop policy if exists "books: apagar os meus" on public.books;
create policy "books: ler os meus" on public.books
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "books: criar os meus" on public.books
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "books: alterar os meus" on public.books
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "books: apagar os meus" on public.books
  for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "settings: ler as minhas" on public.settings;
drop policy if exists "settings: criar as minhas" on public.settings;
drop policy if exists "settings: alterar as minhas" on public.settings;
create policy "settings: ler as minhas" on public.settings
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "settings: criar as minhas" on public.settings
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "settings: alterar as minhas" on public.settings
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Acesso pela API do site: só quem fez login (authenticated). Visitantes
-- sem login (anon) não alcançam as tabelas. Tabelas novas não são mais
-- liberadas automaticamente no Supabase, por isso o "grant" explícito.
revoke all on public.books, public.settings from anon;
grant select, insert, update, delete on public.books to authenticated;
grant select, insert, update on public.settings to authenticated;
