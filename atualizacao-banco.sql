-- Atualização do banco — rode UMA vez no SQL Editor do Supabase
-- (painel do Supabase → SQL Editor → New query → cole e Run).
-- Necessário para a versão do painel com campo de link nos insumos.

alter table public.itens add column if not exists link text;
