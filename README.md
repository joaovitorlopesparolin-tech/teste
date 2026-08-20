# Jaques Motorsport — Sistema de Gestão Interno

Sistema de gestão personalizado para a operação de **cabeçotes de alta performance**:
venda de componentes, produção de cabeçotes sob encomenda e serviços de
preparação/retrabalho de cabeçotes de clientes.

Não é um ERP genérico — os fluxos, regras e telas foram desenhados para a
realidade da empresa, com o objetivo de eliminar planilhas paralelas.

## Como rodar

Requisitos: **Node.js 18+** (sem nenhuma dependência externa).

**Windows — fácil como abrir um HTML:** o pacote distribuído (ZIP) já traz o
Node.js embutido (`node.exe`) — nada precisa ser instalado. Extraia e dê dois
cliques em **`ABRIR O SISTEMA.bat`**: o sistema sobe invisível e o navegador
abre sozinho. Opcional: rodar **`INSTALAR.bat`** uma vez configura o início
automático com o Windows e cria o atalho “Sistema Jaques Motorsport” na Área
de Trabalho.

**Para atualizar (sem perder nenhum dado):**
1. dois cliques em **`PARAR O SISTEMA.bat`** (fecha o sistema que está rodando);
2. extraia o ZIP novo **por cima** da pasta atual, substituindo os arquivos —
   a pasta `data` (os dados da empresa) não vem no ZIP e fica intacta;
3. dois cliques em **`ABRIR O SISTEMA.bat`**. O navegador já busca sozinho a
   versão nova das telas.

Manualmente (qualquer sistema):

```bash
npm start          # ou: node server.js
```

Acesse **http://localhost:3000**.

> Login inicial: `admin` / `admin123` — troque a senha no primeiro acesso
> (menu lateral → 🔑 Alterar senha).

Os dados ficam em `data/db.json` (criado automaticamente, fora do controle de
versão), com backup diário automático em `data/backups/`. Para recomeçar do
zero: `npm run seed`.

**Backup na nuvem (Google Drive/OneDrive):** em *Administração → Configurações →
Backup na nuvem*, aponte uma pasta sincronizada (o sistema detecta as pastas do
Google Drive para Computador, OneDrive e Dropbox sozinho) — a cópia diária dos
dados também vai para lá e o aplicativo de sincronização sobe para a nuvem.
Para restaurar: copie o `jaques-backup-….json` mais recente para `data/db.json`
com o sistema parado.

> **Integrações:** a preparação para uma futura sincronização com a Conta Azul
> (sem duplicar registros) está descrita em **[INTEGRACOES.md](INTEGRACOES.md)**.

> **Para usar na empresa:** veja o guia completo de implantação em
> **[DEPLOY.md](DEPLOY.md)** — computador da oficina (rede local) ou servidor
> na nuvem com HTTPS, backup e checklist do primeiro dia.

## Módulos

| Área | O que faz |
|---|---|
| **Dashboard** | Faturamento, vendas e serviços do mês, lucro estimado e margem (restrito), contas a receber/pagar, saldo, vencidos, orçamentos aguardando, serviços em andamento, pedidos não entregues e **Minhas Pendências** |
| **Minhas pendências** | Central de tarefas por prioridade (Urgente / Esta semana / Aguardando) com **dono sugerido automaticamente** (tarefas sem dono ficam sinalizadas); modelos de título em um clique; contas recorrentes (COPEL, Sanepar, consórcio) geram aviso **alguns dias antes do vencimento** (configurável), com **link do site** para pagar e botão “Cadastrar boleto” que pré-preenche Contas a pagar — e a pendência **dá baixa sozinha** quando o boleto do mês é cadastrado |
| **Clientes** | Cadastro completo (cidade e estado separados para relatórios por região) + perfil consolidado: compras, serviços, orçamentos, financeiro e linha do tempo; **código interno automático** (`CLI-000001`) gerado no cadastro, único e imutável — acompanha o cliente mesmo se o nome mudar e aparece nas listas, nos seletores de cliente de vendas/serviços/orçamentos/financeiro e na busca, para que dois cadastros de nome parecido nunca se confundam (o CPF/CNPJ continua sendo do cliente, não da numeração da empresa) |
| **Entrada de cabeçotes** | Fluxo padrão *Entrada → Orçamento → Aprovação → OS → Produção → Finalização → Pagamento → NF de retorno → Envio*; entrada direta só como exceção marcada |
| **Bens de clientes** | Estoque de terceiros **totalmente separado** do estoque próprio; aceita entrada sem NF de remessa (marcada como “sem documento fiscal”); devolução dá saída do estoque de terceiros, nunca do estoque próprio |
| **Orçamentos** | Catálogo de serviços com preços-base do modelo atual (editáveis), valor personalizado por orçamento sem alterar o catálogo, cálculo automático de totais, validade padrão de 30 dias (configurável) |
| **Aprovação → OS** | Um clique converte o orçamento em OS aproveitando todos os dados, sem recadastro |
| **Ordens de serviço** | Status (Em análise, Em andamento, Aguardando peça, Finalizado, Aguardando pagamento, Cancelado) + envio/entrega, responsável, pagamento (à vista ou parcelado com boletos automáticos), NF de retorno, histórico |
| **Vendas** | 6 configurações (Unilateral/Crossflow × Stage 1–3); **valida comandos por Stage** (S1: 288 · S2: 290x300, 290x290 · S3: 300x308, 300x318, 316x320, 316x316, 308x320) e **tuchos** (S1/S2: 35 mm · S3: 37 mm, com exceção 300x308 = 35 ou 37); cartão/link com taxa da operadora, valor líquido e data prevista de recebimento; custos adicionais por venda; resultado e margem |
| **Produção** | Ordem de produção por cabeçote vendido com checklist automático (separações, montagem, controle, embalagem, expedição) incluindo operações extras: retrabalho dos dutos de escape (Stage 3) e abertura do alojamento para tucho 37 mm; baixa automática de componentes ao concluir |
| **Estoque próprio** | Cascos usinados (unilateral/crossflow), válvulas, molas, pratos, travas, tuchos 35/37, comandos; mínimos com alerta de compra; movimentações rastreadas |
| **Compras** | Com ou sem NF (NF, recibo, comprovante, sem documento); **leitura automática de NF-e (XML)** com conferência antes de confirmar; vínculo a cliente/OS/pedido/produção/uso interno; gera contas a pagar (parceladas) automaticamente |
| **Fornecedores** | Fechamento mensal (Jaú Auto Peças, Retifos, Ferragens Brasil, Mangopar…): gastos registrados no dia, acumulado em aberto e **conferência da fatura com alerta de divergência** antes do pagamento |
| **Contas a pagar** | Categorias completas; **agenda de sextas-feiras** — a data de pagamento é calculada automaticamente como a sexta anterior ao vencimento (ex.: venc. qui 20/08 → pgto sex 14/08); pagamentos imediatos entram na data em que ocorrem; contas recorrentes com lembrete mensal |
| **Contas a receber** | Boletos com **geração automática de parcelas** (ex.: venda 27/07, R$ 12.000, 3× a cada 20 dias → 16/08, 05/09, 25/09 de R$ 4.000); status em aberto/paga/vencida/cancelada |
| **Agenda financeira** | Calendário mensal com **contas a pagar e a receber lado a lado**, lido direto dos dois módulos — nenhum compromisso é cadastrado de novo. Cada dia mostra o total a receber (verde) e a pagar (vermelho), marca o que já foi baixado (✓) e o que está vencido (!); clicar no dia abre o detalhe com cliente/fornecedor, descrição, valor, vencimento e status. Navega por mês anterior / mês atual / próximo, aceita **período personalizado** (inclusive atravessando meses) e alterna entre **por vencimento** e **por data de pagamento** — nesta última a conta aparece na sexta-feira em que será paga, seguindo a agenda de sextas. Cada perfil enxerga só o lado que já podia ver |
| **Fluxo de caixa** | Regime de caixa (quando o dinheiro entrou/saiu), separado da DRE; alimentado automaticamente por vendas, OS, contas e RH; exportação CSV |
| **Projeção** | A receber × a pagar × saldo projetado em 7/30/60/90 dias, 6 meses e 1 ano |
| **DRE** | Receita (cabeçotes, peças, serviços), custos, lucro bruto, despesas operacionais e financeiras, lucro líquido e margem, por mês |
| **RH** | Mini-painel (ativos, custo fixo mensal, extras do mês, próximos pagamentos), busca + filtros por vínculo (Fixo/Oficina · Administrativo · Freelancer/Pista), salários/benefícios (acesso restrito), bônus de produção e **assistência de pista agrupada por etapa/evento** (várias pessoas de uma vez, total por corrida); telas vazias guiam o primeiro passo; pagamentos alimentam o financeiro |
| **Relatórios** | Central com filtros (data, status, responsável, cliente) e **🖨️ Imprimir** / exportar; inclui **IMPRIMIR PENDÊNCIAS** (tudo que precisa ser feito) para entregar aos colaboradores |
| **Administração** | Usuários, perfis de permissão configuráveis (Administrador, Financeiro/Administrativo, Produção + novos), catálogo de serviços, configurações e **histórico de alterações** (quem alterou o quê e quando) |
| **Assistente de IA** | Botão ✦ em todas as telas: responde perguntas sobre os dados (contas, clientes, produção, estoque…) usando Gemini ou Claude; a chave da API fica só no servidor e **cada perfil só recebe respostas com o que já pode ver** (Produção não recebe custos/margens/salários) |
| **Envio por WhatsApp** | Botão ✆ nos orçamentos (proposta completa com itens, total e validade), nas OS e vendas (avisos de “pronto”/“enviado”/andamento) e nas contas a receber (lembrete de cobrança); abre uma janela de revisão com a mensagem editável e vai direto para a conversa do cliente no WhatsApp |
| **Backup na nuvem** | Além do backup diário local, copia os dados para uma pasta sincronizada (Google Drive para Computador, OneDrive, Dropbox) com detecção automática das pastas, teste de escrita, “fazer backup agora” e status do último envio — se o computador quebrar, os dados estão na nuvem |
| **Etiqueta de envio** | Botão 📦 no pedido e na OS: gera a etiqueta com **remetente da empresa** (cadastrado uma vez) e **destinatário do cadastro do cliente**, sem redigitar nada; ocupa ~1/3 de uma folha A4 vertical para recortar e colar na caixa, com destaque para nome, endereço, cidade/UF e CEP; imprime ou salva em PDF pela janela de impressão, e a emissão fica registrada no pedido/OS |
| **Documentos e endereço** | Máscara automática de **CPF/CNPJ e CEP** com validação real (dígitos verificadores) — guardados só com números, então a busca funciona com ou sem pontuação; digitar o **CEP preenche endereço, bairro, cidade e UF** (nunca sobrescreve o que já está preenchido sem confirmar, e o cadastro continua funcionando sem internet) |
| **Trabalho simultâneo** | Com um servidor único (rede local ou Tailscale), o servidor avisa as telas abertas e elas se **atualizam sozinhas em menos de 1 segundo** — sem recarregar e sem interromper quem está digitando (a atualização espera o formulário fechar) |
| **Atualização em um clique** | **`ATUALIZAR.bat`** baixa a versão nova, troca só os arquivos do programa e reabre o sistema — a pasta `data` (dados da empresa) nunca é tocada |
| **Acesso pelo celular** | Em *Administração → Configurações*, um **QR code** abre o sistema no celular (mesmo Wi-Fi) com os mesmos dados em tempo real — QR gerado localmente, sem internet; **LIBERAR NO CELULAR.bat** destrava o firewall do Windows com um clique |
| **Modelos 3D** | Em *Produtos e custos*: upload do escaneamento/CAD exportado como **STL/OBJ/PLY** (até 200 MB), vínculo por produto e **visualizador 3D em tela cheia** (three.js embutido, offline) — peça em alumínio sobre fundo escuro, gira com o mouse ou com o dedo no celular; ideal para mostrar ao cliente |
| **Importar planilha de gastos** | No *Fluxo de caixa*: lê o Excel semanal da oficina (uma aba por semana, gastos à esquerda e entradas à direita), com conferência antes de gravar, **categorias sugeridas automaticamente** (componentes, salários, impostos… → alimentam a DRE) e **trava anti-duplicação** — pode reimportar o mesmo arquivo todo mês que só entra o que é novo |

## Princípios implementados

- **Não duplicar informação**: venda alimenta produção, estoque, contas a receber,
  caixa, custo, resultado, DRE e histórico do cliente; serviço alimenta bem de
  terceiro, orçamento, OS, pagamento e devolução; compra alimenta estoque,
  fornecedor, contas a pagar, agenda e caixa.
- **Estoque ≠ bens de clientes** · **Receita ≠ recebimento** · **Despesa ≠ pagamento** —
  o caixa registra o dinheiro efetivo; contas a pagar/receber registram compromissos.
- **Rastreabilidade**: cada cabeçote tem linha do tempo completa
  (entrada → orçamento → aprovação → OS → produção → pagamento → NF → envio) e
  auditoria de alterações por usuário.
- **Permissões**: perfil Produção não vê salários, custos, margens nem financeiro
  sensível — controlado pela permissão “Dados financeiros sensíveis”.

## Arquitetura

- `server.js` — servidor HTTP + API REST (Node puro, sem dependências)
- `lib/db.js` — persistência JSON com gravação atômica
- `lib/domain.js` — regras de negócio (sexta-feira de pagamento, parcelas,
  Stage × comando × tucho, checklist de produção, resultado de venda, projeção, DRE)
- `lib/seed.js` — dados iniciais (perfis, catálogo com preços do modelo atual,
  produtos, componentes, fornecedores, recorrentes)
- `public/` — SPA responsiva com impressão dedicada. Identidade visual Jaques
  Motorsport: preto/grafite com acentos vermelhos, selo JM como ícone e
  wordmark serifada nos documentos (arquivos-fonte da marca em `branding/`)
