# Gestão de Obra — Martins Notari

Painel em arquivo único (`controlepedidos.html`) para controle de pedidos de
materiais e diário de obra (RDO), sincronizado entre computadores via Supabase.

## Funcionalidades

- **Pedidos de materiais**: cadastro por categoria, busca, ordenação por
  coluna, troca de situação direto na linha (badge clicável), ação em lote
  para os itens selecionados, filtro por situação nos contadores do rodapé,
  destaque de pedidos enviados há mais de 7 dias sem entrega, desfazer de
  alterações, link de exemplo opcional por insumo (referência do produto
  que deve ser comprado, com ícone clicável na descrição e endereço
  clicável na folha de pedido), folha de pedido imprimível e exportação
  CSV.
- **Diário de obra**: registro diário (clima, efetivo, equipamentos,
  atividades, ocorrências, fotos), galeria com calendário e RDO imprimível.
- **Sincronização**: estado compartilhado no Supabase com cópia local para
  visualização offline e detecção de conflito quando duas pessoas editam o
  mesmo item.

## Uso

Abra `controlepedidos.html` no navegador. Não há build nem dependências de
produção — o arquivo é autossuficiente.

**Atualização do banco:** ao atualizar para a versão com campo de link nos
insumos, rode uma vez o script `atualizacao-banco.sql` no SQL Editor do
Supabase (o painel avisa com essa instrução se a coluna estiver faltando).

## Testes

```sh
npm install
npm test
```

O teste (`teste-ui.js`) abre a página num Chromium headless com o Supabase
simulado e valida layout, cabeçalho fixo, troca de situação, desfazer, ação em
lote, filtros, alerta de atraso, conflito de edição e o layout mobile. Se o
Chromium do Playwright não estiver em `/opt/pw-browsers/chromium`, informe o
executável pela variável `CHROMIUM_PATH`.

## Segurança

Leia **[SEGURANCA.md](SEGURANCA.md)**: a chave anônima do Supabase fica
exposta no HTML e a proteção real dos dados depende das políticas de RLS do
projeto.
