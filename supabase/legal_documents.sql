-- Registra a versão dos documentos jurídicos aceita pelo usuário.
-- Execute no SQL Editor do Supabase antes de publicar o aceite obrigatório.

begin;

alter table public.profiles
  add column if not exists legal_documents_version text,
  add column if not exists legal_documents_accepted_at timestamptz;

alter table public.profiles enable row level security;

drop policy if exists profiles_update_own_legal_documents on public.profiles;
create policy profiles_update_own_legal_documents
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

commit;
