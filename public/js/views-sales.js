/* Vendas de cabeçotes e produção sob encomenda */
'use strict';

/* ================= VENDAS ================= */
App.registerView('sales', async (view, args) => {
  if (args[0] === 'nova') return saleEditor(view, args[1] ? Number(args[1]) : null);
  if (args[0] === 'orcamento') return saleEditor(view, args[1] ? Number(args[1]) : null, 'orcamento');

  App.setTitle('Vendas / Pedidos',
    'Orçamento → enviar ao cliente → aprovar → pedido oficial. O orçamento é só proposta: não movimenta estoque, produção nem financeiro');
  const [sales, quotes, clients] = await Promise.all([
    App.get('/sales'), App.get('/saleQuotes'), App.get('/clients')]);
  sales.sort((a, b) => b.id - a.id);
  quotes.sort((a, b) => b.id - a.id);
  const fin = App.can('finance_sensitive');
  const verValores = App.can('cashflow') || App.can('receivables') || App.can('payables') || fin;
  const ST = ['nao_produzido', 'preparacao', 'usinagem', 'montagem', 'pronto', 'enviado', 'entregue', 'cancelado'];

  /* O orçamento tem vocabulário próprio: "Enviado" aqui é "enviado ao
     cliente", não o pedido despachado. Por isso o rótulo sai desta tabela e
     não do mapa geral de status, onde essas palavras já têm outro sentido. */
  const ORC_ROTULOS = {
    elaboracao: ['Em elaboração', ''], enviado: ['Enviado ao cliente', 'info'],
    aguardando: ['Aguardando retorno', 'warn'], aprovado: ['Aprovado', 'ok'],
    recusado: ['Recusado', 'danger'], cancelado: ['Cancelado', 'danger'],
    expirado: ['Expirado', 'danger']
  };
  const badgeOrc = (sit) => {
    const [l, c] = ORC_ROTULOS[sit] || [sit, ''];
    return `<span class="badge ${c}">${App.esc(l)}</span>`;
  };

  /* Uma lista só, com orçamento e pedido lado a lado e etiqueta clara de
     qual é qual: é assim que se acompanha a negociação de ponta a ponta. */
  const FILTROS = [
    ['', 'Todos'],
    ['orc_abertos', 'Orçamentos em aberto'],
    ['orc_aguardando', 'Aguardando retorno'],
    ['orc_aprovados', 'Orçamentos aprovados'],
    ['vendas', 'Vendas efetivadas'],
    ['orc_perdidos', 'Recusados / cancelados / expirados']
  ];
  const ui = App.telaEstado('sales', { filtro: '', busca: '', status: '' });

  view.innerHTML = `
    <div class="toolbar">
      <button class="btn primary" onclick="location.hash='#/sales/orcamento'">+ Criar orçamento</button>
      <button class="btn" onclick="location.hash='#/sales/nova'">+ Nova venda</button>
      <select id="sf-tipo" style="max-width:240px">
        ${FILTROS.map(([v, l]) => `<option value="${v}"${v === ui.filtro ? ' selected' : ''}>${l}</option>`).join('')}
      </select>
      <select id="sf" style="max-width:190px"><option value="">Todos os status do pedido</option>
        ${ST.map(x => `<option value="${x}"${x === ui.status ? ' selected' : ''}>${(App.STATUS[x] || [x])[0]}</option>`).join('')}</select>
      <input id="sf-busca" style="flex:1;min-width:200px" value="${App.esc(ui.busca)}"
             placeholder="🔎 Cliente, nº do orçamento, nº do pedido, produto…">
      <button class="btn ghost" id="sf-limpar" title="Limpar filtros">✕</button>
      <div class="spacer"></div>
      <button class="btn" onclick="Sales.relatorio()">📊 Conversão</button>
      <button class="btn" onclick="Sales.print()">🖨️ Imprimir</button>
    </div>
    <div id="s-kpis"></div>
    <div id="s-table"></div>`;

  /* Nome curto da configuração, do jeito que a equipe fala: "Unilateral
     Stage 1", "Fluxo cruzado Stage 2". Comando e tucho não entram aqui —
     são detalhe do pedido, não identificação do produto. */
  const configLabel = (i) => `${i.tipo === 'crossflow' ? 'Fluxo cruzado' : 'Unilateral'} ${App.rotuloStage(i)}`;

  /* O que o pedido retira do Estoque próprio, peça por peça.
     O cabeçote consome componentes quando a ORDEM DE PRODUÇÃO fica pronta,
     não no instante da venda — por isso cada peça mostra a sua situação
     (baixa realizada, pendente, aguardando a produção, sem vínculo). */
  const SELO_BAIXA = {
    baixado: ['✓ Baixa realizada', 'ok'],
    aguardando: ['Aguardando a produção', 'info'],
    pendente: ['⚠ Baixa pendente', 'danger'],
    parcial: ['⚠ Baixa parcial', 'warn'],
    duplicado: ['⚠ Baixa em dobro', 'danger'],
    sem_vinculo: ['Item não vinculado ao estoque', 'warn'],
    fora_da_composicao: ['Necessita revisão', 'info']
  };
  const seloBaixa = (sit) => {
    const [l, c] = SELO_BAIXA[sit] || [sit, ''];
    return `<span class="badge ${c}">${App.esc(l)}</span>`;
  };

  async function renderComposicaoDaVenda(id) {
    const el = document.getElementById('sd-comp');
    if (!el) return;
    let d;
    try { d = await App.get(`/sales/${id}/composicao`); }
    catch (e) { el.innerHTML = `<p class="small muted">${App.esc(e.message)}</p>`; return; }

    const peca = (c) => `
      <tr>
        <td>${App.esc(c.nome)}${c.motivo ? `<div class="small muted">${App.esc(c.motivo)}</div>` : ''}</td>
        <td class="num"><b>${c.esperado}</b></td>
        <td class="num">${c.movido}</td>
        <td>${seloBaixa(c.situacao)}</td>
        <td>${(c.movimentos || []).length
          ? c.movimentos.map(m => `<span class="small muted">${App.date(m.data)} · ${
            m.tipo === 'saida' ? '−' : '+'}${m.qtd}${m.obs ? ' · ' + App.esc(m.obs) : ''}</span>`).join('<br>')
          : '<span class="small muted">sem movimentação</span>'}</td>
      </tr>`;

    el.innerHTML = `
      ${d.semOrdem ? `<p class="small" style="color:var(--danger)">Este pedido tem cabeçote mas
        <b>nenhuma ordem de produção</b> — sem ordem não existe baixa de componente.</p>` : ''}
      ${d.unidades.map((u, i) => `
        <div class="card" style="margin-bottom:10px">
          <div class="small" style="margin-bottom:6px">
            <b>Unidade ${i + 1} — ${App.esc(u.produto)}</b> ·
            ${App.esc(App.rotuloStage(u))} · comando ${App.esc(u.comando || '—')} ·
            tucho ${App.esc(String(u.tucho || '—'))} mm · ordem #${u.ordemId} · ${App.badge(u.status)}
            ${u.estoqueBaixado ? '<span class="badge ok">componentes baixados</span>' : '<span class="badge info">componentes ainda no estoque</span>'}
            ${u.baixaLegado ? '<span class="badge warn">baixa feita pela regra antiga (1 de cada peça)</span>' : ''}
          </div>
          <div class="tablewrap"><table>
            <tr><th>Peça</th><th class="num">Deve sair</th><th class="num">Saiu</th><th>Situação</th><th>Movimentações</th></tr>
            ${u.componentes.map(peca).join('')}
          </table></div>
          ${u.custoComponentes != null ? `<p class="small muted" style="margin-top:6px">Custo dos componentes desta unidade:
            <b>R$ ${App.money(u.custoComponentes)}</b></p>` : ''}
        </div>`).join('')}

      ${d.pecas.length ? `
        <div class="card" style="margin-bottom:10px">
          <div class="small" style="margin-bottom:6px"><b>Peças revendidas</b> — saem do estoque na própria venda</div>
          <div class="tablewrap"><table>
            <tr><th>Peça</th><th class="num">Deve sair</th><th class="num">Saiu</th><th>Situação</th><th>Movimentações</th></tr>
            ${d.pecas.map(peca).join('')}
          </table></div>
        </div>` : ''}

      ${!d.unidades.length && !d.pecas.length ? '<p class="small muted">Este pedido não movimenta o estoque próprio.</p>' : ''}
      ${d.problemas ? `<p class="small" style="color:var(--warn)">${d.problemas} ponto(s) para conferir —
        a lista completa, de todos os pedidos, está em <b>Produtos e custos → Conferência das baixas</b>.</p>`
        : (d.unidades.length || d.pecas.length ? '<p class="small pos">✓ Tudo que deveria sair do estoque está certo.</p>' : '')}`;
  }

  const cabecotes = (s) => (s.itens || []).filter(i => i.kind !== 'peca');
  const pecas = (s) => (s.itens || []).filter(i => i.kind === 'peca');
  const qtdCabecotes = (s) => cabecotes(s).reduce((a, i) => a + (Number(i.qtd) || 1), 0);

  /* Resumo do pedido em poucas linhas — "2× Unilateral Stage 1" — somando as
     configurações iguais. É o que permite enxergar vários pedidos de uma vez;
     o detalhe completo abre no botão Detalhes. */
  const resumoConfigs = (s) => {
    const grupos = [];
    const idx = new Map();
    for (const i of cabecotes(s)) {
      const nome = configLabel(i);
      if (idx.has(nome)) grupos[idx.get(nome)].qtd += (Number(i.qtd) || 1);
      else { idx.set(nome, grupos.length); grupos.push({ nome, qtd: Number(i.qtd) || 1 }); }
    }
    /* Uma configuração por linha, sem quebrar no meio do nome — é o que
       mantém a altura da linha proporcional ao que o pedido realmente tem. */
    const linhas = grupos.map(g => `${g.qtd}× ${App.esc(g.nome)}`);
    const np = pecas(s).reduce((a, i) => a + (Number(i.qtd) || 1), 0);
    if (np) linhas.push(`<span class="muted">${np}× peça(s) do estoque</span>`);
    return linhas.length
      ? linhas.map(l => `<div style="white-space:nowrap">${l}</div>`).join('')
      : '<span class="muted">—</span>';
  };

  /* Busca na linha toda: cliente, nº do orçamento, nº do pedido e produto.
     Sem acento e em qualquer ordem de palavras, igual às outras telas. */
  const textoDa = (r) => {
    const cliente = App.clientName(r.clienteId, clients) || '';
    const produtos = (r.itens || []).map(i => `${i.produto || ''} ${i.comando || ''} ${configLabel(i)}`).join(' ');
    return r._tipo === 'orcamento'
      ? `orcamento ${r.numero} ${r.pedidoNumero ? 'pedido ' + r.pedidoNumero : ''} ${cliente} ${produtos} ${r.observacoes || ''}`
      : `pedido ${r.numero} ${r.orcamentoNumero ? 'orcamento ' + r.orcamentoNumero : ''} ${cliente} ${produtos} ${r.observacoes || ''}`;
  };

  const linhas = () => {
    const orcs = quotes.map(o => Object.assign({}, o, { _tipo: 'orcamento', _data: o.dataOrcamento }));
    const vds = sales.map(v => Object.assign({}, v, { _tipo: 'venda', _data: v.dataPedido }));
    let list;
    switch (ui.filtro) {
      case 'orc_abertos': list = orcs.filter(o => o.situacao === 'elaboracao' || o.situacao === 'enviado'); break;
      case 'orc_aguardando': list = orcs.filter(o => o.situacao === 'aguardando'); break;
      case 'orc_aprovados': list = orcs.filter(o => o.situacao === 'aprovado'); break;
      case 'vendas': list = vds; break;
      case 'orc_perdidos': list = orcs.filter(o =>
        ['recusado', 'cancelado', 'expirado'].includes(o.situacao)); break;
      default: list = orcs.concat(vds);
    }
    if (ui.status) list = list.filter(r => r._tipo === 'venda' && r.status === ui.status);
    list = App.filtraPor(list, ui.busca, [textoDa]);
    return list.sort((a, b) => String(b._data || '').localeCompare(String(a._data || '')) || b.id - a.id);
  };

  const acoesOrc = (o) => {
    const virouVenda = !!o.saleId;
    return `
      <button class="btn sm" onclick="Orc.detalhes(${o.id})" title="Ver itens, valores e histórico">Detalhes</button>
      ${!virouVenda && o.situacao !== 'cancelado'
        ? `<button class="btn sm primary" onclick="Orc.aprovar(${o.id})" title="Aprovar e gerar o pedido oficial">✓ Aprovar e gerar venda</button>` : ''}
      ${virouVenda
        ? `<button class="btn sm ghost" onclick="Orc.irAoPedido(${o.id})" title="Abrir o pedido gerado">🧾 Pedido nº ${o.pedidoNumero}</button>` : ''}
      ${!virouVenda ? `<button class="btn sm ghost" onclick="Orc.situacao(${o.id})" title="Enviado ao cliente, aguardando retorno, recusado…">Situação</button>` : ''}
      ${!virouVenda ? `<button class="btn sm ghost" onclick="location.hash='#/sales/orcamento/${o.id}'" title="Editar o orçamento">✏️</button>` : ''}
      ${['recusado', 'cancelado'].includes(o.status) && !virouVenda
        ? `<button class="btn sm ghost" onclick="Orc.reabrir(${o.id})" title="Voltar para a negociação">↩️</button>` : ''}
      <button class="btn sm ghost wa" onclick="Orc.wa(${o.id})" title="Enviar a proposta no WhatsApp">✆</button>
      <button class="btn sm ghost" onclick="Orc.imprimir(${o.id})" title="Imprimir a proposta para o cliente">🖨️</button>
      <button class="btn sm ghost" onclick="Orc.duplicar(${o.id})" title="Nova proposta a partir desta">📋</button>
      ${!virouVenda ? `<button class="btn sm ghost" onclick="Orc.excluir(${o.id})" title="Excluir orçamento">🗑</button>` : ''}`;
  };

  const acoesVenda = (s) => `
    <button class="btn sm" onclick="Sales.detalhes(${s.id})" title="Ver comando, tucho, pagamento e demais dados">Detalhes</button>
    <button class="btn sm ghost" onclick="Sales.status(${s.id})">Status</button>
    ${verValores ? `<button class="btn sm ghost" onclick="Sales.receber(${s.id})" title="Registrar recebimento (entrada / saldo)">💵</button>` : ''}
    <button class="btn sm ghost wa" onclick="Sales.wa(${s.id})" title="Avisar o cliente no WhatsApp">✆</button>
    <button class="btn sm ghost" onclick="Sales.etiqueta(${s.id})" title="Gerar etiqueta de envio">📦</button>
    ${fin ? `<button class="btn sm ghost" onclick="Sales.result(${s.id})">Resultado</button>` : ''}
    <button class="btn sm ghost" onclick="location.hash='#/sales/nova/${s.id}'" title="Editar venda">✏️</button>
    <button class="btn sm ghost" onclick="Sales.duplicar(${s.id})" title="Duplicar venda">📋</button>
    <button class="btn sm ghost" onclick="Sales.excluir(${s.id})" title="Excluir venda">🗑</button>`;

  const render = () => {
    const list = linhas();
    const orcs = quotes.map(o => o);
    const emNeg = orcs.filter(o => o.emNegociacao);
    const aprov = orcs.filter(o => o.situacao === 'aprovado');
    const perdidos = orcs.filter(o => ['recusado', 'cancelado', 'expirado'].includes(o.situacao));
    const somaOrc = (l) => l.reduce((a, o) => a + (Number(o.valorTotal) || 0), 0);
    document.getElementById('s-kpis').innerHTML = `
      <div class="grid cols-4">
        <div class="card kpi ${emNeg.length ? 'k-warn' : ''}"><div class="label">Orçamentos em negociação</div>
          <div class="value">${emNeg.length}</div>
          ${verValores ? `<div class="hint">R$ ${App.money(somaOrc(emNeg))} em proposta</div>` : ''}</div>
        <div class="card kpi k-ok"><div class="label">Aprovados e convertidos</div>
          <div class="value">${aprov.length}</div>
          ${verValores ? `<div class="hint">R$ ${App.money(somaOrc(aprov))} fechados</div>` : ''}</div>
        <div class="card kpi"><div class="label">Recusados / expirados</div>
          <div class="value">${perdidos.length}</div>
          <div class="hint">ficam no histórico, sem excluir</div></div>
        <div class="card kpi"><div class="label">Pedidos oficiais</div>
          <div class="value">${sales.filter(v => v.status !== 'cancelado').length}</div>
          <div class="hint">${orcs.length ? `taxa de conversão ${(aprov.length / orcs.length * 100).toFixed(0)}%` : 'vendas ativas'}</div></div>
      </div>`;

    document.getElementById('s-table').innerHTML = App.table(list, [
      { h: 'Registro', cell: r => r._tipo === 'orcamento'
        ? `<span class="badge accent">ORÇAMENTO</span> <b>nº ${r.numero}</b>
           <div class="small muted">${App.date(r.dataOrcamento)}${r.versao > 1 ? ` · versão ${r.versao}` : ''}</div>`
        : `<span class="badge ok">PEDIDO</span> <b>nº ${r.numero}</b>
           <div class="small muted">${App.date(r.dataPedido)}</div>` },
      { h: 'Cliente', cell: r => App.clientCell(r.clienteId, clients) },
      { h: 'Qtd', class: 'num', cell: r => `<b>${qtdCabecotes(r)}</b>` },
      { h: 'Configurações', cell: r => resumoConfigs(r) },
      ...(verValores ? [{ h: 'Valor', class: 'num', cell: r => `${App.moneyHtml(r.valorTotal)}${
        r.descontoValor ? `<div class="small muted">desc. R$ ${App.money(r.descontoValor)}</div>` : ''}` }] : []),
      { h: 'Situação', cell: r => r._tipo === 'orcamento'
        ? `${badgeOrc(r.situacao)}${r.vencimento && r.emNegociacao
            ? `<div class="small muted">vale até ${App.date(r.vencimento)}</div>` : ''}`
        : App.badge(r.status) },
      { h: 'Vínculo', cell: r => r._tipo === 'orcamento'
        ? (r.pedidoNumero ? `<span class="small">virou o pedido <b>nº ${r.pedidoNumero}</b></span>`
          : '<span class="small muted">proposta — nada movimentado</span>')
        : (r.orcamentoNumero ? `<span class="small">do orçamento <b>nº ${r.orcamentoNumero}</b></span>`
          : '<span class="small muted">pedido direto</span>') },
      { h: '', class: 'num', cell: r => r._tipo === 'orcamento' ? acoesOrc(r) : acoesVenda(r) }
    ], { emptyMsg: 'Nada encontrado com estes filtros',
      onRow: r => r._tipo === 'orcamento' ? Orc.detalhes(r.id) : Sales.detalhes(r.id) });
  };
  render();
  document.getElementById('sf-tipo').addEventListener('change', e => { ui.filtro = e.target.value; render(); });
  document.getElementById('sf').addEventListener('change', e => { ui.status = e.target.value; render(); });
  document.getElementById('sf-busca').addEventListener('input', e => { ui.busca = e.target.value; render(); });
  document.getElementById('sf-limpar').addEventListener('click', () => {
    ui.filtro = ''; ui.status = ''; ui.busca = '';
    document.getElementById('sf-tipo').value = '';
    document.getElementById('sf').value = '';
    document.getElementById('sf-busca').value = '';
    render();
  });

  /* ================= ORÇAMENTO DE VENDA =================
     Proposta comercial: tudo o que a venda tem, menos as consequências.
     Só a aprovação gera pedido, produção, estoque e cobrança. */
  window.Orc = {
    detalhes(id) {
      const o = quotes.find(x => x.id === id);
      if (!o) return;
      const pg = o.pagamento || {};
      App.modal(`
        <h2><span class="badge accent">ORÇAMENTO</span> nº ${o.numero} — ${App.esc(App.clientName(o.clienteId, clients))}</h2>
        <p class="small muted">${App.esc(o.cidade || '—')}${o.estado ? '/' + App.esc(o.estado) : ''}
          · ${App.date(o.dataOrcamento)}
          ${o.vencimento ? `· vale até ${App.date(o.vencimento)}` : ''}
          ${o.versao > 1 ? `· versão ${o.versao}` : ''}
          · ${badgeOrc(o.situacao)}</p>
        ${o.saleId ? `<p class="small pos">✓ Aprovado em ${App.date(o.dataAprovacao)}${
          o.aprovadoPor ? ' por ' + App.esc(o.aprovadoPor) : ''} — virou o <b>pedido nº ${o.pedidoNumero}</b>.</p>` : ''}
        ${o.motivo ? `<p class="small" style="color:var(--danger)">Motivo: ${App.esc(o.motivo)}</p>` : ''}

        <h3 class="section-title">Itens</h3>
        ${App.table(o.itens || [], [
          { h: 'Qtd', class: 'num', cell: i => i.qtd },
          { h: 'Produto', cell: i => `<b>${App.esc(i.produto)}</b>` },
          { h: 'Configuração', cell: i => i.kind === 'peca'
            ? '<span class="muted">peça do estoque</span>'
            : `${App.esc(configLabel(i))}<div class="small muted">comando ${App.esc(i.comando || '—')} · tucho ${App.esc(String(i.tucho || '—'))} mm</div>` },
          ...(verValores ? [
            { h: 'Unitário', class: 'num', cell: i => App.moneyHtml(i.valorUnit) },
            { h: 'Total', class: 'num', cell: i => App.moneyHtml(i.total) }] : [])
        ], { emptyMsg: 'Sem itens' })}

        ${verValores ? `
          <h3 class="section-title">Valores e pagamento pretendido</h3>
          <table style="font-size:13.5px">
            <tr><td>Subtotal dos itens</td><td class="num">R$ ${App.money(o.valorBruto || o.valorTotal)}</td></tr>
            ${o.descontoValor ? `<tr><td>Desconto${(o.desconto || {}).tipo === 'percentual'
              ? ` (${(o.desconto || {}).valor}%)` : ''}</td>
              <td class="num neg">− R$ ${App.money(o.descontoValor)}</td></tr>` : ''}
            <tr><td><b>Valor do orçamento</b></td><td class="num"><b>R$ ${App.money(o.valorTotal)}</b></td></tr>
            <tr><td>Pagamento pretendido</td><td class="num">${App.esc(pg.forma || '—')}${
              pg.condicao === 'parcelado' && pg.parcelas > 1 ? ` · ${pg.parcelas}x` : ' · à vista'}</td></tr>
            ${o.previsaoEntrega ? `<tr><td>Previsão de entrega</td><td class="num">${App.date(o.previsaoEntrega)}</td></tr>` : ''}
          </table>
          <p class="small muted" style="margin-top:6px">Nenhuma cobrança foi criada: as parcelas em Contas a
          receber nascem quando o orçamento for aprovado.</p>` : ''}

        ${o.observacoes ? `<h3 class="section-title">Observações</h3><p>${App.esc(o.observacoes)}</p>` : ''}

        <h3 class="section-title">Histórico da negociação</h3>
        ${App.table((o.historico || []).slice().reverse(), [
          { h: 'Quando', cell: h => `<span class="small">${App.dateTime(h.at)}</span>` },
          { h: 'Quem', cell: h => App.esc(h.por || '') },
          { h: 'O que aconteceu', cell: h => App.esc(h.evento || '') },
          ...(verValores ? [{ h: 'Valor na hora', class: 'num',
            cell: h => h.valorTotal != null ? 'R$ ' + App.money(h.valorTotal) : '—' }] : [])
        ], { emptyMsg: 'Sem histórico' })}

        <div class="actions">
          <button class="btn" onclick="App.closeModal()">Fechar</button>
          <button class="btn ghost" onclick="Orc.imprimir(${o.id})">🖨️ Imprimir proposta</button>
          ${o.saleId
            ? `<button class="btn primary" onclick="Orc.irAoPedido(${o.id})">Abrir pedido nº ${o.pedidoNumero}</button>`
            : `<button class="btn ghost" onclick="App.closeModal();location.hash='#/sales/orcamento/${o.id}'">✏️ Editar</button>
               <button class="btn primary" onclick="Orc.aprovar(${o.id})">✓ Aprovar e gerar venda</button>`}
        </div>`, { wide: true });
    },

    situacao(id) {
      const o = quotes.find(x => x.id === id);
      const opcoes = [
        { value: 'elaboracao', label: 'Em elaboração — ainda montando a proposta' },
        { value: 'enviado', label: 'Enviado ao cliente' },
        { value: 'aguardando', label: 'Aguardando retorno do cliente' },
        { value: 'recusado', label: 'Recusado — o cliente não fechou' },
        { value: 'cancelado', label: 'Cancelado' }
      ];
      App.form(`Situação do orçamento nº ${o.numero}`, [
        { name: 'status', label: 'Nova situação', type: 'select', value: o.status, full: true, options: opcoes },
        { name: 'motivo', label: 'Motivo (para recusado ou cancelado)', full: true, value: o.motivo || '' }
      ], async d => {
        await App.post(`/saleQuotes/${id}/status`, d);
        App.closeModal();
        App.toast('Situação atualizada — o orçamento continua no histórico', 'ok');
        App.route();
      }, { submitLabel: 'Salvar situação' });
      /* Aprovar não entra nesta lista de propósito: aprovar é gerar a venda
         oficial, e isso tem botão próprio, com confirmação do que será criado. */
    },

    async aprovar(id) {
      const o = quotes.find(x => x.id === id);
      if (!o) return;
      const cabecotes = (o.itens || []).filter(i => i.kind !== 'peca')
        .reduce((a, i) => a + (Number(i.qtd) || 1), 0);
      const pecas = (o.itens || []).filter(i => i.kind === 'peca')
        .reduce((a, i) => a + (Number(i.qtd) || 1), 0);
      const pg = o.pagamento || {};
      const efeitos = [
        'é gerado o <b>pedido oficial</b>, com número próprio, ligado a este orçamento',
        cabecotes ? `<b>${cabecotes}</b> ordem(ns) de produção entram na fila da oficina` : '',
        pecas ? `<b>${pecas}</b> peça(s) de revenda saem do estoque` : '',
        verValores ? `o valor de <b>R$ ${App.money(o.valorTotal)}</b> vira cobrança em Contas a receber${
          pg.condicao === 'parcelado' && pg.parcelas > 1 ? ` (${pg.parcelas} parcelas)` : ''}` : '',
        '<b>nada</b> entra no Fluxo de caixa: o dinheiro só entra quando você registrar o recebimento'
      ].filter(Boolean);

      if (!await App.confirm(
        `Aprovar o orçamento <b>nº ${o.numero}</b> e gerar a venda?<br><br>` +
        efeitos.map(e => '• ' + e).join('<br>') +
        '<br><br><span class="small">O orçamento continua gravado com o número, a data, os valores ' +
        'apresentados, o desconto e todo o histórico — e passa a apontar para o pedido gerado.</span>',
        { html: true })) return;

      const enviar = async (extra) => {
        const out = await App.post(`/saleQuotes/${id}/aprovar`, extra || {});
        App.closeModal();
        App.toast(`Orçamento nº ${o.numero} aprovado — pedido nº ${out.venda.numero} gerado`, 'ok');
        App.route();
      };
      try { await enviar(); }
      catch (e) {
        const d = e.dados || {};
        if (d.expirado) {
          if (!await App.confirm(`${App.esc(e.message)}<br><br>Aprovar mesmo assim?`, { html: true })) return;
          try { await enviar({ confirmarExpirado: true }); } catch (e2) { App.toast(e2.message, 'err'); }
          return;
        }
        if (d.jaAprovado) {
          if (!await App.confirm(
            `${App.esc(e.message)}<br><br><b>Gerar um segundo pedido</b> com os mesmos itens?<br>` +
            '<span class="small">Isto cria outra venda, outra produção e outra cobrança. ' +
            'Só faça se o cliente realmente comprou duas vezes.</span>', { html: true })) return;
          try { await enviar({ gerarOutraVenda: true, confirmarExpirado: true }); }
          catch (e2) { App.toast(e2.message, 'err'); }
          return;
        }
        App.toast(e.message, 'err');
      }
    },

    async reabrir(id) {
      const o = quotes.find(x => x.id === id);
      if (!await App.confirm(`Reabrir a negociação do orçamento nº ${o.numero}?`)) return;
      try {
        await App.post(`/saleQuotes/${id}/reabrir`, {});
        App.toast('Orçamento de volta em "Aguardando retorno"', 'ok');
        App.route();
      } catch (e) { App.toast(e.message, 'err'); }
    },

    irAoPedido(id) {
      const o = quotes.find(x => x.id === id);
      App.closeModal();
      if (!o || !o.saleId) return App.toast('Este orçamento ainda não gerou pedido', 'err');
      ui.filtro = 'vendas'; ui.busca = String(o.pedidoNumero || '');
      location.hash = '#/sales';
      App.route();
      App.toast(`Mostrando o pedido nº ${o.pedidoNumero}`, 'ok');
    },

    wa(id) {
      const o = quotes.find(x => x.id === id);
      const c = clients.find(x => x.id === o.clienteId);
      App.waShare(`Orçamento nº ${o.numero} — ${(c && c.nome) || 'cliente'}`,
        App.waPhoneOf(c), App.waMsg.saleQuote(o, c));
    },

    async duplicar(id) {
      const o = quotes.find(x => x.id === id);
      if (!await App.confirm(`Criar um novo orçamento com os itens do nº ${o.numero}?`)) return;
      try {
        const novo = await App.post(`/saleQuotes/${id}/duplicate`, {});
        App.toast(`Orçamento nº ${novo.numero} criado a partir do nº ${o.numero}`, 'ok');
        location.hash = `#/sales/orcamento/${novo.id}`;
      } catch (e) { App.toast(e.message, 'err'); }
    },

    async excluir(id) {
      const o = quotes.find(x => x.id === id);
      try {
        await App.del(`/saleQuotes/${id}`);
        App.toast('Orçamento excluído', 'ok');
        App.route();
      } catch (e) {
        if (!(e.dados && e.dados.precisaConfirmar)) return App.toast(e.message, 'err');
        if (!await App.confirm(
          `${App.esc(e.message)}<br><br><span class="small">Marcar como <b>Recusado</b> mantém o registro ` +
          'para o relatório de conversão. Excluir apaga de vez.</span>', { html: true })) return;
        try {
          await App.del(`/saleQuotes/${id}`, { 'X-Confirmar': 'sim' });
          App.toast(`Orçamento nº ${o.numero} excluído`, 'ok');
          App.route();
        } catch (e2) { App.toast(e2.message, 'err'); }
      }
    },

    /* O corpo do relatório é o mesmo na tela e no papel. */
    relatorioCorpo(r) {
      const t = r.totais;
      return `
        <div class="grid cols-4">
          <div class="card kpi"><div class="label">Orçamentos criados</div><div class="value">${t.criados}</div>
            <div class="hint">${t.enviados} enviado(s) ao cliente</div></div>
          <div class="card kpi k-ok"><div class="label">Aprovados</div><div class="value">${t.aprovados}</div>
            <div class="hint">taxa de conversão ${t.taxaConversao}%</div></div>
          <div class="card kpi k-warn"><div class="label">Em negociação</div><div class="value">${t.emNegociacao}</div>
            <div class="hint">ainda sem resposta</div></div>
          <div class="card kpi k-danger"><div class="label">Recusados / cancelados / expirados</div>
            <div class="value">${t.recusados + t.cancelados + t.expirados}</div>
            <div class="hint">${t.recusados} recusado(s) · ${t.expirados} expirado(s)</div></div>
        </div>
        ${verValores ? `
        <table style="font-size:13.5px;margin-top:12px">
          <tr><td>Valor total orçado no período</td><td class="num"><b>R$ ${App.money(t.valorOrcado)}</b></td></tr>
          <tr><td>Valor ainda em negociação</td><td class="num">R$ ${App.money(t.valorEmNegociacao)}</td></tr>
          <tr><td>Valor dos orçamentos aprovados</td><td class="num pos">R$ ${App.money(t.valorAprovado)}</td></tr>
          <tr><td><b>Valor convertido em pedidos</b></td>
              <td class="num"><b class="pos">R$ ${App.money(t.valorConvertido)}</b></td></tr>
          <tr><td>Valor recusado</td><td class="num neg">R$ ${App.money(t.valorRecusado)}</td></tr>
        </table>
        <p class="small muted">O valor convertido é o do <b>pedido</b> gerado — se o valor foi ajustado
        depois da aprovação, é o do pedido que vale. Pedido cancelado não conta.</p>` : ''}
        ${r.meses.length ? `
        <h3 class="section-title">Mês a mês</h3>
        ${App.table(r.meses, [
          { h: 'Mês', cell: m => `<b>${App.esc(App.mesRotulo(m.mes))}</b>` },
          { h: 'Orçamentos', class: 'num', cell: m => m.qtd },
          { h: 'Aprovados', class: 'num', cell: m => m.aprovados },
          { h: 'Recusados', class: 'num', cell: m => m.recusados },
          { h: 'Conversão', class: 'num', cell: m => m.qtd ? (m.aprovados / m.qtd * 100).toFixed(0) + '%' : '—' },
          ...(verValores ? [
            { h: 'Valor orçado', class: 'num', cell: m => 'R$ ' + App.money(m.valor) },
            { h: 'Valor aprovado', class: 'num', cell: m => 'R$ ' + App.money(m.valorAprovado) }] : [])
        ])}` : ''}
        <h3 class="section-title">Orçamentos do período</h3>
        ${App.table(r.orcamentos, [
          { h: 'Nº', cell: o => `<b>${o.numero}</b>` },
          { h: 'Data', cell: o => App.date(o.data) },
          { h: 'Cliente', cell: o => App.esc(o.cliente) },
          ...(verValores ? [{ h: 'Valor', class: 'num', cell: o => 'R$ ' + App.money(o.valorTotal) }] : []),
          { h: 'Situação', cell: o => badgeOrc(o.situacao) },
          { h: 'Pedido', cell: o => o.pedidoNumero
            ? `<span class="small">nº ${o.pedidoNumero}<br><span class="muted">${App.date(o.dataAprovacao)}${
              o.aprovadoPor ? ' · ' + App.esc(o.aprovadoPor) : ''}</span></span>`
            : '<span class="muted">—</span>' }
        ], { emptyMsg: 'Nenhum orçamento neste período' })}`;
    },

    imprimirRelatorio(r) {
      const t = r.totais;
      App.print('Conversão de orçamentos',
        `<p><b>Período:</b> ${App.date(r.periodo.de) || 'início'} a ${App.date(r.periodo.ate) || 'hoje'}</p>
        <table>
          <tr><th>Indicador</th><th class="num">Valor</th></tr>
          <tr><td>Orçamentos criados</td><td class="num">${t.criados}</td></tr>
          <tr><td>Enviados ao cliente</td><td class="num">${t.enviados}</td></tr>
          <tr><td>Aprovados</td><td class="num">${t.aprovados}</td></tr>
          <tr><td>Recusados</td><td class="num">${t.recusados}</td></tr>
          <tr><td>Cancelados</td><td class="num">${t.cancelados}</td></tr>
          <tr><td>Expirados</td><td class="num">${t.expirados}</td></tr>
          <tr><td>Ainda em negociação</td><td class="num">${t.emNegociacao}</td></tr>
          <tr><td>Taxa de conversão</td><td class="num">${t.taxaConversao}%</td></tr>
          ${verValores ? `
          <tr><td>Valor total orçado</td><td class="num">R$ ${App.money(t.valorOrcado)}</td></tr>
          <tr><td>Valor convertido em pedidos</td><td class="num">R$ ${App.money(t.valorConvertido)}</td></tr>` : ''}
        </table>
        <table>
          <tr><th>Nº</th><th>Data</th><th>Cliente</th>${verValores ? '<th class="num">Valor</th>' : ''}<th>Situação</th><th>Pedido</th></tr>
          ${r.orcamentos.map(o => `<tr><td>${o.numero}</td><td>${App.date(o.data)}</td>
            <td>${App.esc(o.cliente)}</td>
            ${verValores ? `<td class="num">R$ ${App.money(o.valorTotal)}</td>` : ''}
            <td>${(({ elaboracao: 'Em elaboração', enviado: 'Enviado', aguardando: 'Aguardando retorno',
              aprovado: 'Aprovado', recusado: 'Recusado', cancelado: 'Cancelado', expirado: 'Expirado' })[o.situacao] || o.situacao)}</td>
            <td>${o.pedidoNumero ? 'nº ' + o.pedidoNumero : '—'}</td></tr>`).join('')}
        </table>`,
        `${t.criados} orçamento(s) · ${t.aprovados} aprovado(s)`);
    },

    imprimir(id) {
      const o = quotes.find(x => x.id === id);
      const c = clients.find(x => x.id === o.clienteId) || {};
      const pg = o.pagamento || {};
      App.print(`Orçamento nº ${o.numero}`,
        `<p><b>Cliente:</b> ${App.esc(c.nome || '—')}${c.cidade ? ' — ' + App.esc(c.cidade) : ''}${
          c.estado ? '/' + App.esc(c.estado) : ''}</p>
        <p><b>Data:</b> ${App.date(o.dataOrcamento)}${o.vencimento ? ` &nbsp;·&nbsp; <b>Validade:</b> até ${App.date(o.vencimento)}` : ''}</p>
        <table>
          <tr><th class="num">Qtd</th><th>Produto</th><th>Configuração</th>${verValores
            ? '<th class="num">Valor unitário</th><th class="num">Total</th>' : ''}</tr>
          ${(o.itens || []).map(i => `<tr>
            <td class="num">${i.qtd}</td>
            <td>${App.esc(i.produto)}</td>
            <td>${i.kind === 'peca' ? 'peça' : `${App.esc(configLabel(i))} · comando ${App.esc(i.comando || '—')} · tucho ${App.esc(String(i.tucho || '—'))} mm`}</td>
            ${verValores ? `<td class="num">R$ ${App.money(i.valorUnit)}</td><td class="num">R$ ${App.money(i.total)}</td>` : ''}
          </tr>`).join('')}
          ${verValores && o.descontoValor ? `<tr><td colspan="4"><b>Desconto</b></td>
            <td class="num">− R$ ${App.money(o.descontoValor)}</td></tr>` : ''}
          ${verValores ? `<tr><td colspan="4"><b>TOTAL</b></td>
            <td class="num"><b>R$ ${App.money(o.valorTotal)}</b></td></tr>` : ''}
        </table>
        ${verValores && pg.forma ? `<p><b>Pagamento:</b> ${App.esc(pg.forma)}${
          pg.condicao === 'parcelado' && pg.parcelas > 1 ? ` em ${pg.parcelas}x` : ' à vista'}</p>` : ''}
        ${o.previsaoEntrega ? `<p><b>Previsão de entrega:</b> ${App.date(o.previsaoEntrega)}</p>` : ''}
        ${o.observacoes ? `<p><b>Observações:</b> ${App.esc(o.observacoes)}</p>` : ''}
        <p class="meta">Este documento é uma proposta comercial e não constitui pedido.
        A produção e a entrega começam a contar da aprovação.</p>`,
        `${(o.itens || []).length} item(ns)`);
    }
  };

  window.Sales = {
    /* Tudo que saiu da listagem para ela caber na tela: comando, tucho,
       valores, pagamento e recebimentos de um pedido só. Quem não enxerga
       financeiro continua sem ver valor nenhum aqui. */
    async detalhes(id) {
      const s = sales.find(x => x.id === id);
      if (!s) return;
      /* Quem diz quanto entrou é o servidor: ele soma os recebimentos da
         venda E as parcelas baixadas em Contas a receber, cada um uma vez.
         Somar aqui por conta própria foi o que já fez a tela mostrar
         "recebido" maior que o total e saldo negativo. */
      let fin = { total: s.valorTotal, recebido: 0, saldo: s.valorTotal };
      if (verValores) { try { fin = await App.get(`/sales/${id}/financeiro`); } catch (e) { /* sem permissão */ } }
      const rec = fin.recebido, saldo = fin.saldo;
      const pg = s.pagamento || {};
      App.modal(`
        <h2><span class="badge ok">PEDIDO</span> nº ${s.numero} — ${App.esc(App.clientName(s.clienteId, clients))}</h2>
        ${s.orcamentoNumero ? `<p class="small">Nasceu do <b>orçamento nº ${s.orcamentoNumero}</b>${
          s.dataOrcamento ? ` (de ${App.date(s.dataOrcamento)})` : ''}${
          s.valorOrcado != null && verValores && Math.abs(s.valorOrcado - s.valorTotal) > 0.005
            ? ` — orçado em R$ ${App.money(s.valorOrcado)}` : ''}
          ${s.orcamentoId ? `<button class="btn sm ghost" onclick="App.closeModal();Orc.detalhes(${s.orcamentoId})">ver o orçamento</button>` : ''}</p>` : ''}
        <p class="small muted">${App.esc(s.cidade || '—')}${s.estado ? '/' + App.esc(s.estado) : ''}
          · pedido em ${App.date(s.dataPedido)}
          · previsão ${App.date(s.previsaoEntrega)}
          ${s.dataEnvio ? '· enviado em ' + App.date(s.dataEnvio) : ''}
          · ${App.badge(s.status)}</p>

        <h3 class="section-title">Itens</h3>
        ${App.table(s.itens || [], [
          { h: 'Qtd', class: 'num', cell: i => i.qtd },
          { h: 'Produto', cell: i => `<b>${App.esc(i.produto)}</b>` },
          { h: 'Configuração', cell: i => i.kind === 'peca'
              ? '<span class="muted">peça do estoque</span>'
              : `${App.esc(configLabel(i))}<div class="small muted">comando ${App.esc(i.comando || '—')} · tucho ${App.esc(String(i.tucho || '—'))} mm</div>` },
          ...(verValores ? [
            { h: 'Unitário', class: 'num', cell: i => App.moneyHtml(i.valorUnit) },
            { h: 'Total', class: 'num', cell: i => App.moneyHtml(i.total) }] : [])
        ], { emptyMsg: 'Sem itens' })}

        ${verValores ? `
          <h3 class="section-title">Valores e pagamento</h3>
          <table style="font-size:13.5px">
            ${s.descontoValor ? `<tr><td>Subtotal dos itens</td><td class="num">R$ ${App.money(s.valorBruto || s.valorTotal)}</td></tr>
            <tr><td>Desconto${(s.desconto || {}).tipo === 'percentual' ? ` (${(s.desconto || {}).valor}%)` : ''}</td>
                <td class="num neg">− R$ ${App.money(s.descontoValor)}</td></tr>` : ''}
            <tr><td>Valor total</td><td class="num"><b>R$ ${App.money(s.valorTotal)}</b></td></tr>
            ${(s.custosAdicionais || []).map(c => `<tr><td class="muted">Custo adicional — ${App.esc(c.desc || '')}</td>
              <td class="num muted">R$ ${App.money(c.valor)}</td></tr>`).join('')}
            <tr><td>Forma</td><td class="num">${App.esc(pg.forma || '—')}${pg.parcelas > 1 ? ` · ${pg.parcelas}x` : ''}${pg.condicao ? ` · ${App.esc(pg.condicao)}` : ''}</td></tr>
            ${pg.taxa ? `<tr><td>Taxa da operadora</td><td class="num neg">R$ ${App.money(pg.taxa)}</td></tr>
              <tr><td>Valor líquido</td><td class="num">R$ ${App.money(pg.valorLiquido)}</td></tr>` : ''}
            <tr><td>Já recebido</td><td class="num pos">R$ ${App.money(rec)}</td></tr>
            <tr><td><b>Saldo em aberto</b></td><td class="num"><b class="${saldo > 0.005 ? 'neg' : 'pos'}">R$ ${App.money(saldo)}</b></td></tr>
          </table>` : ''}

        ${s.observacoes ? `<h3 class="section-title">Observações</h3><p>${App.esc(s.observacoes)}</p>` : ''}

        <h3 class="section-title">Composição e baixas de estoque</h3>
        <div id="sd-comp"><div class="empty">Conferindo o que saiu do estoque…</div></div>

        <div class="actions">
          <button class="btn" onclick="App.closeModal()">Fechar</button>
          <button class="btn primary" onclick="App.closeModal();location.hash='#/sales/nova/${s.id}'">✏️ Editar pedido</button>
        </div>`, { wide: true });
      renderComposicaoDaVenda(id);
    },

    /* Recebimento em etapas: entrada agora, saldo na entrega.
       O que falta continua em Contas a receber e na projeção. */
    async receber(id) {
      const s = sales.find(x => x.id === id);
      let fin;
      try { fin = await App.get(`/sales/${id}/financeiro`); }
      catch (e) { return App.toast(e.message, 'err'); }
      const lista = fin.recebimentos || [];
      const recebido = fin.recebido, saldo = fin.saldo;
      /* Parcelas de boleto baixadas em Contas a receber também são dinheiro
         desta venda: entram no "já recebido" e no saldo. */
      const noBoleto = (fin.parcelas || []).filter(x => (Number(x.recebido) || 0) > 0 || x.status === 'paga');
      /* Cobrança própria (plano de boletos, cartão, link): o registro do
         dinheiro é a PARCELA, em Contas a receber. Receber por aqui criaria
         um segundo controle do mesmo valor — o servidor recusa. */
      const propria = (fin.parcelas || []);
      const temPropria = propria.length > 0;
      const emAberto = propria.filter(x => (Number(x.valor) || 0) - (Number(x.recebido) || 0) > 0.005
        && x.status !== 'cancelada');
      const m = App.modal(`
        <h2>Recebimentos — pedido nº ${s.numero}</h2>
        <table style="font-size:13.5px;margin-bottom:10px">
          <tr><td>Valor total da venda</td><td class="num"><b>R$ ${App.money(fin.total)}</b></td></tr>
          <tr><td>Já recebido</td><td class="num pos">R$ ${App.money(recebido)}</td></tr>
          <tr><td><b>Saldo em aberto</b></td><td class="num"><b class="${saldo > 0.005 ? 'neg' : 'pos'}">R$ ${App.money(saldo)}</b></td></tr>
        </table>
        <p class="small muted" style="margin:-4px 0 10px">Cadastrar a venda não lança dinheiro no caixa.
        O Fluxo de caixa recebe o valor quando o cliente paga — total ou em parte.<br>
        Esta tela e <b>Contas a receber</b> mostram o mesmo recebimento: o que você registrar aqui
        aparece lá no mesmo instante, e o contrário também.</p>
        ${noBoleto.length ? `<p class="small">Já baixado em Contas a receber:
          ${noBoleto.map(x => `${App.esc(x.descricao || 'parcela')} — R$ ${App.money((Number(x.recebido) || 0) || x.valor)}`).join(' · ')}</p>` : ''}
        ${lista.length ? App.table(lista.map((r, i) => Object.assign({ _i: i }, r)), [
          { h: 'Data', cell: r => App.date(r.data) },
          { h: 'Forma', cell: r => App.esc(r.forma) },
          { h: 'Valor', class: 'num', cell: r => 'R$ ' + App.money(r.valor) },
          { h: '', class: 'num', cell: r => `<button class="btn sm ghost" onclick="Sales.desfazerRecebimento(${id}, ${r._i})" title="Estornar">↩</button>` }
        ]) : '<p class="small muted">Nenhum recebimento registrado ainda.</p>'}
        ${temPropria ? `
        <hr class="sep">
        <p class="small">Este pedido tem <b>${propria.length} cobrança(s) própria(s)</b>
        ${propria.length > 1 ? '(parcelas do plano)' : '(cartão / link)'} em <b>Contas a receber</b>.
        A baixa é dada lá, parcela por parcela, para o dinheiro ser registrado uma vez só.</p>
        ${App.table(propria, [
          { h: 'Cobrança', cell: x => App.esc(x.descricao || 'parcela') },
          { h: 'Vencimento', cell: x => App.date(x.vencimento) },
          { h: 'Valor', class: 'num', cell: x => 'R$ ' + App.money(x.valor) },
          { h: 'Recebido', class: 'num', cell: x => 'R$ ' + App.money(x.recebido || 0) },
          { h: 'Situação', cell: x => App.badge(x.status) }
        ])}
        <div class="actions">
          <button class="btn" onclick="App.closeModal()">Fechar</button>
          ${emAberto.length ? `<button class="btn primary" onclick="App.closeModal();location.hash='#/receivables'">Ir para Contas a receber</button>` : ''}
        </div>` : `
        ${saldo > 0.005 ? `
        <hr class="sep">
        <div class="formgrid">
          <label class="field"><span>Valor recebido agora (R$)</span>
            <input type="number" step="0.01" id="rc-valor" value="${saldo.toFixed(2)}"></label>
          <label class="field"><span>Data</span><input type="date" id="rc-data" value="${App.today()}"></label>
          <label class="field"><span>Forma</span>
            <select id="rc-forma">${['pix', 'dinheiro', 'cartao', 'boleto', 'cheque', 'link'].map(f => `<option value="${f}">${f}</option>`).join('')}</select></label>
          <label class="field"><span>Vencimento do saldo restante</span>
            <input type="date" id="rc-venc" value="${s.previsaoEntrega || ''}"></label>
        </div>` : '<p class="small pos" style="margin-top:8px">✓ Venda totalmente recebida.</p>'}
        <div class="actions">
          <button class="btn" onclick="App.closeModal()">Fechar</button>
          ${saldo > 0.005 ? '<button class="btn primary" id="rc-ok">Registrar recebimento</button>' : ''}
        </div>`}`, { wide: true });
      const btn = m.querySelector('#rc-ok');
      if (btn) btn.onclick = async () => {
        try {
          const corpo = {
            valor: Number(m.querySelector('#rc-valor').value),
            data: m.querySelector('#rc-data').value,
            forma: m.querySelector('#rc-forma').value,
            vencimentoSaldo: m.querySelector('#rc-venc').value
          };
          const lancar = async (confirmar) => {
            const r = await App.post(`/sales/${id}/receive`,
              confirmar ? Object.assign({ confirmar: true }, corpo) : corpo);
            App.closeModal();
            App.toast(r.saldo > 0.005
              ? `Recebido — falta R$ ${App.money(r.saldo)}, que segue em Contas a receber`
              : 'Venda quitada', 'ok');
            App.route();
          };
          try {
            await lancar(false);
          } catch (e) {
            // Mesmo valor na mesma data: quase sempre é o segundo clique.
            if (!/Já existe um recebimento/.test(e.message)) throw e;
            if (await App.confirm(e.message, { html: false })) await lancar(true);
          }
        } catch (e) { App.toast(e.message, 'err'); }
      };
    },
    async desfazerRecebimento(id, index) {
      if (!await App.confirm('Estornar este recebimento? A entrada correspondente sai do caixa e o saldo volta para Contas a receber.')) return;
      try {
        await App.post(`/sales/${id}/unreceive`, { index });
        App.closeModal();
        App.toast('Recebimento estornado', 'ok');
        App.route();
      } catch (e) { App.toast(e.message, 'err'); }
    },
    duplicar(id) {
      const s = sales.find(x => x.id === id);
      App.form(`📋 Duplicar pedido nº ${s.numero}`, [
        { name: 'clienteId', label: 'Cliente do novo pedido', type: 'select', required: true, full: true,
          value: s.clienteId, options: App.clientOptions(clients, s.clienteId) },
        { name: 'dataPedido', label: 'Data do novo pedido', type: 'date', value: App.today(), required: true }
      ], async d => {
        const novo = await App.post(`/sales/${id}/duplicate`, { clienteId: Number(d.clienteId), dataPedido: d.dataPedido });
        App.closeModal();
        App.toast(`Pedido nº ${novo.numero} criado a partir do nº ${s.numero} — revise antes de produzir`, 'ok');
        location.hash = '#/sales/nova/' + novo.id;
      }, { submitLabel: 'Duplicar' });
    },
    async excluir(id) {
      const s = sales.find(x => x.id === id);
      if (!await App.confirm(
        `Excluir o pedido nº ${s.numero} (R$ ${App.money(s.valorTotal)})?<br><br>` +
        'As ordens de produção que ainda não consumiram estoque, as parcelas em aberto e os lançamentos ' +
        'de caixa desta venda são desfeitos, e as peças voltam ao estoque. Isto não pode ser desfeito.',
        { html: true })) return;
      try {
        await App.del('/sales/' + id);
        App.toast('Pedido excluído — estoque e financeiro estornados', 'ok');
        App.route();
      } catch (e) { App.toast(e.message, 'err'); }
    },
    etiqueta(id) {
      const s = sales.find(x => x.id === id);
      const c = clients.find(x => x.id === s.clienteId) || {};
      Etiqueta.abrir('sales', s, c);
    },
    wa(id) {
      const s = sales.find(x => x.id === id);
      const c = clients.find(x => x.id === s.clienteId);
      App.waShare(`Pedido nº ${s.numero} — ${(c && c.nome) || 'cliente'}`, App.waPhoneOf(c), App.waMsg.sale(s, c));
    },
    /* O andamento do pedido é o andamento da produção dele: quem marca o
       checklist na Produção não precisa vir repetir aqui. O que continua
       sendo decisão de gente é a expedição (enviado/entregue) e o
       cancelamento. */
    status(id) {
      const s = sales.find(x => x.id === id);
      const automaticos = ['nao_produzido', 'preparacao', 'usinagem', 'montagem', 'pronto'];
      const m = App.form(`Status do pedido nº ${s.numero}`, [
        { name: 'status', label: 'Novo status', type: 'select', value: s.status, full: true,
          options: ST.map(x => ({ value: x,
            label: (App.STATUS[x] || [x])[0] + (automaticos.includes(x) ? ' — automático pela produção' : '') })) },
        { name: 'data', label: 'Data (para envio)', type: 'date', value: App.today() },
        { name: 'motivo', label: 'Motivo (se for cancelar)', full: true }
      ], async d => {
        if (d.status === 'cancelado') {
          App.closeModal();
          return Sales.cancelar(id, d.motivo);
        }
        await App.post(`/sales/${id}/status`, d);
        App.closeModal(); App.route();
      });
      m.querySelector('.actions').insertAdjacentHTML('afterbegin',
        `<p class="small muted" style="margin-right:auto">O pedido acompanha sozinho a produção dos cabeçotes
         (fica no estágio do mais atrasado).<br>Marcar <b>Pronto/Enviado/Entregue</b> aqui conclui a produção junto.</p>`);
    },

    /* Cancelar um pedido não é só trocar a etiqueta: tira os boletos da
       cobrança, tira a produção da fila e devolve as peças ao estoque. */
    async cancelar(id, motivo) {
      const s = sales.find(x => x.id === id);
      if (!await App.confirm(
        `Cancelar o <b>pedido nº ${s.numero}</b>?<br><br>` +
        'O sistema vai, na mesma hora:<br>' +
        '• cancelar as <b>parcelas em aberto</b> em Contas a receber;<br>' +
        '• cancelar as <b>ordens de produção</b> deste pedido;<br>' +
        '• devolver ao <b>estoque</b> as peças de revenda.<br><br>' +
        '<span class="small">O que já foi recebido continua no caixa, e componentes já consumidos por uma ordem pronta não voltam sozinhos.</span>',
        { html: true })) return;
      try {
        const out = await App.post(`/sales/${id}/cancel`, { motivo: motivo || '' });
        App.toast('Pedido cancelado' + (out.efeitos && out.efeitos.length ? ' — ' + out.efeitos.join('; ') : ''), 'ok');
        App.route();
      } catch (e) { App.toast(e.message, 'err'); }
    },
    async result(id) {
      const r = await App.get(`/sales/${id}/result`);
      const s = sales.find(x => x.id === id);
      App.modal(`
        <h2>Resultado do pedido nº ${s.numero}</h2>
        <table style="font-size:13.5px">
          <tr><td>Valor da venda</td><td class="num">R$ ${App.money(r.bruto)}</td></tr>
          <tr><td>Taxa da operadora</td><td class="num neg">− R$ ${App.money(r.taxa)}</td></tr>
          <tr><td><b>Valor líquido</b></td><td class="num"><b>R$ ${App.money(r.liquido)}</b></td></tr>
          <tr><td>Custo-base</td><td class="num neg">− R$ ${App.money(r.custoBase)}</td></tr>
          <tr><td>Custos adicionais da venda</td><td class="num neg">− R$ ${App.money(r.custosAdicionais)}</td></tr>
          ${r.frete ? `<tr><td>Frete pago pela empresa</td><td class="num neg">− R$ ${App.money(r.frete)}</td></tr>` : ''}
          <tr><td><b>Resultado</b></td><td class="num"><b class="${r.resultado >= 0 ? 'pos' : 'neg'}">R$ ${App.money(r.resultado)}</b></td></tr>
          <tr><td>Margem</td><td class="num ${r.margem >= 0 ? 'pos' : 'neg'}"><b>${r.margem.toFixed(1)}%</b></td></tr>
        </table>
        <div class="actions"><button class="btn" onclick="App.closeModal()">Fechar</button></div>`);
    },
    /* O papel sai igual à tela: mesmos filtros, mesma ordem, e dizendo em
       cada linha se é orçamento ou pedido. */
    print() {
      const list = linhas();
      const rotulo = (FILTROS.find(f => f[0] === ui.filtro) || ['', 'Todos'])[1];
      App.print('Vendas e orçamentos — ' + rotulo,
        `<table><tr><th>Tipo</th><th>Nº</th><th>Data</th><th>Cliente</th><th>Itens</th>${
          verValores ? '<th class="num">Total</th>' : ''}<th>Situação</th><th>Vínculo</th></tr>
        ${list.map(r => `<tr>
          <td>${r._tipo === 'orcamento' ? 'Orçamento' : 'Pedido'}</td>
          <td>${r.numero}</td><td>${App.date(r._data)}</td>
          <td>${App.esc(App.clientName(r.clienteId, clients))}</td>
          <td>${(r.itens || []).map(i => i.kind === 'peca'
            ? `${i.qtd}× ${App.esc(i.produto)}`
            : `${i.qtd}× ${App.esc(i.produto)} (${App.esc(i.comando || '—')}, tucho ${App.esc(String(i.tucho || '—'))} mm)`).join('; ')}</td>
          ${verValores ? `<td class="num">R$ ${App.money(r.valorTotal)}</td>` : ''}
          <td>${r._tipo === 'orcamento'
            ? (ORC_ROTULOS[r.situacao] || [r.situacao])[0]
            : (App.STATUS[r.status] || [r.status])[0]}</td>
          <td>${r._tipo === 'orcamento'
            ? (r.pedidoNumero ? 'pedido nº ' + r.pedidoNumero : '—')
            : (r.orcamentoNumero ? 'orçamento nº ' + r.orcamentoNumero : '—')}</td>
        </tr>`).join('')}</table>`,
        `${list.filter(r => r._tipo === 'orcamento').length} orçamento(s) · ${
          list.filter(r => r._tipo === 'venda').length} pedido(s)`);
    },

    /* Quantos orçamentos viram negócio de verdade. */
    async relatorio() {
      const hoje = App.today();
      const de = hoje.slice(0, 4) + '-01-01';
      const carrega = async (d1, d2) => App.get(`/relatorios/orcamentos-venda?de=${d1}&ate=${d2}`);
      let r;
      try { r = await carrega(de, hoje); }
      catch (e) { return App.toast(e.message, 'err'); }
      const t = r.totais;
      App.modal(`
        <h2>Conversão de orçamentos</h2>
        <div class="formgrid">
          <label class="field"><span>De</span><input type="date" id="rc-de" value="${de}"></label>
          <label class="field"><span>Até</span><input type="date" id="rc-ate" value="${hoje}"></label>
          <label class="field"><span>&nbsp;</span><button class="btn" id="rc-ok">Atualizar</button></label>
        </div>
        <div id="rc-corpo">${Orc.relatorioCorpo(r)}</div>
        <div class="actions">
          <button class="btn" onclick="App.closeModal()">Fechar</button>
          <button class="btn ghost" id="rc-print">🖨️ Imprimir</button>
        </div>`, { wide: true });
      const recarrega = async () => {
        const d1 = document.getElementById('rc-de').value, d2 = document.getElementById('rc-ate').value;
        try {
          const novo = await carrega(d1, d2);
          window.Orc._rel = novo;
          document.getElementById('rc-corpo').innerHTML = Orc.relatorioCorpo(novo);
        } catch (e) { App.toast(e.message, 'err'); }
      };
      window.Orc._rel = r;
      document.getElementById('rc-ok').onclick = recarrega;
      document.getElementById('rc-print').onclick = () => Orc.imprimirRelatorio(window.Orc._rel);
    }
  };
});

/* ---- Editor de nova venda ---- */
/* O MESMO editor serve para o orçamento e para a venda oficial: os campos
   são os mesmos, o que muda é onde salva e o que acontece ao salvar.
   modo 'orcamento' grava uma proposta, que não movimenta nada;
   modo 'venda' grava o pedido oficial, com estoque, produção e financeiro. */
async function saleEditor(view, editId, modo) {
  const orcamento = modo === 'orcamento';
  const [clients, products, estoque] = await Promise.all([
    App.get('/clients'), App.get('/products'), App.get('/stockItems')]);
  estoque.sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
  const venda = editId ? await App.get((orcamento ? '/saleQuotes/' : '/sales/') + editId) : null;
  App.setTitle(
    venda ? `Editar ${orcamento ? 'orçamento' : 'pedido'} nº ${venda.numero}`
      : (orcamento ? 'Novo orçamento de venda' : 'Nova venda'),
    orcamento
      ? 'Proposta comercial: nada sai do estoque, nada vai para a produção e nada entra no financeiro até ser aprovada'
      : (venda ? 'Alterar itens ou pagamento refaz produção, estoque e financeiro — sem duplicar'
        : 'O sistema valida comando e tucho conforme o Stage e cria as ordens de produção automaticamente'));

  // itens: cabeçote {productId, comando, tucho, qtd, valorUnit}
  //        peça     {kind:'peca', stockItemId, nome, qtd, valorUnit}
  let itens = venda ? venda.itens.map(i => i.kind === 'peca'
    ? { kind: 'peca', stockItemId: i.stockItemId, nome: i.produto, qtd: i.qtd, valorUnit: i.valorUnit }
    : { productId: i.productId, comando: i.comando, tucho: i.tucho, qtd: i.qtd, valorUnit: i.valorUnit }) : [];
  let adicionais = venda ? (venda.custosAdicionais || []).slice() : [];

  const bruto = () => itens.reduce((s, i) => s + i.qtd * i.valorUnit, 0);
  /* Desconto comercial: em reais ou em percentual. A conta é a mesma do
     servidor — a tela nunca mostra um total diferente do que será gravado. */
  const descontoEm = () => {
    const tipo = (document.getElementById('v-desc-tipo') || {}).value || 'valor';
    const v = Math.max(0, Number((document.getElementById('v-desc-valor') || {}).value) || 0);
    const b = bruto();
    const em = tipo === 'percentual' ? b * Math.min(v, 100) / 100 : v;
    return Math.min(Math.round(em * 100) / 100, b);
  };
  const total = () => Math.round((bruto() - descontoEm()) * 100) / 100;

  const renderItems = () => {
    document.getElementById('v-items').innerHTML = App.table(itens.map((i, idx) => {
      if (i.kind === 'peca') return { _idx: idx, nome: i.nome, ...i };
      const p = products.find(x => x.id === i.productId);
      return { _idx: idx, nome: p.nome, stage: p.stage, ...i };
    }), [
      { h: 'Item', cell: i => `${App.esc(i.nome)}${i.kind === 'peca' ? '<div class="small muted">peça do estoque</div>' : ''}` },
      { h: 'Comando', cell: i => i.kind === 'peca' ? '—' : i.comando },
      { h: 'Tucho', cell: i => i.kind === 'peca' ? '—' : i.tucho + ' mm' },
      { h: 'Qtd', class: 'num', cell: i => i.qtd },
      { h: 'Valor unit.', class: 'num', cell: i => 'R$ ' + App.money(i.valorUnit) },
      { h: 'Total', class: 'num', cell: i => '<b>R$ ' + App.money(i.qtd * i.valorUnit) + '</b>' },
      { h: '', class: 'num', cell: i => `<button class="btn sm ghost" onclick="VE.rm(${i._idx})">✕</button>` }
    ], { emptyMsg: 'Adicione os cabeçotes do pedido' }) +
    (adicionais.length ? `<div class="small muted" style="margin-top:8px">Custos adicionais: ${adicionais.map(a =>
      `${App.esc(a.desc)} (R$ ${App.money(a.valor)})`).join(' · ')}</div>` : '') +
    (descontoEm() ? `<div style="text-align:right;padding:2px 4px" class="small muted">
      Subtotal: R$ ${App.money(bruto())} · desconto: <b class="neg">− R$ ${App.money(descontoEm())}</b></div>` : '') +
    `<div style="text-align:right;padding:10px 4px;font-size:15px">TOTAL: <b style="color:var(--accent-strong)">R$ ${App.money(total())}</b></div>`;
    updatePayment();
  };

  const updatePayment = () => {
    const forma = document.getElementById('v-forma').value;
    const isCard = forma === 'cartao' || forma === 'link';
    document.getElementById('v-card-fields').style.display = isCard ? '' : 'none';
    const taxa = isCard ? Number(document.getElementById('v-taxa').value) || 0 : 0;
    document.getElementById('v-liquido').textContent = 'R$ ' + App.money(total() - taxa);
    previewParcelas();
  };

  /* Boleto/cheque parcelado: mostra na hora quanto fica cada parcela e em
     que dia cada uma vence, a partir do 1º vencimento informado. É o mesmo
     cálculo do servidor — o que está aqui é o que vai para Contas a receber. */
  const previewParcelas = () => {
    const forma = document.getElementById('v-forma').value;
    const parcelado = document.getElementById('v-cond').value === 'parcelado';
    const n = Math.max(1, Number(document.getElementById('v-parcelas').value) || 1);
    const boleto = forma === 'boleto' || forma === 'cheque';
    const campo1 = document.getElementById('v-venc1-campo');
    const alvo = document.getElementById('v-parcelas-preview');
    campo1.style.display = parcelado && boleto ? '' : 'none';
    if (!(parcelado && boleto && n > 1)) { alvo.innerHTML = ''; return; }

    const venc1 = document.getElementById('v-venc1');
    const dataPedido = document.getElementById('v-data').value || App.today();
    const intervalo = Number(document.getElementById('v-intervalo').value) || 30;
    // Sem data informada, sugere o primeiro vencimento um intervalo à frente.
    if (!venc1.value) venc1.value = App.addDays(dataPedido, intervalo);

    const cent = Math.round(total() * 100), base = Math.floor(cent / n);
    if (!cent) { alvo.innerHTML = ''; return; }
    const linhas = [];
    for (let i = 1; i <= Math.min(n, 12); i++) {
      const v = (i === n ? cent - base * (n - 1) : base) / 100;
      linhas.push(`Parcela ${i} — R$ ${App.money(v)} — ${App.date(App.addDays(venc1.value, intervalo * (i - 1)))}`);
    }
    alvo.innerHTML = `<b>${n}x de R$ ${App.money(base / 100)}</b> — vencimentos:<br>` + linhas.join('<br>')
      + (n > 12 ? `<br><span class="muted">… e mais ${n - 12} parcela(s)</span>` : '');
  };

  view.innerHTML = `
    <div class="toolbar"><a class="btn sm ghost" href="#/sales">← Voltar</a></div>
    <div class="grid cols-2">
      <div class="card">
        <h3>${orcamento ? 'ORÇAMENTO DE VENDA' : 'PEDIDO'}</h3>
        ${orcamento ? `<p class="small muted" style="margin:-6px 0 10px">Enquanto o orçamento não for
        <b>aprovado</b>, nada acontece: nenhuma peça sai do estoque, nenhuma ordem vai para a produção
        e nenhum valor entra em Contas a receber ou no Fluxo de caixa.</p>` : ''}
        <div class="formgrid">
          <label class="field full"><span>Cliente *</span>
            <select id="v-cliente">${App.clientOptions(clients).map(o =>
              `<option value="${o.value}">${App.esc(o.label)}</option>`).join('')}</select></label>
          <label class="field"><span>${orcamento ? 'Data do orçamento' : 'Data do pedido'}</span>
            <input type="date" id="v-data" value="${App.today()}"></label>
          ${orcamento ? `<label class="field"><span>Validade (dias)</span>
            <input type="number" id="v-validade" min="0" value="${venda ? (venda.validadeDias || 15) : 15}"></label>` : ''}
          <label class="field"><span>Previsão de entrega</span><input type="date" id="v-previsao"></label>
          <label class="field full"><span>Observações</span><textarea id="v-obs"></textarea></label>
        </div>
        <h3 style="margin-top:6px">ADICIONAR CABEÇOTE</h3>
        <div class="formgrid">
          <label class="field full"><span>Produto</span>
            <select id="v-produto">${App.ativos(products).map(p => `<option value="${p.id}">${App.esc(p.nome)}</option>`).join('')}</select></label>
          <label class="field"><span>Comando</span><select id="v-comando"></select></label>
          <label class="field"><span>Tucho</span><select id="v-tucho"></select></label>
          <label class="field"><span>Quantidade</span><input type="number" id="v-qtd" value="1" min="1"></label>
          <label class="field"><span>Valor unitário (R$)</span><input type="number" step="0.01" id="v-valor"></label>
        </div>
        <div id="v-hint" class="small muted" style="margin-bottom:10px"></div>
        <button class="btn primary" onclick="VE.add()">+ Adicionar ${orcamento ? 'ao orçamento' : 'ao pedido'}</button>
        <button class="btn ghost" onclick="VE.addExtra()">+ Custo adicional (frete grátis, brinde…)</button>

        <h3 style="margin-top:16px">ADICIONAR PEÇA DO ESTOQUE</h3>
        <p class="small muted" style="margin-bottom:8px">${orcamento
          ? 'No orçamento a peça só é cotada — ela sai do estoque quando o orçamento for aprovado e virar pedido.'
          : 'Peças saem do estoque no momento da venda (cabeçotes consomem componentes quando a produção fica pronta).'}</p>
        <div class="formgrid">
          <label class="field full"><span>Peça</span>
            <select id="v-peca">${App.ativos(estoque).map(it =>
              `<option value="${it.id}" data-qtd="${it.qtd}">${App.esc(it.nome)} — ${it.qtd} em estoque</option>`).join('')}</select></label>
          <label class="field"><span>Quantidade</span><input type="number" id="v-peca-qtd" value="1" min="1"></label>
          <label class="field"><span>Valor unitário (R$)</span><input type="number" step="0.01" id="v-peca-valor"></label>
        </div>
        <div id="v-peca-hint" class="small muted" style="margin-bottom:10px"></div>
        <button class="btn" onclick="VE.addPeca()">+ Adicionar peça</button>
      </div>
      <div class="card">
        <h3>ITENS E PAGAMENTO${orcamento ? ' PRETENDIDO' : ''}</h3>
        <div id="v-items"></div>
        <hr class="sep">
        <div class="formgrid">
          <label class="field"><span>Desconto</span>
            <select id="v-desc-tipo">
              <option value="valor">em R$</option>
              <option value="percentual">em %</option>
            </select></label>
          <label class="field"><span>Valor do desconto</span>
            <input type="number" step="0.01" min="0" id="v-desc-valor" value="0"></label>
          <label class="field"><span>Forma de pagamento</span>
            <select id="v-forma">
              ${['pix', 'dinheiro', 'cartao', 'link', 'boleto', 'cheque'].map(f => `<option value="${f}">${f}</option>`).join('')}
            </select></label>
          <label class="field"><span>Condição</span>
            <select id="v-cond"><option value="avista">À vista</option><option value="parcelado">Parcelado</option></select>
            <span class="small muted">Condição de pagamento — não lança dinheiro no caixa.</span></label>
          <label class="field"><span>Nº de parcelas</span><input type="number" id="v-parcelas" value="1" min="1"></label>
          <label class="field"><span>Intervalo entre parcelas (dias)</span><input type="number" id="v-intervalo" value="30"></label>
          <label class="field" id="v-venc1-campo"><span>Vencimento da 1ª parcela</span><input type="date" id="v-venc1"></label>
        </div>
        <div id="v-parcelas-preview" class="small muted" style="margin:2px 0 8px"></div>
        <div id="v-card-fields" style="display:none">
          <div class="formgrid">
            <label class="field"><span>Taxa da operadora (R$)</span><input type="number" step="0.01" id="v-taxa" value="0"></label>
            <label class="field"><span>Data prevista de recebimento</span><input type="date" id="v-recebimento"></label>
          </div>
        </div>
        <p style="margin:8px 0">Valor líquido estimado: <b id="v-liquido">R$ 0,00</b></p>
        <p class="small muted" style="margin:-4px 0 8px">${orcamento
          ? 'Aqui fica registrada a <b>intenção</b> de pagamento combinada com o cliente. Nenhuma cobrança é criada: as parcelas em Contas a receber nascem quando o orçamento for aprovado.'
          : 'A venda registra o que o cliente <b>deve</b> pagar e vira cobrança em Contas a receber. O dinheiro só entra no <b>Fluxo de caixa</b> quando você usar <b>💵 Registrar recebimento</b> no pedido — total ou em parte.'}</p>
        <label class="field"><span>Observações de pagamento</span><input id="v-pgobs"></label>
        <div class="actions" style="border:none">
          <button class="btn primary" id="v-save" onclick="VE.save()">${venda
            ? (orcamento ? 'Salvar orçamento' : 'Salvar pedido')
            : (orcamento ? 'Salvar orçamento' : 'Registrar venda')}</button>
        </div>
      </div>
    </div>`;

  /* Comandos e tuchos saem do CADASTRO da configuração (Produtos e custos),
     não de uma tabela no código: o que a oficina cadastra lá aparece aqui. */
  const refreshCombos = () => {
    const p = products.find(x => x.id === Number(document.getElementById('v-produto').value));
    const comandos = App.comandosDo(p);
    const selC = document.getElementById('v-comando');
    selC.innerHTML = comandos.length
      ? comandos.map(c => `<option value="${c}">${c}</option>`).join('')
      : '<option value="">— sem comando cadastrado —</option>';
    refreshTuchos();
    document.getElementById('v-valor').value = p.preco || '';
  };
  const refreshTuchos = () => {
    const p = products.find(x => x.id === Number(document.getElementById('v-produto').value));
    const opts = App.tuchosDo(p);
    document.getElementById('v-tucho').innerHTML = opts.map(t => `<option value="${t}">${t} mm</option>`).join('');
    const hints = [];
    if (Number(p.stage) === 3) hints.push('Stage 3: retrabalho manual dos dutos de escape entra automaticamente na ordem de produção.');
    if (opts.includes('37')) hints.push('Tucho 37 mm inclui a abertura do alojamento dos tuchos para 37 mm.');
    if (!App.comandosDo(p).length) hints.push('Esta configuração ainda não tem comandos cadastrados — cadastre em Produtos e custos.');
    document.getElementById('v-hint').textContent = hints.join(' ');
  };
  const hintPeca = () => {
    const sel = document.getElementById('v-peca');
    const op = sel.selectedOptions[0];
    if (!op) return;
    const disp = Number(op.dataset.qtd) || 0;
    const q = Number(document.getElementById('v-peca-qtd').value) || 0;
    const el = document.getElementById('v-peca-hint');
    el.textContent = q > disp
      ? `Atenção: só há ${disp} em estoque — o saldo vai ficar negativo.`
      : `Disponível: ${disp}.`;
    el.style.color = q > disp ? 'var(--warn,#d29922)' : '';
  };
  document.getElementById('v-produto').addEventListener('change', refreshCombos);
  document.getElementById('v-comando').addEventListener('change', refreshTuchos);
  document.getElementById('v-forma').addEventListener('change', updatePayment);
  document.getElementById('v-taxa').addEventListener('input', updatePayment);
  ['v-cond', 'v-parcelas', 'v-intervalo', 'v-venc1', 'v-data'].forEach(id =>
    document.getElementById(id).addEventListener('input', previewParcelas));
  document.getElementById('v-peca').addEventListener('change', hintPeca);
  document.getElementById('v-peca-qtd').addEventListener('input', hintPeca);
  refreshCombos();
  hintPeca();
  document.getElementById('v-desc-tipo').addEventListener('change', renderItems);
  document.getElementById('v-desc-valor').addEventListener('input', renderItems);

  // Edição: traz os dados da venda para os campos.
  if (venda) {
    document.getElementById('v-cliente').value = venda.clienteId;
    document.getElementById('v-data').value = (orcamento ? venda.dataOrcamento : venda.dataPedido) || App.today();
    const d = venda.desconto || {};
    document.getElementById('v-desc-tipo').value = d.tipo === 'percentual' ? 'percentual' : 'valor';
    document.getElementById('v-desc-valor').value = Number(d.valor) || 0;
    document.getElementById('v-previsao').value = venda.previsaoEntrega || '';
    document.getElementById('v-obs').value = venda.observacoes || '';
    const pg = venda.pagamento || {};
    document.getElementById('v-forma').value = pg.forma || 'pix';
    document.getElementById('v-cond').value = pg.condicao || 'avista';
    document.getElementById('v-parcelas').value = pg.parcelas || 1;
    document.getElementById('v-intervalo').value = pg.intervaloDias || 30;
    document.getElementById('v-venc1').value = pg.primeiroVencimento || '';
    document.getElementById('v-taxa').value = pg.taxa || 0;
    document.getElementById('v-recebimento').value = pg.dataPrevRecebimento || '';
    document.getElementById('v-pgobs').value = pg.obs || '';
    document.querySelector('#v-save').textContent = 'Salvar alterações';
  }
  renderItems();

  window.VE = {
    add() {
      const productId = Number(document.getElementById('v-produto').value);
      itens.push({
        productId,
        comando: document.getElementById('v-comando').value,
        tucho: document.getElementById('v-tucho').value,
        qtd: Math.max(1, Number(document.getElementById('v-qtd').value) || 1),
        valorUnit: Number(document.getElementById('v-valor').value) || 0
      });
      renderItems();
    },
    addExtra() {
      App.form('Custo adicional da venda', [
        { name: 'desc', label: 'Descrição (ex.: frete grátis, brinde adicional)', required: true, full: true },
        { name: 'valor', label: 'Valor (R$)', type: 'number', step: '0.01', required: true, full: true }
      ], async d => {
        adicionais.push({ desc: d.desc, valor: Number(d.valor) });
        App.closeModal(); renderItems();
      });
    },
    addPeca() {
      const sel = document.getElementById('v-peca');
      const op = sel.selectedOptions[0];
      if (!op) return App.toast('Nenhuma peça cadastrada no estoque', 'err');
      itens.push({
        kind: 'peca',
        stockItemId: Number(sel.value),
        nome: op.textContent.split(' — ')[0],
        qtd: Math.max(1, Number(document.getElementById('v-peca-qtd').value) || 1),
        valorUnit: Number(document.getElementById('v-peca-valor').value) || 0
      });
      renderItems();
    },
    rm(i) { itens.splice(i, 1); renderItems(); },
    async save() {
      const clienteId = Number(document.getElementById('v-cliente').value);
      if (!clienteId) return App.toast('Selecione o cliente', 'err');
      if (!itens.length) return App.toast(orcamento
        ? 'Adicione ao menos um cabeçote ou peça ao orçamento' : 'Adicione ao menos um cabeçote ou peça', 'err');
      const forma = document.getElementById('v-forma').value;
      const data = document.getElementById('v-data').value;
      const body = {
        clienteId,
        dataPedido: data,
        dataOrcamento: data,
        validadeDias: orcamento ? Number(document.getElementById('v-validade').value) || 0 : undefined,
        previsaoEntrega: document.getElementById('v-previsao').value,
        observacoes: document.getElementById('v-obs').value,
        itens,
        desconto: {
          tipo: document.getElementById('v-desc-tipo').value,
          valor: Number(document.getElementById('v-desc-valor').value) || 0
        },
        custosAdicionais: adicionais,
        pagamento: {
          forma,
          condicao: document.getElementById('v-cond').value,
          parcelas: Number(document.getElementById('v-parcelas').value) || 1,
          intervaloDias: Number(document.getElementById('v-intervalo').value) || 30,
          primeiroVencimento: document.getElementById('v-venc1').value,
          taxa: Number(document.getElementById('v-taxa').value) || 0,
          dataPrevRecebimento: document.getElementById('v-recebimento').value,
          obs: document.getElementById('v-pgobs').value
        }
      };
      try {
        if (orcamento) {
          const o = editId
            ? await App.put('/saleQuotes/' + editId, body)
            : await App.post('/saleQuotes', body);
          App.toast(editId
            ? `Orçamento nº ${o.numero} atualizado (versão ${o.versao}) — nada foi movimentado`
            : `Orçamento nº ${o.numero} criado — proposta salva, sem movimentar estoque nem financeiro`, 'ok');
          location.hash = '#/sales';
        } else if (editId) {
          const sale = await App.put('/sales/' + editId, body);
          App.toast(`Pedido nº ${sale.numero} atualizado — produção, estoque e financeiro acompanharam`, 'ok');
          location.hash = '#/sales';
        } else {
          const sale = await App.post('/sales', body);
          App.toast(`Pedido nº ${sale.numero} registrado — ordens de produção e financeiro gerados automaticamente`, 'ok');
          location.hash = itens.some(i => i.kind !== 'peca') ? '#/production' : '#/sales';
        }
      } catch (e) { App.toast(e.message, 'err'); }
    }
  };
}

/* ================= PRODUÇÃO ================= */
App.registerView('production', async (view) => {
  App.setTitle('Produção', 'A lista de trabalho da equipe: cabeçotes vendidos e serviços de clientes, com checklist por etapa');
  const dados = await App.get('/producao');
  const pos = dados.ordens || [];
  const ETAPAS = dados.etapas || [];
  const ST = ['nao_produzido', 'preparacao', 'usinagem', 'montagem', 'pronto'];
  const users = App.meta.users.filter(u => u.active);

  /* Os filtros (e as etapas que a pessoa abriu) vivem fora da view: a
     atualização ao vivo refaz a tela a cada gravação, e sem isto concluir
     uma etapa jogaria a pessoa de volta para o filtro padrão. */
  const ui = App.telaEstado('production', { status: '', tipo: '', etapa: '', abertas: new Set() });

  /* ------------------------------------------------------------------
     "Em aberto" NÃO é uma lista de status. É a resposta para uma
     pergunta: ainda falta a produção fazer algo nesta ordem?

     E essa resposta vem do checklist, que é onde o trabalho acontece de
     verdade — o status da ordem é derivado dele, não digitado. Por isso
     qualquer etapa ou status que venha a existir no futuro e represente
     trabalho pendente já entra aqui sozinho: basta ter item sem marcar.

     Encerrado é só o que não pede mais nada da produção:
       - cancelado (decisão de gente, nunca do checklist);
       - checklist inteiro concluído.
     Na dúvida, fica em aberto — é o lado seguro para uma lista de
     trabalho: pior do que uma linha sobrando é uma linha faltando.     */
  const ENCERRADAS = ['cancelado'];
  /* Pedido ou OS cancelado não é trabalho pendente, mesmo que a ordem de
     produção tenha ficado para trás sem ser cancelada junto. */
  const origemCancelada = (p) => {
    const st = p.origem === 'servico' ? p.osStatus : p.vendaStatus;
    return st === 'cancelado' || st === 'cancelada';
  };
  const faltaFazer = (p) => {
    if (ENCERRADAS.includes(p.status) || origemCancelada(p)) return false;
    // Ordem sem checklist ainda não foi desdobrada em etapas: está aberta.
    if (!p.totalItens) return true;
    return (p.feitos || 0) < p.totalItens;
  };

  const emAberto = pos.filter(faltaFazer);
  const deVenda = emAberto.filter(p => p.origem !== 'servico');
  const deServico = emAberto.filter(p => p.origem === 'servico');

  view.innerHTML = `
    <div class="grid cols-4">
      <div class="card kpi ${emAberto.length ? 'k-warn' : 'k-ok'}"><div class="label">Todos em aberto</div><div class="value">${emAberto.length}</div>
        <div class="hint">tudo que ainda pede trabalho</div></div>
      <div class="card kpi"><div class="label">Cabeçotes vendidos</div><div class="value">${deVenda.length}</div>
        <div class="hint">em aberto</div></div>
      <div class="card kpi"><div class="label">Serviços de clientes</div><div class="value">${deServico.length}</div>
        <div class="hint">em aberto</div></div>
      <div class="card kpi k-ok"><div class="label">Prontos p/ envio</div><div class="value">${pos.filter(p => p.status === 'pronto').length}</div></div>
    </div>
    <div class="toolbar" style="margin-top:14px">
      <select id="pf-tipo" style="max-width:210px">
        ${[['', 'Vendas e serviços'], ['venda', 'Só cabeçotes vendidos'], ['servico', 'Só serviços de clientes']]
          .map(([v, l]) => `<option value="${v}" ${ui.tipo === v ? 'selected' : ''}>${l}</option>`).join('')}
      </select>
      <select id="pf" style="max-width:230px" title="“Todos em aberto” reúne tudo que ainda falta produzir ou finalizar">
        <option value="aberto" ${ui.status === 'aberto' ? 'selected' : ''}>⏳ Todos em aberto — tudo que falta</option>
        <option value="" ${ui.status === '' ? 'selected' : ''}>Todos os status</option>
        ${ST.map(s => `<option value="${s}" ${ui.status === s ? 'selected' : ''}>${(App.STATUS[s] || [s])[0]}</option>`).join('')}</select>
      <select id="pf-etapa" style="max-width:210px">
        <option value="" ${ui.etapa === '' ? 'selected' : ''}>Todas as etapas</option>
        ${ETAPAS.map(e => `<option value="${e.chave}" ${ui.etapa === e.chave ? 'selected' : ''}>${App.esc(e.nome)}</option>`).join('')}</select>
      <div class="spacer"></div>
      <span class="muted small" id="pf-contagem"></span>
      <button class="btn" onclick="PO.print()"
        title="Imprime exatamente o que está filtrado na tela — sem valores, para entregar à equipe">🖨️ Imprimir lista</button>
    </div>
    <div id="po-list"></div>`;

  /* Barra de etapas: mostra de relance onde a ordem está e deixa concluir
     a etapa inteira de uma vez, que é como a equipe realmente trabalha. */
  const barraEtapas = (p) => `
    <div class="etapas">
      ${(p.etapas || []).filter(e => e.total).map(e => `
        <button class="etapa ${e.situacao}${e.chave === p.etapaAtual ? ' atual' : ''}"
          title="${e.feitos}/${e.total} item(ns) — clique para ${e.situacao === 'concluida' ? 'reabrir' : 'concluir'} a etapa"
          onclick="PO.etapa(${p.id}, '${e.chave}', ${e.situacao !== 'concluida'})">
          <span class="etapa-nome">${App.esc(e.nome)}</span>
          <span class="etapa-qtd">${e.feitos}/${e.total}</span>
        </button>`).join('<span class="etapa-seta">›</span>')}
    </div>`;

  const cabecalhoVenda = (p) => `
    <b>OP #${p.id}</b> <span class="badge accent">Cabeçote vendido</span>
    <div style="margin-top:3px">${App.esc(p.produto)} · <b>${App.rotuloStage(p)}</b> ·
      ${p.tipo === 'crossflow' ? 'fluxo cruzado' : 'unilateral'} ·
      comando <b>${App.esc(p.comando || '—')}</b> · tucho <b>${App.esc(String(p.tucho || '—'))} mm</b></div>
    <div class="small muted">Pedido nº ${p.pedidoNumero} · ${App.esc(p.clienteNome || '—')}
      ${p.qtdPedido > 1 ? ` · 1 de ${p.qtdPedido} do pedido` : ''}
      · previsão ${App.date(p.previsaoEntrega)} · resp.: ${App.esc(App.userName(p.responsavelId))}</div>
    ${p.observacoes ? `<div class="small" style="margin-top:4px"><b>Obs.:</b> ${App.esc(p.observacoes)}</div>` : ''}`;

  const cabecalhoServico = (p) => `
    <b>OP #${p.id}</b> <span class="badge info">Serviço de cliente</span>
    ${p.osStatus ? App.badge(p.osStatus) : ''}
    <div style="margin-top:3px">${App.esc(p.produto || 'Cabeçote de cliente')}${p.identificacao ? ` · <span class="mono">${App.esc(p.identificacao)}</span>` : ''}</div>
    <div class="small muted">OS nº ${p.osNumero} · ${App.esc(p.clienteNome || '—')}
      · prazo ${App.date(p.previsaoEntrega)} · resp.: ${App.esc(App.userName(p.responsavelId))}</div>
    ${p.problema ? `<div class="small" style="margin-top:4px"><b>Problema:</b> ${App.esc(p.problema)}</div>` : ''}
    ${p.descricaoServico ? `<div class="small"><b>Serviço:</b> ${App.esc(p.descricaoServico)}</div>` : ''}
    ${(p.operacoes || []).length ? `<div class="small" style="margin-top:4px"><b>Operações:</b> ${
      p.operacoes.map(o => App.esc((o.qtd > 1 ? o.qtd + '× ' : '') + o.nome)).join(' · ')}</div>` : ''}
    ${(p.pecas || []).length ? `<div class="small"><b>Peças necessárias:</b> ${p.pecas.map(x => App.esc(x)).join(' · ')}</div>` : ''}
    ${p.observacoes ? `<div class="small" style="margin-top:4px"><b>Obs.:</b> ${App.esc(p.observacoes)}</div>` : ''}`;

  /* A etapa atual já vem aberta; as que o usuário abrir à mão continuam
     abertas quando a tela se redesenha (inclusive no redesenho automático). */
  const abertas = ui.abertas;

  /* Um lugar só decide o que está na tela — e é o mesmo que a impressão
     usa, para o papel nunca sair diferente do que a pessoa está vendo. */
  const selecionadas = () => pos.filter(p =>
    (ui.status === 'aberto'
      ? faltaFazer(p)
      : p.status !== 'cancelado' && (!ui.status || p.status === ui.status)) &&
    (!ui.tipo || (ui.tipo === 'servico' ? p.origem === 'servico' : p.origem !== 'servico')) &&
    (!ui.etapa || p.etapaAtual === ui.etapa));

  const rotuloFiltro = () => ui.status === 'aberto' ? 'Todos em aberto'
    : ui.status ? (App.STATUS[ui.status] || [ui.status])[0] : '';

  /* Nome da etapa em que a ordem está agora — é o que a bancada quer ler
     no papel, mais do que o status. */
  const etapaNome = (p) => {
    if (!p.etapaAtual || p.etapaAtual === 'concluido') return '';
    const e = (p.etapas || []).find(x => x.chave === p.etapaAtual);
    return e ? e.nome : '';
  };

  const render = () => {
    const list = selecionadas();
    document.getElementById('pf-contagem').textContent =
      `${list.length} ordem(ns)` + (ui.status === 'aberto' ? ' em aberto' : '');
    document.getElementById('po-list').innerHTML = list.length ? list.map(p => `
      <div class="card" style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;align-items:flex-start">
          <div>${p.origem === 'servico' ? cabecalhoServico(p) : cabecalhoVenda(p)}</div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <span class="small muted" title="Itens concluídos no checklist">${p.feitos}/${p.totalItens}</span>
            <span title="O status acompanha o checklist — marque as etapas abaixo">${App.badge(p.status)}</span>
            <select onchange="PO.setResp(${p.id}, this.value)" style="width:auto" title="Responsável">
              <option value="">— responsável —</option>
              ${users.map(u => `<option value="${u.id}" ${p.responsavelId === u.id ? 'selected' : ''}>${App.esc(u.name)}</option>`).join('')}
            </select>
            ${p.origem === 'servico'
              ? `<button class="btn sm ghost" onclick="location.hash='#/os'" title="Abrir a ordem de serviço">Ver OS</button>`
              : `<button class="btn sm ghost" onclick="location.hash='#/sales'" title="Abrir o pedido">Ver pedido</button>`}
            <button class="btn sm" onclick="PO.printOne(${p.id})" title="Imprimir esta ordem">🖨️</button>
            <button class="btn sm ghost" onclick="PO.cancelar(${p.id})" title="Cancelar a ordem de produção">🚫</button>
          </div>
        </div>
        ${barraEtapas(p)}
        ${(p.etapas || []).filter(e => e.total).map(e => `
          <details class="etapa-bloco" ${e.chave === p.etapaAtual || abertas.has(p.id + ':' + e.chave) ? 'open' : ''}
            data-op="${p.id}" data-etapa="${e.chave}">
            <summary class="etapa-titulo">
              <span>${App.esc(e.nome)} <span class="muted">${e.feitos}/${e.total}</span></span>
              <span class="btn sm ghost" onclick="event.preventDefault();event.stopPropagation();PO.etapa(${p.id}, '${e.chave}', ${e.situacao !== 'concluida'})">
                ${e.situacao === 'concluida' ? 'Reabrir etapa' : 'Concluir etapa'}</span>
            </summary>
            <ul class="checklist">
              ${p.checklist.map((c, i) => [c, i]).filter(([c]) => c.etapa === e.chave).map(([c, i]) => `
                <li class="${c.done ? 'done' : ''}">
                  <input type="checkbox" ${c.done ? 'checked' : ''} onchange="PO.check(${p.id}, ${i}, this.checked)">
                  <span>${App.esc(c.item)}</span>
                  ${c.done && c.por ? `<span class="small muted">(${App.esc(c.por)})</span>` : ''}
                </li>`).join('')}
            </ul>
          </details>`).join('')}
      </div>`).join('')
      : ui.status === 'aberto' && !ui.tipo && !ui.etapa && pos.length
        ? `<div class="card"><div class="empty">Nada em aberto — a produção está em dia. 🎉<br>
           <span class="small">Para rever o que já ficou pronto, troque o filtro para “Todos os status”.</span></div></div>`
        : `<div class="card"><div class="empty">Nenhuma ordem de produção nesta situação.
         ${pos.length ? 'Experimente limpar os filtros acima.' :
           'Vendas de cabeçote e orçamentos aprovados entram aqui automaticamente. Se faltar algo antigo, use <b>Reconciliar</b> em Administração.'}</div></div>`;
  };
  render();
  document.getElementById('po-list').addEventListener('toggle', e => {
    const d = e.target;
    if (!d.matches || !d.matches('details.etapa-bloco')) return;
    const chave = d.dataset.op + ':' + d.dataset.etapa;
    if (d.open) abertas.add(chave); else abertas.delete(chave);
  }, true);
  document.getElementById('pf').addEventListener('change', e => { ui.status = e.target.value; render(); });
  document.getElementById('pf-tipo').addEventListener('change', e => { ui.tipo = e.target.value; render(); });
  document.getElementById('pf-etapa').addEventListener('change', e => { ui.etapa = e.target.value; render(); });

  /* Atualiza a ordem na tela com o que o servidor devolveu (etapas e status
     vêm calculados de lá, então a tela nunca inventa andamento). */
  const aplicar = (novo) => {
    const i = pos.findIndex(x => x.id === novo.id);
    if (i >= 0) pos[i] = Object.assign({}, pos[i], novo);
    render();
  };

  window.PO = {
    async check(id, i, done) {
      const antes = (pos.find(x => x.id === id) || {}).status;
      try {
        const novo = await App.post(`/productionOrders/${id}/check`, { index: i, done });
        aplicar(novo);
        if (novo.status === 'pronto' && antes !== 'pronto') {
          App.toast((novo.origem === 'servico'
            ? 'Serviço concluído — pronto para devolver ao cliente'
            : 'Produção concluída — componentes baixados do estoque próprio')
            + (ui.status === 'aberto' ? ' · saiu de “Todos em aberto”' : ''), 'ok');
        }
      } catch (e) { App.toast(e.message, 'err'); }
    },
    async etapa(id, etapa, done) {
      const antes = (pos.find(x => x.id === id) || {}).status;
      try {
        const novo = await App.post(`/productionOrders/${id}/etapa`, { etapa, done });
        aplicar(novo);
        if (novo.status === 'pronto' && antes !== 'pronto') {
          App.toast((novo.origem === 'servico'
            ? 'Serviço concluído — pronto para devolver ao cliente'
            : 'Produção concluída — componentes baixados do estoque próprio')
            + (ui.status === 'aberto' ? ' · saiu de “Todos em aberto”' : ''), 'ok');
        }
        // Reabrir uma etapa devolve a ordem para "Todos em aberto" na hora.
        if (!done && ui.status === 'aberto' && antes === 'pronto') {
          App.toast('Etapa reaberta — a ordem voltou para “Todos em aberto”', 'ok');
        }
      } catch (e) { App.toast(e.message, 'err'); }
    },
    async cancelar(id) {
      const p = pos.find(x => x.id === id);
      if (!await App.confirm(`Cancelar a ordem de produção #${id}?<br><br>
        <span class="small">Ela sai da lista de trabalho da equipe. O ${p.origem === 'servico' ? 'serviço' : 'pedido'} continua como está.</span>`,
        { html: true })) return;
      try {
        await App.post(`/productionOrders/${id}/status`, { status: 'cancelado' });
        App.toast('Ordem cancelada', 'ok');
        App.route();
      } catch (e) { App.toast(e.message, 'err'); }
    },
    async setResp(id, v) {
      try { aplicar(await App.post(`/productionOrders/${id}/status`, { responsavelId: v ? Number(v) : null })); }
      catch (e) { App.toast(e.message, 'err'); }
    },
    printOne(id) {
      const p = pos.find(x => x.id === id);
      const ficha = p.origem === 'servico'
        ? `<table><tr><th>OS</th><th>Cliente</th><th>Cabeçote</th><th>Identificação</th><th>Prazo</th></tr>
           <tr><td>nº ${p.osNumero}</td><td>${App.esc(p.clienteNome || '')}</td><td>${App.esc(p.produto || '')}</td>
           <td>${App.esc(p.identificacao || '—')}</td><td>${App.date(p.previsaoEntrega)}</td></tr></table>
           ${p.problema ? `<p><b>Problema:</b> ${App.esc(p.problema)}</p>` : ''}
           ${(p.operacoes || []).length ? `<p><b>Operações:</b> ${p.operacoes.map(o => App.esc((o.qtd > 1 ? o.qtd + '× ' : '') + o.nome)).join(' · ')}</p>` : ''}
           ${(p.pecas || []).length ? `<p><b>Peças:</b> ${p.pecas.map(x => App.esc(x)).join(' · ')}</p>` : ''}`
        : `<table><tr><th>Produto</th><th>Stage</th><th>Comando</th><th>Tucho</th><th>Pedido</th><th>Cliente</th><th>Previsão</th></tr>
           <tr><td>${App.esc(p.produto)}</td><td>${p.stage}</td><td>${App.esc(p.comando || '')}</td><td>${App.esc(String(p.tucho || ''))} mm</td>
           <td>nº ${p.pedidoNumero}</td><td>${App.esc(p.clienteNome || '')}</td><td>${App.date(p.previsaoEntrega)}</td></tr></table>`;
      App.print(`Ordem de Produção #${p.id}`,
        ficha +
        (p.observacoes ? `<p><b>Observações:</b> ${App.esc(p.observacoes)}</p>` : '') +
        (p.etapas || []).filter(e => e.total).map(e => `
          <h3>${App.esc(e.nome)}</h3>
          <ul class="check">${p.checklist.filter(c => c.etapa === e.chave).map(c => `<li>${App.esc(c.item)}</li>`).join('')}</ul>`).join('') +
        '<div class="sig"><div>Executado por</div><div>Controle de qualidade</div></div>',
        `Responsável: ${App.userName(p.responsavelId)}`);
    },
    /* Impressão para a equipe: uma tabela compacta de "o que precisa ser
       feito", nos moldes da impressão da Ordem de Serviço. O checklist por
       etapa fica só na tela — no papel ele ocupava páginas e atrapalhava.
       Nada de dinheiro aqui: a produção não vê preço, custo nem pagamento. */
    print() {
      const list = selecionadas();

      /* Cada cabeçote vendido gera uma ordem por unidade. Juntar as
         idênticas é o que faz a coluna "Qtd" dizer alguma coisa: em vez de
         três linhas iguais de 1, uma linha de 3. Etapa e progresso entram
         na chave: duas unidades em pontos diferentes não são a mesma linha. */
      const grupos = [];
      const porChave = new Map();
      for (const p of list) {
        const chave = [p.origem, p.pedidoNumero, p.osNumero, p.produto, p.tipo, p.stage,
          p.comando, p.tucho, p.identificacao, p.status, p.etapaAtual,
          p.feitos + '/' + p.totalItens, p.previsaoEntrega,
          (p.operacoes || []).map(o => o.qtd + '×' + o.nome).join('|')].join('§');
        const achado = porChave.get(chave);
        if (achado) { achado.qtd++; achado.ids.push(p.id); }
        else { const g = { p, qtd: 1, ids: [p.id] }; porChave.set(chave, g); grupos.push(g); }
      }

      const linha = (g) => {
        const p = g.p;
        const servico = p.origem === 'servico';
        const origem = servico ? `OS nº ${App.esc(String(p.osNumero || '—'))}`
                               : `Pedido nº ${App.esc(String(p.pedidoNumero || '—'))}`;
        /* Nas vendas o nome do produto do catálogo é sempre "Cabeçote
           Unilateral — Stage 1" e afins, ou seja, repetiria tipo e stage.
           Só entra como segunda linha se disser algo diferente. */
        const tipoStage = `${p.tipo === 'crossflow' ? 'Fluxo cruzado' : 'Unilateral'} · ${App.rotuloStage(p)}`;
        const normaliza = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const cabecote = servico
          ? App.esc(p.produto || 'Cabeçote de cliente') +
            (p.identificacao ? `<div class="sub">${App.esc(p.identificacao)}</div>` : '')
          : App.esc(tipoStage) +
            (p.produto && !normaliza(p.produto).includes(normaliza(tipoStage))
              ? `<div class="sub">${App.esc(p.produto)}</div>` : '');
        /* O "o que fazer" resumido: a configuração no caso do cabeçote
           vendido, as operações no caso do serviço de cliente. */
        const fazer = servico
          ? ((p.operacoes || []).length
              ? p.operacoes.map(o => App.esc((o.qtd > 1 ? o.qtd + '× ' : '') + o.nome)).join(' · ')
              : App.esc(p.descricaoServico || p.problema || '—')) +
            ((p.pecas || []).length ? `<div class="sub">Peças: ${p.pecas.map(x => App.esc(x)).join(' · ')}</div>` : '')
          : `Comando <b>${App.esc(p.comando || '—')}</b> · tucho <b>${App.esc(String(p.tucho || '—'))} mm</b>`;
        return `<tr>
          <td>${origem}<div class="sub">${g.ids.map(i => 'OP #' + i).join(', ')}</div></td>
          <td>${App.esc(p.clienteNome || '—')}</td>
          <td>${cabecote}</td>
          <td>${fazer}</td>
          <td class="num">${g.qtd}</td>
          <td>${App.date(p.previsaoEntrega)}</td>
          <td>${(App.STATUS[p.status] || [p.status])[0]}
            ${etapaNome(p) ? `<div class="sub">etapa: ${App.esc(etapaNome(p))}</div>` : ''}
            ${p.totalItens ? `<div class="sub">${p.feitos}/${p.totalItens} itens</div>` : ''}</td>
        </tr>`;
      };

      const totalCabecotes = grupos.reduce((s, g) => s + g.qtd, 0);
      const TIPO_ROTULO = { venda: 'só cabeçotes vendidos', servico: 'só serviços de clientes' };
      const recorte = [rotuloFiltro(), TIPO_ROTULO[ui.tipo],
        ui.etapa ? 'etapa: ' + ((ETAPAS.find(e => e.chave === ui.etapa) || {}).nome || ui.etapa) : '']
        .filter(Boolean).join(' · ');
      App.print('Produção — lista de trabalho' + (recorte ? ' — ' + recorte : ''),
        (grupos.length
          ? `<table>
              <tr><th>Origem</th><th>Cliente</th><th>Cabeçote / peça</th><th>O que fazer</th>
                  <th class="num">Qtd</th><th>Previsão</th><th>Etapa / status</th></tr>
              ${grupos.map(linha).join('')}
             </table>`
          : '<p>Nenhuma ordem de produção nesta situação.</p>') +
        '<div class="sig"><div>Executado por</div><div>Conferido por</div></div>',
        `${totalCabecotes} cabeçote(s) em ${grupos.length} linha(s)` +
        (ui.status === 'aberto' ? ' — tudo que ainda falta produzir ou finalizar' : ''));
    }
  };
});
