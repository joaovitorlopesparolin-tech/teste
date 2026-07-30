# Calculadora de Orçamento de Casamento

Uma página só, sem instalação e sem internet: abra o `index.html` no navegador e comece a usar.
Tudo que você digitar fica salvo no próprio navegador — pode fechar e voltar depois.

## O que ela responde

- **Quanto custa o casamento inteiro**, somando 52 itens em 10 categorias
- **Quanto precisa sair à vista** e **quanto dá pra parcelar** — a conta que ninguém faz e que
  costuma ser o motivo de aperto às vésperas da festa
- **Quanto guardar por mês** até a data, comparado com o que vocês realmente conseguem guardar
- **Quanto custa cada convidado a mais** — a alavanca mais forte para caber no orçamento
- **Onde cortar primeiro** quando a conta não fecha

## Como usar

1. Preencha o topo: número de convidados, data, quanto já têm guardado e quanto conseguem
   guardar por mês.
2. Escolha a região e o padrão da festa (**Simples**, **Médio** ou **Luxo**). Isso preenche
   todos os valores sugeridos de uma vez.
3. Percorra as categorias marcando o que vocês querem ter e desmarcando o que não faz sentido.
4. Conforme for fechando com fornecedor, troque o valor sugerido pelo valor real do orçamento.
5. Use **Imprimir / salvar PDF** para levar a lista na conversa com o fornecedor.

## Como cada item é classificado

Cada linha traz uma etiqueta de forma de pagamento:

| Etiqueta | O que significa |
| --- | --- |
| **Dá pra parcelar** | Fornecedor costuma dividir em várias vezes até a data |
| **Sinal + parcelas** | Pede ~30% de entrada e parcela o resto — a entrada entra no "à vista" |
| **Só à vista** | Sai do bolso de uma vez, quase sempre na semana do casamento |

Itens marcados com **muita gente esquece** são os que mais aparecem de surpresa na conta final:
curso de noivos, gerador, taxa de limpeza, beleza das madrinhas, espumante do brinde e afins.

## Como as contas são feitas

- Itens **por convidado** (buffet, bebidas, doces, louças) multiplicam pelo número de convidados.
- **Convites** contam 1 a cada 2 pessoas; **garçons**, 1 a cada 12 pessoas.
- A **reserva para imprevistos** soma 10% sobre o total e entra inteira como custo à vista,
  porque imprevisto não se parcela.
- O **custo por convidado a mais** soma só os itens que variam com a lista — é por isso que
  cortar convidados economiza tanto sem mudar nada do resto da festa.
- O prazo em meses vem da data informada (12 meses se deixar em branco).

## Sobre os valores sugeridos

São médias do mercado brasileiro para 2026, ajustadas pela região escolhida. Servem como ponto
de partida, não como cotação: preço de casamento varia muito por cidade, dia da semana e época
do ano. Peça três orçamentos por fornecedor e substitua os números aqui pelos reais.

## Detalhes técnicos

Arquivo único, sem dependências, sem build. Funciona offline, se adapta a tema claro e escuro
e é usável no celular. Os dados ficam no `localStorage` do navegador — não sobem para lugar
nenhum. Para começar do zero, use o botão **Recomeçar do zero**.
