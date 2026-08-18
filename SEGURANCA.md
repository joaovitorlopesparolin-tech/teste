# Segurança do banco (Supabase)

## O problema

O painel é um arquivo HTML estático que fala direto com o Supabase usando a
**chave anônima** (`anon key`), que fica visível no código-fonte da página.
Isso é inevitável em um app sem servidor próprio — mas significa que **qualquer
pessoa que tiver o link do painel consegue extrair a chave** e, com ela, chamar
a API do Supabase por conta própria.

O que essa pessoa consegue fazer depende só das políticas de RLS (Row Level
Security) configuradas no projeto. Se o RLS estiver **desativado** nas tabelas
`itens`, `config` e `diario` (ou ativado com políticas liberais para o papel
`anon`), ela consegue **ler, alterar e apagar todos os dados** — pedidos,
diários e fotos.

## Como conferir (5 minutos)

No painel do Supabase → **Database → Tables**, verifique a coluna "RLS
enabled" das três tabelas. Ou rode no **SQL Editor**:

```sql
select tablename, rowsecurity from pg_tables where schemaname = 'public';
```

- `rowsecurity = false` → qualquer um com a chave tem acesso total (situação de risco).
- `rowsecurity = true` → veja as políticas em **Authentication → Policies**; se
  existirem políticas de `insert/update/delete` para o papel `anon`, o efeito
  prático é o mesmo.

## A correção real: exigir login

Como só duas pessoas usam o sistema, o caminho certo é o **Supabase Auth**
(e-mail/senha), com as políticas exigindo usuário autenticado:

1. **Authentication → Users → Add user**: crie os dois usuários.
2. No **SQL Editor**, ative o RLS e restrinja as escritas a usuários logados:

```sql
alter table public.itens  enable row level security;
alter table public.config enable row level security;
alter table public.diario enable row level security;

-- remove políticas antigas do papel anon, se existirem (liste antes com \d ou pela UI)

create policy "leitura autenticada"  on public.itens  for select to authenticated using (true);
create policy "escrita autenticada"  on public.itens  for all    to authenticated using (true) with check (true);
create policy "leitura autenticada"  on public.config for select to authenticated using (true);
create policy "escrita autenticada"  on public.config for all    to authenticated using (true) with check (true);
create policy "leitura autenticada"  on public.diario for select to authenticated using (true);
create policy "escrita autenticada"  on public.diario for all    to authenticated using (true) with check (true);
```

3. O painel precisa então de uma tela de login (a chave `anon` continua no
   HTML, mas passa a servir apenas para iniciar a sessão — sem login, a API
   não devolve nem aceita nada). **Este passo exige mudança no código do
   painel; posso implementá-lo quando as políticas acima estiverem aplicadas.**

> Atenção: não aplique o SQL acima antes de combinar a mudança no painel —
> com o RLS exigindo login e o painel ainda sem tela de login, o app para de
> funcionar (ficará "Offline") até o passo 3 ser implementado.

## Enquanto isso

- Não divulgue o link do painel fora da equipe.
- Faça backups periódicos (o botão **CSV** exporta os pedidos; no Supabase,
  **Database → Backups** cobre o restante).
