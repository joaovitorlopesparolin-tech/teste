/* Financeiro: contas a pagar (agenda de sextas), recorrentes, contas a receber,
   fluxo de caixa, projeção e DRE */
'use strict';

const CATS_PAG = [
  ['agua', 'Água'], ['energia', 'Energia'], ['telefone', 'Telefone'], ['internet', 'Internet'],
  ['aluguel', 'Aluguel'], ['componentes', 'Fornecedores / componentes'], ['materiais', 'Materiais'],
  ['mao_obra_direta', 'Mão de obra direta'], ['terceirizacao', 'Terceirização'],
  ['custo_producao', 'Outros custos de produção'], ['pos_operacao', 'Pós-operação'],
  ['frete_venda', 'Frete de venda / Logística'], ['outros', 'Outros'],
  ['consorcio', 'Consórcio (veículos da empresa)'], ['impostos', 'Impostos'], ['salarios', 'Salários'],
  ['beneficios', 'Benefícios'], ['manutencao', 'Manutenção'], ['sistemas', 'Sistemas'],
  ['marketing', 'Marketing'], ['tarifas', 'Tarifas bancárias'], ['juros', 'Juros'],
  ['despesa_operacional', 'Outras despesas operacionais'], ['despesa_financeira', 'Outras despesas financeiras']
];

/* De onde vêm os lançamentos que o sistema cria sozinho no caixa — usado
   para dizer à pessoa onde desfazer, em vez de só bloquear a ação. */
const CF_ORIGEM = {
  payables: 'Contas a pagar', receivables: 'Contas a receber', sales: 'Vendas',
  serviceOrders: 'Ordens de serviço', hrPayments: 'RH', freights: 'Fretes',
  purchases: 'Compras'
};

/* ================= CONTAS A PAGAR ================= */
App.registerView('payables', async (view) => {
  App.setTitle('Contas a pagar', 'Agenda de pagamentos às sextas-feiras + pagamentos imediatos');
  const [payables, agenda, recurring, suppliers] = await Promise.all([
    App.get('/payables'), App.get('/payables/agenda'), App.get('/recurring'), App.get('/suppliers')]);

  const openTotal = payables.filter(p => p.status !== 'pago').reduce((s, p) => s + p.valor, 0);
  const overdue = payables.filter(p => p.status === 'vencida');
  /* Corrigir conta já lançada é função da Direção; quem não tem a permissão
     continua vendo tudo e pagando normalmente. */
  const podeEditar = App.can('payables_edit');
  const dow = d => ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][new Date(d + 'T12:00:00').getDay()];

  /* Ordem escolhida pelos cabeçalhos. Vale para todos os grupos da agenda
     ao mesmo tempo: ordenar só um deles confundiria mais que ajudaria. */
  let ordemAgenda = { chave: 'Vencimento', desc: false };
  let ordemPagas = { chave: 'Pago em', desc: true };

  const colsAgenda = () => [
    { h: 'Conta', sort: p => p.descricao || '', sortDesc: false,
      cell: p => `${App.esc(p.descricao)}${p.tipoPagamento === 'imediato' ? ' <span class="badge info">imediato</span>' : ''}` },
    { h: 'Categoria', cell: p => `<span class="small muted">${(CATS_PAG.find(c => c[0] === p.categoria) || [null, p.categoria])[1]}</span>` },
    { h: 'Vencimento', sort: p => p.vencimento || '', sortDesc: false, cell: p => App.date(p.vencimento) },
    { h: 'Documento', cell: p => App.esc(p.documento || '—') },
    { h: 'Valor', class: 'num', sort: p => Number(p.valor) || 0, cell: p => App.moneyHtml(p.valor) },
    { h: 'Status', cell: p => App.badge(p.status) },
    { h: '', class: 'num', cell: p => `<button class="btn sm primary" onclick="Pay.pay(${p.id})">✓ Pagar</button>
      ${podeEditar ? `
        <button class="btn sm ghost" onclick="Pay.edit(${p.id})" title="Editar esta conta">✏️ Editar</button>
        <button class="btn sm ghost" onclick="Pay.excluir(${p.id})" title="Excluir esta conta">🗑️ Excluir</button>` : ''}` }
  ];

  const colsPagas = () => [
    { h: 'Conta', sort: p => p.descricao || '', sortDesc: false, cell: p => App.esc(p.descricao) },
    { h: 'Pago em', sort: p => p.dataPagamento || '', cell: p => App.date(p.dataPagamento) },
    { h: 'Valor', class: 'num', sort: p => Number(p.valor) || 0, cell: p => App.moneyHtml(p.valor) },
    { h: 'Status', cell: p => App.badge('pago') },
    ...(podeEditar ? [{ h: '', class: 'num', cell: p => `
      <button class="btn sm ghost" onclick="Pay.unpay(${p.id})" title="Desfazer o pagamento — a conta volta para a agenda e a saída sai do caixa">↩ Desfazer pagamento</button>
      <button class="btn sm ghost" onclick="Pay.edit(${p.id})" title="Editar esta conta">✏️ Editar</button>
      <button class="btn sm ghost" onclick="Pay.excluir(${p.id})" title="Excluir esta conta">🗑️ Excluir</button>` }] : [])
  ];

  const renderPay = () => {
    view.innerHTML = `
    <div class="toolbar">
      <button class="btn primary" onclick="Pay.create()">+ Nova conta</button>
      <button class="btn" onclick="Pay.recurringList()">↻ Contas recorrentes (${recurring.filter(r => r.ativo).length})</button>
      <div class="spacer"></div>
      <span class="badge ${overdue.length ? 'danger' : 'ok'}">${overdue.length} vencida(s)</span>
      <span class="badge">Total em aberto: R$ ${App.money(openTotal)}</span>
      <button class="btn" onclick="Pay.print()">🖨️ Imprimir agenda</button>
    </div>

    <div class="section-title">AGENDA DE PAGAMENTOS (agrupada por data programada)
      <span class="small muted">— clique no cabeçalho para ordenar</span></div>
    ${agenda.length ? agenda.map(g => `
      <div class="card" style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <b>${App.date(g.data)} <span class="muted small">(${dow(g.data)})</span>
          ${dow(g.data) === 'sex' ? '<span class="badge accent">dia de pagamento</span>' : ''}
          ${g.data < App.today() ? '<span class="badge danger">atrasado</span>' : ''}</b>
          <b>R$ ${App.money(g.total)}</b>
        </div>
        ${App.table(g.contas, colsAgenda(), {
          sortState: ordemAgenda,
          onSort: (o) => { ordemAgenda = o; renderPay(); }
        })}
      </div>`).join('') : '<div class="card"><div class="empty">Nenhuma conta em aberto 🎉</div></div>'}

    <div class="section-title muted">Pagas recentemente</div>
    ${App.table(payables.filter(p => p.status === 'pago').slice(-15).reverse(), colsPagas(), {
      emptyMsg: 'Nenhum pagamento ainda',
      sortState: ordemPagas,
      onSort: (o) => { ordemPagas = o; renderPay(); }
    })}`;
  };
  renderPay();

  window.Pay = {
    create(prefill) {
      const p = prefill || {};
      App.form('Nova conta a pagar', [
        { name: 'descricao', label: 'Descrição', value: p.descricao, required: true, full: true },
        { name: 'categoria', label: 'Categoria', type: 'select', value: p.categoria || 'despesa_operacional',
          options: CATS_PAG.map(([v, l]) => ({ value: v, label: l })) },
        { name: 'recurringId', label: 'Conta recorrente (dá baixa na pendência do mês)', type: 'select', value: p.recurringId || '',
          options: [{ value: '', label: '— não é recorrente —' }].concat(recurring.filter(r => r.ativo).map(r => ({ value: r.id, label: r.nome }))) },
        { name: 'fornecedorId', label: 'Fornecedor (opcional)', type: 'select', value: '',
          options: [{ value: '', label: '—' }].concat(App.ativos(suppliers, p.fornecedorId).map(s => ({ value: s.id, label: s.nome + (s.ativo === false ? ' (inativo)' : '') }))) },
        { name: 'valor', label: 'Valor (R$)', type: 'number', step: '0.01', required: true },
        { name: 'vencimento', label: 'Vencimento', type: 'date', required: true },
        { name: 'tipoPagamento', label: 'Tipo de pagamento', type: 'select', value: 'programado', options: [
          { value: 'programado', label: 'Programado — sexta-feira anterior ao vencimento' },
          { value: 'imediato', label: 'Imediato — não espera sexta-feira' }], full: true },
        { name: 'pagarAgora', label: 'Já foi pago (lançar direto no caixa)', type: 'checkbox', value: false },
        { name: 'documento', label: 'Boleto / documento' },
        { name: 'observacoes', label: 'Observações', type: 'textarea', full: true }
      ], async d => {
        d.fornecedorId = d.fornecedorId ? Number(d.fornecedorId) : null;
        d.valor = Number(d.valor);
        const r = await App.post('/payables', d);
        App.closeModal();
        if (d.tipoPagamento === 'programado') {
          App.toast(`Conta programada para ${App.date(r.dataProgramada)} (sexta-feira anterior ao vencimento)`, 'ok');
        } else App.toast('Conta registrada como pagamento imediato', 'ok');
        App.route();
      });
    },
    /* Correção de conta já lançada — só a Direção enxerga este botão, e o
       servidor confere de novo. Conta paga tem a saída no caixa acertada
       junto, para o valor não divergir entre os dois lugares. */
    edit(id) {
      const p = payables.find(x => x.id === id);
      if (!p) return;
      App.form(`Corrigir conta: ${p.descricao}`, [
        { name: 'descricao', label: 'Descrição', value: p.descricao, required: true, full: true },
        { name: 'categoria', label: 'Categoria', type: 'select', value: p.categoria,
          options: CATS_PAG.map(([v, l]) => ({ value: v, label: l })) },
        { name: 'fornecedorId', label: 'Fornecedor', type: 'select', value: p.fornecedorId || '',
          options: [{ value: '', label: '—' }].concat(App.ativos(suppliers, p.fornecedorId)
            .map(s => ({ value: s.id, label: s.nome + (s.ativo === false ? ' (inativo)' : '') }))) },
        { name: 'valor', label: 'Valor (R$)', type: 'number', step: '0.01', value: p.valor, required: true },
        { name: 'vencimento', label: 'Vencimento', type: 'date', value: p.vencimento, required: true },
        { name: 'tipoPagamento', label: 'Tipo de pagamento', type: 'select', value: p.tipoPagamento || 'programado', full: true,
          options: [
            { value: 'programado', label: 'Programado — sexta-feira anterior ao vencimento' },
            { value: 'imediato', label: 'Imediato — não espera sexta-feira' }] },
        { name: 'dataProgramada', label: 'Agendamento (em branco = recalcula pela regra da sexta)', type: 'date', value: '' },
        { name: 'forma', label: 'Forma de pagamento', value: p.forma || '' },
        { name: 'recurringId', label: 'Conta recorrente', type: 'select', value: p.recurringId || '',
          options: [{ value: '', label: '— não é recorrente —' }].concat(
            recurring.filter(r => r.ativo).map(r => ({ value: r.id, label: r.nome }))) },
        { name: 'documento', label: 'Boleto / documento', value: p.documento || '' },
        { name: 'observacoes', label: 'Observações', type: 'textarea', value: p.observacoes || '', full: true }
      ], async d => {
        d.valor = Number(d.valor);
        const r = await App.put('/payables/' + id, d);
        App.closeModal();
        App.toast(r.caixaAjustado
          ? 'Conta corrigida — a saída no fluxo de caixa foi acertada junto'
          : 'Conta corrigida', 'ok');
        App.route();
      });
    },
    /* Exclusão de conta lançada errada ou em duplicidade. O servidor confere
       o que está pendurado nela e pede a segunda confirmação quando é o caso;
       apagar uma duplicada não encosta na conta correta. */
    excluir(id) {
      const p = payables.find(x => x.id === id);
      App.excluirLancamento(`/payables/${id}`, 'esta conta',
        { nome: p ? `${p.descricao} — R$ ${App.money(p.valor)} (venc. ${App.date(p.vencimento)})` : null });
    },
    async unpay(id) {
      const p = payables.find(x => x.id === id);
      if (!await App.confirm(`Desfazer o pagamento de <b>${App.esc(p.descricao)}</b>?<br><br>
        <span class="small">A conta volta para a agenda e a saída correspondente sai do fluxo de caixa.</span>`,
        { html: true })) return;
      try {
        await App.post(`/payables/${id}/unpay`, {});
        App.toast('Pagamento desfeito — a conta voltou para a agenda', 'ok');
        App.route();
      } catch (e) { App.toast(e.message, 'err'); }
    },
    pay(id) {
      const p = payables.find(x => x.id === id);
      App.form(`Pagar: ${p.descricao} — R$ ${App.money(p.valor)}`, [
        { name: 'data', label: 'Data do pagamento', type: 'date', value: App.today(), required: true },
        { name: 'conta', label: 'Conta bancária', value: 'principal' }
      ], async d => {
        await App.post(`/payables/${id}/pay`, d);
        App.closeModal(); App.toast('Pagamento lançado no fluxo de caixa', 'ok'); App.route();
      });
    },
    recurringList() {
      App.modal(`
        <h2>Contas recorrentes</h2>
        <p class="small muted">Todo mês o sistema cria automaticamente uma pendência de emissão para cada conta recorrente ativa
        (ex.: emitir boleto COPEL no site). Ao receber o boleto, cadastre a conta com o valor e vencimento reais.</p>
        ${App.table(recurring, [
          { h: 'Conta', cell: r => `<b>${App.esc(r.nome)}</b><div class="small muted">${App.esc(r.instrucao || '')}</div>` },
          { h: 'Vence dia', class: 'num', cell: r => r.diaVencimento },
          { h: 'Aviso', class: 'num', cell: r => (r.diasAviso || 4) + 'd antes' },
          { h: 'Site', cell: r => r.link ? `<a class="btn sm ghost" target="_blank" href="${App.esc(r.link)}">🌐 Abrir</a>` : '<span class="muted small">—</span>' },
          { h: 'Ativa', cell: r => r.ativo ? App.badge('ok') : App.badge('cancelada') },
          { h: '', class: 'num', cell: r => `<button class="btn sm ghost" onclick="Pay.editRecurring(${r.id})">✎</button>` }
        ])}
        <div class="actions">
          <button class="btn" onclick="Pay.editRecurring()">+ Nova recorrente</button>
          <button class="btn primary" onclick="App.closeModal()">Fechar</button>
        </div>`, { wide: true });
    },
    editRecurring(id) {
      App.get('/recurring').then(list => {
        const r = id ? list.find(x => x.id === id) : {};
        App.form(id ? 'Editar conta recorrente' : 'Nova conta recorrente', [
          { name: 'nome', label: 'Nome (ex.: COPEL)', value: r.nome, required: true, full: true },
          { name: 'categoria', label: 'Categoria', type: 'select', value: r.categoria || 'energia',
            options: CATS_PAG.map(([v, l]) => ({ value: v, label: l })) },
          { name: 'diaVencimento', label: 'Dia do vencimento', type: 'number', value: r.diaVencimento || 10 },
          { name: 'diasAviso', label: 'Avisar quantos dias antes', type: 'number', value: r.diasAviso || 4 },
          { name: 'link', label: 'Site / agência virtual (link para pagar)', value: r.link || '', full: true },
          { name: 'instrucao', label: 'Instrução (ex.: emitir boleto no site)', value: r.instrucao, full: true },
          { name: 'ativo', label: 'Ativa', type: 'checkbox', value: r.ativo !== false }
        ], async d => {
          d.diaVencimento = Number(d.diaVencimento);
          d.diasAviso = Number(d.diasAviso) || 4;
          if (id) await App.put('/recurring/' + id, d);
          else await App.post('/recurring', d);
          App.closeModal(); App.toast('Conta recorrente salva — o aviso nasce ' + d.diasAviso + ' dias antes do vencimento', 'ok');
        });
      });
    },
    prefillCheck() {
      // Veio da pendência de conta recorrente ("Cadastrar boleto")
      const raw = sessionStorage.getItem('jm_pay_prefill');
      if (!raw) return;
      sessionStorage.removeItem('jm_pay_prefill');
      try { Pay.create(JSON.parse(raw)); } catch (e) {}
    },
    print() {
      App.print('Agenda de pagamentos',
        agenda.map(g => `<h3>${App.date(g.data)} (${dow(g.data)}) — total R$ ${App.money(g.total)}</h3>
          <table><tr><th>Conta</th><th>Vencimento</th><th>Documento</th><th class="num">Valor</th></tr>
          ${g.contas.map(p => `<tr><td>${App.esc(p.descricao)}</td><td>${App.date(p.vencimento)}</td>
          <td>${App.esc(p.documento || '')}</td><td class="num">R$ ${App.money(p.valor)}</td></tr>`).join('')}</table>`).join(''),
        'Total em aberto: R$ ' + App.money(openTotal));
    }
  };
  Pay.prefillCheck();
});

/* ================= CONTAS A RECEBER ================= */
App.registerView('receivables', async (view) => {
  App.setTitle('Contas a receber', 'Tudo que a empresa tem para receber — venda de cabeçote e serviço no mesmo lugar');
  const [receivables, clients, oss, sales] = await Promise.all([
    App.get('/receivables'), App.get('/clients'), App.get('/serviceOrders'), App.get('/sales')]);
  receivables.sort((a, b) => (a.vencimento || '') < (b.vencimento || '') ? -1 : 1);

  /* De onde vem o dinheiro. É o refType que manda: 'saldo' de uma venda
     continua sendo venda, e 'saldo' de uma OS continua sendo serviço. */
  const ORIGENS = {
    venda: ['Venda de cabeçote', 'accent'],
    servico: ['Serviço', 'info'],
    avulso: ['Avulso', '']
  };
  const origemDe = (r) => r.refType === 'serviceOrders' ? 'servico'
    : r.refType === 'sales' ? 'venda'
    : (r.origem === 'servico' ? 'servico' : r.origem === 'venda' ? 'venda' : 'avulso');
  const selo = (r) => {
    const [rotulo, cls] = ORIGENS[origemDe(r)];
    return `<span class="badge ${cls}">${rotulo}</span>`;
  };
  const refDe = (r) => {
    if (r.refType === 'serviceOrders') {
      const o = oss.find(x => x.id === r.refId);
      return o ? `OS nº ${o.numero}` : 'OS #' + r.refId;
    }
    if (r.refType === 'sales') {
      const v = sales.find(x => x.id === r.refId);
      return v ? `Pedido nº ${v.numero}` : 'Pedido #' + r.refId;
    }
    return '—';
  };

  /* ---------- números de uma parcela ----------------------------------
     Parcela recebida em parte continua sendo cobrança: vale pelo SALDO,
     nunca pelo valor cheio — senão o total a receber ficaria inflado. */
  const recebidoDe = (r) => r.status === 'paga'
    ? Math.round((Number(r.valor) || 0) * 100) / 100
    : Math.round((Number(r.recebido) || 0) * 100) / 100;
  const saldoDe = (r) => (r.status === 'paga' || r.status === 'cancelada') ? 0
    : Math.round(((Number(r.valor) || 0) - (Number(r.recebido) || 0)) * 100) / 100;
  const emAtraso = (r) => r.status === 'vencida' || (r.status === 'parcial' && r.atrasada);
  const aberto = r => r.status === 'aberto' || r.status === 'vencida' || r.status === 'parcial';
  /* Descrição sem o sufixo "— parcela 2/4": é a referência do título. */
  const baseDesc = (r) => String(r.descricao || '').replace(/ — parcela \d+\/\d+$/, '');

  /* Vencimento crescente é a ordem que interessa aqui: o que vence antes
     precisa ser cobrado antes. */
  let ordemRecv = { chave: 'Vencimento', desc: false };
  const open = receivables.filter(aberto);
  const totalOpen = open.reduce((s, r) => s + saldoDe(r), 0);
  const totalOverdue = open.filter(emAtraso).reduce((s, r) => s + saldoDe(r), 0);
  const abertoDe = o => open.filter(r => origemDe(r) === o).reduce((s, r) => s + saldoDe(r), 0);

  view.innerHTML = `
    <div class="tabs" id="rtabs">
      <button data-t="geral" class="active">Visão geral</button>
      <button data-t="boletos">Boletos a receber</button>
    </div>

    <div id="rpane-geral">
      <div class="grid cols-4">
        <div class="card kpi ${totalOverdue ? 'k-danger' : ''}"><div class="label">Vencido</div>
          <div class="value money">${App.money(totalOverdue)}</div></div>
        <div class="card kpi k-warn"><div class="label">Total em aberto</div>
          <div class="value money">${App.money(totalOpen)}</div></div>
        <div class="card kpi"><div class="label">Venda de cabeçote</div>
          <div class="value money">${App.money(abertoDe('venda'))}</div></div>
        <div class="card kpi"><div class="label">Serviços</div>
          <div class="value money">${App.money(abertoDe('servico'))}</div></div>
      </div>
      <div class="toolbar" style="margin-top:14px">
        <button class="btn primary" onclick="Recv.generate()">+ Gerar boletos / parcelas</button>
        <select id="rf-origem" style="max-width:210px">
          <option value="">Toda a receita</option>
          <option value="venda">Venda de cabeçote</option>
          <option value="servico">Serviço</option>
          <option value="avulso">Avulso</option>
        </select>
        <select id="rf" style="max-width:180px"><option value="">Todos os status</option>
          <option value="aberto">Em aberto</option><option value="vencida">Vencidas</option>
          <option value="parcial">Recebidas em parte</option>
          <option value="paga">Pagas</option><option value="cancelada">Canceladas</option></select>
        <div class="spacer"></div>
        <span class="muted small" id="rf-contagem"></span>
        <button class="btn" onclick="Recv.print()">🖨️ Imprimir</button>
      </div>
      <div id="r-table"></div>
    </div>

    <div id="rpane-boletos" style="display:none"></div>`;

  const filtrada = () => {
    const f = document.getElementById('rf').value;
    const fo = document.getElementById('rf-origem').value;
    return receivables.filter(r => (!f || r.status === f) && (!fo || origemDe(r) === fo));
  };

  const render = () => {
    const list = filtrada();
    const soma = list.filter(aberto).reduce((s, r) => s + saldoDe(r), 0);
    document.getElementById('rf-contagem').textContent =
      `${list.length} lançamento(s) · R$ ${App.money(soma)} em aberto`;
    document.getElementById('r-table').innerHTML = App.table(list, [
      { h: 'Origem', cell: r => `${selo(r)}<div class="small muted">${App.esc(refDe(r))}</div>` },
      { h: 'Cliente', sort: r => App.clientName(r.clienteId, clients) || '', sortDesc: false,
        cell: r => `<b>${App.esc(App.clientName(r.clienteId, clients))}</b>` + (App.clientCode(r.clienteId, clients) ? `<div class="small muted mono">${App.esc(App.clientCode(r.clienteId, clients))}</div>` : '') },
      { h: 'Descrição', cell: r => `<span class="small">${App.esc(r.descricao)}</span>` },
      { h: 'Forma', cell: r => App.esc(r.forma || '—') },
      { h: 'Parcela', cell: r => r.parcelas > 1 ? `${r.parcela}/${r.parcelas}` : 'única' },
      { h: 'Vencimento', sort: r => r.vencimento || '', sortDesc: false, cell: r => App.date(r.vencimento) },
      { h: 'Valor', class: 'num', sort: r => Number(r.valor) || 0,
        cell: r => App.moneyHtml(r.valor) + (r.status === 'parcial'
          ? `<div class="small muted">falta R$ ${App.money(saldoDe(r))}</div>` : '') },
      { h: 'Status', sort: r => r.status || '', sortDesc: false, cell: r => App.badge(r.status) },
      { h: '', class: 'num', cell: r => acoesDa(r) }
    ], {
      emptyMsg: 'Nenhum recebível nesta seleção',
      sortState: ordemRecv,
      onSort: (o) => { ordemRecv = o; render(); }
    });
  };

  /* Os mesmos botões nas duas abas: o que se pode fazer com uma parcela não
     muda conforme a tela em que ela está sendo olhada. */
  const acoesDa = (r) => `
    <button class="btn sm ghost" onclick="Recv.detalhe(${r.id})" title="Total, parcelas, recebido e saldo">🔍</button>
    ${aberto(r) ? `
      <button class="btn sm primary" onclick="Recv.receive(${r.id})">✓ Receber</button>
      <button class="btn sm ghost wa" onclick="Recv.wa(${r.id})" title="Cobrar no WhatsApp">✆</button>` : ''}
    ${r.status !== 'cancelada' ? `<button class="btn sm ghost" onclick="Recv.edit(${r.id})" title="Editar parcela">✏️</button>` : ''}
    ${r.parcelas > 1 && aberto(r) ? `
      <button class="btn sm ghost" onclick="Recv.replan(${r.id})" title="Recalcular as parcelas futuras deste grupo">🔁</button>` : ''}
    ${aberto(r) ? `<button class="btn sm ghost" onclick="Recv.cancel(${r.id})" title="Cancelar (mantém o histórico)">✕</button>` : ''}
    <button class="btn sm ghost" onclick="Recv.historico(${r.id})" title="Histórico da parcela">🕘</button>
    <button class="btn sm ghost" onclick="Recv.excluir(${r.id})" title="Excluir lançamento">🗑️</button>`;

  render();
  document.getElementById('rf').addEventListener('change', render);
  document.getElementById('rf-origem').addEventListener('change', render);

  /* =================== ABA: BOLETOS A RECEBER ========================
     A visão geral responde "quanto a empresa tem para receber". Esta aba
     responde "qual boleto, de quem, de qual venda, quando vence e o que já
     foi pago dele" — uma linha por parcela, mês a mês. */

  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const rotuloMes = (m) => {
    if (!m) return 'Todos os meses';
    const [ano, mes] = m.split('-');
    const nome = MESES[Number(mes) - 1] || mes;
    return nome.charAt(0).toUpperCase() + nome.slice(1) + '/' + ano;
  };
  const somarMeses = (m, n) => {
    const d = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + n, 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  };

  /* Os rótulos que a oficina usa para falar de boleto — diferentes dos
     status internos da conta a receber. */
  const SIT = {
    aberto: ['A vencer', 'warn'], vencida: ['Vencido', 'danger'],
    paga: ['Pago', 'ok'], parcial: ['Parcialmente pago', 'info'],
    cancelada: ['Cancelado', 'danger']
  };
  const situacao = (r) => {
    const [rotulo, cls] = SIT[r.status] || [r.status || '—', ''];
    return `<span class="badge ${cls}">${App.esc(rotulo)}</span>` +
      (r.status === 'parcial' && r.atrasada ? '<div class="small neg">em atraso</div>' : '');
  };

  const mesAtual = App.today().slice(0, 7);
  const mesesComBoleto = [...new Set(receivables.map(r => (r.vencimento || '').slice(0, 7)).filter(Boolean))];
  let mesBol = mesAtual;              // '' = todos os meses
  let ordemBol = { chave: 'Vencimento', desc: false };

  const bolEl = id => document.getElementById(id);
  const parcelado = r => (Number(r.parcelas) || 1) > 1 || r.forma === 'boleto' || r.forma === 'cheque';

  /* Filtros de cliente e de venda/OS listam só o que existe em cobrança —
     um select com a base inteira de clientes seria inútil aqui. */
  const clientesComBoleto = [...new Set(receivables.map(r => r.clienteId))]
    .map(id => ({ id, nome: App.clientName(id, clients) || ('Cliente #' + id) }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const refsComBoleto = [...new Set(receivables.filter(r => r.refType).map(r => r.refType + ':' + r.refId))]
    .map(k => ({ k, rotulo: refDe({ refType: k.split(':')[0], refId: Number(k.split(':')[1]) }) }))
    .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'));

  document.getElementById('rpane-boletos').innerHTML = `
    <div class="toolbar">
      <button class="btn sm" id="bol-ant" title="Mês anterior">◀</button>
      <select id="bol-mes" style="max-width:210px"></select>
      <button class="btn sm" id="bol-prox" title="Próximo mês">▶</button>
      <button class="btn sm ghost" id="bol-hoje">Mês atual</button>
      <button class="btn sm ghost" id="bol-todos">Todos os meses</button>
      <div class="spacer"></div>
      <span class="small muted" id="bol-periodo-info"></span>
    </div>

    <div class="grid cols-4" id="bol-kpis"></div>

    <div class="toolbar" style="margin-top:14px">
      <select id="bol-status" style="max-width:190px">
        <option value="">Todos os status</option>
        <option value="aberto">A vencer</option>
        <option value="vencida">Vencidos</option>
        <option value="pagos">Pagos</option>
        <option value="parcial">Parcialmente pagos</option>
        <option value="cancelada">Cancelados</option>
      </select>
      <select id="bol-cliente" style="max-width:220px">
        <option value="">Todos os clientes</option>
        ${clientesComBoleto.map(c => `<option value="${c.id}">${App.esc(c.nome)}</option>`).join('')}
      </select>
      <select id="bol-ref" style="max-width:200px">
        <option value="">Toda venda / OS</option>
        ${refsComBoleto.map(r => `<option value="${App.esc(r.k)}">${App.esc(r.rotulo)}</option>`).join('')}
      </select>
      <select id="bol-tipo" style="max-width:190px">
        <option value="">Todos os títulos</option>
        <option value="boleto">Boletos e parcelas</option>
        <option value="unica">Cobrança única</option>
      </select>
    </div>
    <div class="toolbar">
      <label class="small muted">Vencimento de
        <input type="date" id="bol-de" style="max-width:160px"></label>
      <label class="small muted">até
        <input type="date" id="bol-ate" style="max-width:160px"></label>
      <input class="search" id="bol-busca" placeholder="🔎 Buscar por cliente, venda, OS ou descrição…" style="max-width:320px">
      <button class="btn sm ghost" id="bol-limpar">Limpar filtros</button>
      <div class="spacer"></div>
      <span class="muted small" id="bol-contagem"></span>
      <button class="btn" onclick="Recv.printBoletos()">🖨️ Imprimir</button>
    </div>
    <div id="bol-tabela"></div>`;

  const montarSeletorBol = () => {
    const meses = [...new Set(mesesComBoleto.concat([mesAtual, mesBol].filter(Boolean)))].sort().reverse();
    bolEl('bol-mes').innerHTML = ['<option value="">Todos os meses</option>']
      .concat(meses.map(m => `<option value="${m}"${m === mesBol ? ' selected' : ''}>${
        App.esc(rotuloMes(m))}${mesesComBoleto.includes(m) ? '' : ' (sem boletos)'}</option>`)).join('');
  };

  /* Seleção do mês / período + cliente + venda + tipo + busca.
     O status fica de fora de propósito: é ele que muda a lista da tabela,
     mas o "total do mês" precisa continuar sendo o total do mês. */
  const selecaoBol = () => {
    const de = bolEl('bol-de').value, ate = bolEl('bol-ate').value;
    const cli = bolEl('bol-cliente').value, ref = bolEl('bol-ref').value, tipo = bolEl('bol-tipo').value;
    let list = receivables.filter(r => {
      const v = r.vencimento || '';
      if (de && v < de) return false;
      if (ate && v > ate) return false;
      if (!de && !ate && mesBol && v.slice(0, 7) !== mesBol) return false;
      if (cli && r.clienteId !== Number(cli)) return false;
      if (ref && (r.refType + ':' + r.refId) !== ref) return false;
      if (tipo === 'boleto' && !parcelado(r)) return false;
      if (tipo === 'unica' && parcelado(r)) return false;
      return true;
    });
    return App.filtraPor(list, bolEl('bol-busca').value, [
      r => App.clientName(r.clienteId, clients), r => App.clientCode(r.clienteId, clients),
      r => refDe(r), 'descricao', 'forma', 'vencimento', 'observacoes',
      r => (SIT[r.status] || [''])[0]
    ]);
  };

  const porStatus = (list) => {
    const f = bolEl('bol-status').value;
    if (!f) return list;
    if (f === 'pagos') return list.filter(r => r.status === 'paga');
    if (f === 'aberto') return list.filter(r => r.status === 'aberto');
    if (f === 'vencida') return list.filter(r => r.status === 'vencida');
    if (f === 'parcial') return list.filter(r => r.status === 'parcial');
    return list.filter(r => r.status === f);
  };

  const renderBoletos = () => {
    montarSeletorBol();
    const selecao = selecaoBol();
    const livre = !!(bolEl('bol-de').value || bolEl('bol-ate').value);
    const rotulo = livre ? 'no período' : (mesBol ? 'em ' + rotuloMes(mesBol) : 'em todos os meses');

    const emCobranca = selecao.filter(aberto);
    const totalMes = emCobranca.reduce((s, r) => s + saldoDe(r), 0);
    const vencidoMes = emCobranca.filter(emAtraso).reduce((s, r) => s + saldoDe(r), 0);
    const aVencerMes = Math.round((totalMes - vencidoMes) * 100) / 100;
    const recebidoMes = selecao.reduce((s, r) => s + recebidoDe(r), 0);

    bolEl('bol-kpis').innerHTML = `
      <div class="card kpi k-warn"><div class="label">Total de boletos a receber ${App.esc(rotulo)}</div>
        <div class="value money">${App.money(totalMes)}</div>
        <div class="hint">${emCobranca.length} boleto(s) em cobrança</div></div>
      <div class="card kpi ${vencidoMes ? 'k-danger' : ''}"><div class="label">Vencido</div>
        <div class="value money">${App.money(vencidoMes)}</div>
        <div class="hint">${emCobranca.filter(emAtraso).length} boleto(s) em atraso</div></div>
      <div class="card kpi"><div class="label">A vencer</div>
        <div class="value money">${App.money(aVencerMes)}</div>
        <div class="hint">ainda dentro do prazo</div></div>
      <div class="card kpi k-ok"><div class="label">Já recebido ${App.esc(rotulo)}</div>
        <div class="value money">${App.money(recebidoMes)}</div>
        <div class="hint">inclui os pagamentos parciais</div></div>`;

    bolEl('bol-periodo-info').textContent = livre
      ? 'período de vencimento escolhido à mão'
      : `${selecao.length} boleto(s) ${mesBol ? 'com vencimento em ' + rotuloMes(mesBol) : 'em todo o histórico'}`;

    const list = porStatus(selecao);
    bolEl('bol-contagem').textContent =
      `${list.length} boleto(s) na lista · R$ ${App.money(list.filter(aberto).reduce((s, r) => s + saldoDe(r), 0))} a receber`;

    bolEl('bol-tabela').innerHTML = App.table(list, [
      { h: 'Cliente', sort: r => App.clientName(r.clienteId, clients) || '', sortDesc: false,
        cell: r => `<b>${App.esc(App.clientName(r.clienteId, clients))}</b>` +
          (App.clientCode(r.clienteId, clients) ? `<div class="small muted mono">${App.esc(App.clientCode(r.clienteId, clients))}</div>` : '') },
      { h: 'Venda / OS', sort: r => refDe(r), sortDesc: false,
        cell: r => `${App.esc(refDe(r))}<div class="small muted">${ORIGENS[origemDe(r)][0]}</div>` },
      { h: 'Referência', sort: r => baseDesc(r), sortDesc: false,
        cell: r => `<span class="small">${App.esc(baseDesc(r) || '—')}</span>` +
          (r.forma ? `<div class="small muted">${App.esc(r.forma)}</div>` : '') },
      { h: 'Parcela', sort: r => (Number(r.parcela) || 1), cell: r => r.parcelas > 1
        ? `<b>${r.parcela}/${r.parcelas}</b>` : '<span class="muted">única</span>' },
      { h: 'Valor', class: 'num', sort: r => Number(r.valor) || 0, cell: r => App.moneyHtml(r.valor) },
      { h: 'Recebido', class: 'num', sort: r => recebidoDe(r),
        cell: r => recebidoDe(r) ? `<span class="pos">R$ ${App.money(recebidoDe(r))}</span>` : '<span class="muted">—</span>' },
      { h: 'A receber', class: 'num', sort: r => saldoDe(r),
        cell: r => saldoDe(r) ? `<b class="${emAtraso(r) ? 'neg' : ''}">R$ ${App.money(saldoDe(r))}</b>` : '<span class="muted">—</span>' },
      { h: 'Vencimento', sort: r => r.vencimento || '', sortDesc: false,
        cell: r => `${App.date(r.vencimento)}${emAtraso(r) ? '<div class="small neg">vencido</div>' : ''}` },
      { h: 'Situação', sort: r => (SIT[r.status] || [''])[0], sortDesc: false, cell: situacao },
      { h: 'Pago em', sort: r => r.dataRecebimento || '', sortDesc: false,
        cell: r => r.dataRecebimento ? App.date(r.dataRecebimento) : '<span class="muted">—</span>' },
      { h: '', class: 'num', cell: r => acoesDa(r) }
    ], {
      emptyMsg: livre ? 'Nenhum boleto com vencimento neste período'
        : mesBol ? `Nenhum boleto vencendo em ${rotuloMes(mesBol)} — use as setas para procurar outro mês.`
          : 'Nenhum boleto nesta seleção',
      sortState: ordemBol,
      onSort: (o) => { ordemBol = o; renderBoletos(); }
    });
  };

  /* Mês e período livre são dois jeitos de escolher a mesma coisa: quem usa
     um desliga o outro, para a tela nunca mostrar um total ambíguo. */
  const irParaMes = (m) => {
    mesBol = m;
    bolEl('bol-de').value = ''; bolEl('bol-ate').value = '';
    renderBoletos();
  };
  bolEl('bol-mes').addEventListener('change', e => irParaMes(e.target.value));
  bolEl('bol-ant').onclick = () => irParaMes(somarMeses(mesBol || mesAtual, -1));
  bolEl('bol-prox').onclick = () => irParaMes(somarMeses(mesBol || mesAtual, 1));
  bolEl('bol-hoje').onclick = () => irParaMes(mesAtual);
  bolEl('bol-todos').onclick = () => irParaMes('');
  ['bol-de', 'bol-ate'].forEach(id => bolEl(id).addEventListener('change', () => {
    if (bolEl(id).value) { mesBol = ''; montarSeletorBol(); }
    renderBoletos();
  }));
  ['bol-status', 'bol-cliente', 'bol-ref', 'bol-tipo'].forEach(id =>
    bolEl(id).addEventListener('change', renderBoletos));
  bolEl('bol-busca').addEventListener('input', renderBoletos);
  bolEl('bol-limpar').onclick = () => {
    ['bol-status', 'bol-cliente', 'bol-ref', 'bol-tipo', 'bol-de', 'bol-ate', 'bol-busca']
      .forEach(id => { bolEl(id).value = ''; });
    irParaMes(mesAtual);
  };
  renderBoletos();

  document.querySelectorAll('#rtabs button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('#rtabs button').forEach(x => x.classList.toggle('active', x === b));
    document.getElementById('rpane-geral').style.display = b.dataset.t === 'geral' ? '' : 'none';
    document.getElementById('rpane-boletos').style.display = b.dataset.t === 'boletos' ? '' : 'none';
  }));

  /* Parcelas irmãs: mesma venda (refType/refId) ou, nos boletos avulsos,
     mesmo cliente e mesma descrição-base. */
  const grupoDe = (r) => receivables.filter(x =>
    x.id === r.id ||
    (r.refType && x.refType === r.refType && x.refId === r.refId) ||
    (!r.refType && !x.refType && x.clienteId === r.clienteId &&
      baseDesc(x) === baseDesc(r)));

  window.Recv = {
    /* Excluir um lançamento feito por engano. Sem recebimento, sai limpo;
       com recebimento, o servidor exige confirmação e estorna o caixa. */
    async excluir(id) {
      const r = receivables.find(x => x.id === id);
      if (!await App.confirm(
        `Tem certeza que deseja excluir esta conta a receber?<br><br>` +
        `<b>${App.esc(r.descricao || 'Parcela')}</b> — R$ ${App.money(r.valor)} ` +
        `(vencimento ${App.date(r.vencimento)})<br><br>` +
        '<span class="small">Isto não pode ser desfeito. Se quiser manter o histórico, use ✕ Cancelar.</span>',
        { html: true })) return;
      try {
        await App.del('/receivables/' + id);
        App.toast('Conta a receber excluída', 'ok');
        App.route();
      } catch (e) {
        if (!/recebimento registrado/.test(e.message)) return App.toast(e.message, 'err');
        // Já recebida: o servidor devolveu o aviso e pede confirmação extra.
        if (!await App.confirm(e.message + '<br><br><span class="small">A entrada correspondente sai do caixa junto, para o financeiro não ficar com dinheiro que não existe.</span>', { html: true })) return;
        try {
          const out = await App.del('/receivables/' + id, { 'X-Confirmar': 'sim' });
          App.toast(`Excluída — ${out.estornadas} entrada(s) de caixa estornada(s)`, 'ok');
          App.route();
        } catch (e2) { App.toast(e2.message, 'err'); }
      }
    },

    /* Edição de UMA parcela. Mudar o vencimento de uma não mexe nas outras
       — é exatamente para isso que ela existe: o cliente pediu mais prazo
       só na terceira, e só a terceira muda. */
    edit(id) {
      const r = receivables.find(x => x.id === id);
      if (!r) return;
      const recebida = r.status === 'paga';
      const parcial = r.status === 'parcial';
      /* Marcar "pago" à mão criaria dinheiro que não passou pelo caixa: a
         baixa é sempre pelo botão ✓ Receber. Aqui só se ativa ou cancela. */
      const podeStatus = App.can('receivables') && !recebida && !parcial;
      const m = App.form(`✏️ Editar parcela${r.parcelas > 1 ? ` ${r.parcela}/${r.parcelas}` : ''}`, [
        { name: 'clienteId', label: 'Cliente', type: 'select', value: r.clienteId, full: true,
          options: App.clientOptions(clients, r.clienteId) },
        { name: 'descricao', label: 'Descrição', value: r.descricao, full: true },
        { name: 'valor', label: 'Valor (R$)', type: 'number', step: '0.01', value: r.valor, required: true },
        { name: 'vencimento', label: 'Vencimento desta parcela', type: 'date', value: r.vencimento, required: true },
        { name: 'forma', label: 'Forma', type: 'select', value: r.forma || 'boleto',
          options: ['boleto', 'pix', 'cartao', 'cheque', 'dinheiro', 'outro'].map(v => ({ value: v, label: v })) },
        ...(podeStatus ? [{ name: 'status', label: 'Situação', type: 'select', value: r.status === 'vencida' ? 'aberto' : r.status,
          options: [{ value: 'aberto', label: 'Em cobrança (a vencer / vencido)' },
                    { value: 'cancelada', label: 'Cancelado' }] }] : []),
        { name: 'observacoes', label: 'Observações', type: 'textarea', value: r.observacoes || '', full: true }
      ], async d => {
        const corpo = {
          clienteId: Number(d.clienteId), descricao: d.descricao, valor: Number(d.valor),
          vencimento: d.vencimento, forma: d.forma, observacoes: d.observacoes
        };
        if (podeStatus && d.status) corpo.status = d.status;
        const grava = async (confirmar) => {
          await App.put('/receivables/' + id, confirmar ? Object.assign({ confirmar: true }, corpo) : corpo);
          App.closeModal();
          App.toast('Parcela atualizada — agenda e projeção acompanharam', 'ok');
          App.route();
        };
        try {
          await grava(false);
        } catch (e) {
          if (!/movimentação financeira/.test(e.message)) throw e;
          // Recebida: a regra de segurança pede confirmação explícita.
          if (await App.confirm(e.message + '<br><br>A entrada correspondente no caixa será ajustada junto, e a alteração fica registrada no histórico.', { html: true })) {
            await grava(true);
          }
        }
      });
      const aviso = recebida
        ? `⚠ Parcela já recebida em ${App.date(r.dataRecebimento)} — alterações pedem confirmação.`
        : parcial
          ? `⚠ Já entraram R$ ${App.money(recebidoDe(r))} desta parcela — o que já foi recebido continua lançado; mudar o valor muda só o que falta.`
          : '';
      if (aviso) {
        m.querySelector('.actions').insertAdjacentHTML('afterbegin',
          `<p class="small" style="margin-right:auto;color:var(--warn,#d29922)">${App.esc(aviso)}</p>`);
      } else {
        m.querySelector('.actions').insertAdjacentHTML('afterbegin',
          `<p class="small muted" style="margin-right:auto">Alterar o vencimento aqui muda <b>só esta parcela</b> — as outras do grupo ficam como estão.<br>
           Data e valor alterados ficam registrados no histórico da parcela.</p>`);
      }
    },

    /* Histórico da parcela: quem mudou o quê, e cada recebimento lançado. */
    historico(id) {
      const r = receivables.find(x => x.id === id);
      if (!r) return;
      const linhas = (r.historico || []).slice().reverse();
      const recs = (r.recebimentos || []).slice().reverse();
      App.modal(`
        <h2>🕘 Histórico da parcela${r.parcelas > 1 ? ` ${r.parcela}/${r.parcelas}` : ''}</h2>
        <p class="small muted">${App.esc(App.clientName(r.clienteId, clients))} · ${App.esc(refDe(r))} ·
          ${App.esc(baseDesc(r))}</p>
        <div class="grid cols-4" style="margin-top:12px">
          <div class="card kpi"><div class="label">Valor da parcela</div><div class="value money">${App.money(r.valor)}</div></div>
          <div class="card kpi k-ok"><div class="label">Já recebido</div><div class="value money">${App.money(recebidoDe(r))}</div></div>
          <div class="card kpi ${saldoDe(r) ? 'k-warn' : 'k-ok'}"><div class="label">Falta receber</div><div class="value money">${App.money(saldoDe(r))}</div></div>
          <div class="card kpi"><div class="label">Situação</div>
            <div class="value" style="font-size:15px;padding-top:6px">${situacao(r)}</div></div>
        </div>
        <div class="section-title">RECEBIMENTOS LANÇADOS</div>
        ${App.table(recs, [
          { h: 'Data', cell: x => App.date(x.data) },
          { h: 'Forma', cell: x => App.esc(x.forma || '—') },
          { h: 'Conta', cell: x => App.esc(x.conta || '—') },
          { h: 'Lançado por', cell: x => `<span class="small muted">${App.esc(x.por || '—')}</span>` },
          { h: 'Observação', cell: x => `<span class="small muted">${App.esc(x.obs || '—')}</span>` },
          { h: 'Valor', class: 'num', cell: x => App.moneyHtml(x.valor) }
        ], { emptyMsg: 'Nenhum recebimento lançado nesta parcela' })}
        <div class="section-title">ALTERAÇÕES</div>
        ${linhas.length ? `<ul class="timeline">${linhas.map(h => `
          <li><b>${App.esc(h.tipo === 'recebimento' ? 'Recebimento' : 'Edição')}</b>
            <span class="small muted">${App.esc(App.dateTime(h.em))} · ${App.esc(h.por || '—')}</span>
            <div class="small">${(h.mudancas || []).map(x => App.esc(x)).join('<br>')}</div></li>`).join('')}</ul>`
          : '<p class="small muted">Nenhuma alteração registrada nesta parcela.</p>'}
        <div class="actions"><button class="btn" onclick="App.closeModal()">Fechar</button></div>`, { wide: true });
    },

    replan(id) {
      const r = receivables.find(x => x.id === id);
      if (!r) return;
      const grupo = grupoDe(r).filter(x => x.status !== 'cancelada');
      const pagas = grupo.filter(x => x.status === 'paga' || x.status === 'parcial');
      const total = grupo.reduce((s, x) => s + x.valor, 0);
      const m = App.form(`🔁 Recalcular parcelas — ${App.clientName(r.clienteId, clients)}`, [
        { name: 'valorTotal', label: 'Valor total (R$)', type: 'number', step: '0.01', value: total.toFixed(2), required: true },
        { name: 'parcelas', label: 'Nº total de parcelas', type: 'number', value: grupo.length, required: true },
        { name: 'intervaloDias', label: 'Intervalo entre parcelas (dias)', type: 'number', value: 30, required: true },
        { name: 'primeiroVencimento', label: 'Vencimento da próxima parcela', type: 'date',
          value: (grupo.find(x => x.status === 'aberto' || x.status === 'vencida') || {}).vencimento || App.today(), required: true }
      ], async d => {
        const out = await App.post('/receivables/replan', {
          ids: grupo.map(x => x.id), valorTotal: Number(d.valorTotal), parcelas: Number(d.parcelas),
          intervaloDias: Number(d.intervaloDias), primeiroVencimento: d.primeiroVencimento
        });
        App.closeModal();
        App.toast(`Recalculado: ${out.pagas} recebida(s) preservada(s) + ${out.criadas.length} futura(s): `
          + out.criadas.map(c => App.date(c.vencimento)).join(', '), 'ok');
        App.route();
      }, { submitLabel: 'Recalcular futuras' });
      m.querySelector('.actions').insertAdjacentHTML('afterbegin',
        `<p class="small muted" style="margin-right:auto">${grupo.length} parcela(s) no grupo · ${pagas.length} já com recebimento
         ${pagas.length ? '(não serão tocadas — só as futuras mudam)' : ''}<br>
         A 1ª parcela recalculada cai na data informada; as seguintes andam pelo intervalo.</p>`);
    },

    wa(id) {
      const r = receivables.find(x => x.id === id);
      const c = clients.find(x => x.id === r.clienteId);
      App.waShare(`Cobrança — ${(c && c.nome) || 'cliente'}`, App.waPhoneOf(c), App.waMsg.charge(r, c));
    },

    generate() {
      const m = App.form('Gerar boletos / parcelas automáticas', [
        { name: 'clienteId', label: 'Cliente', type: 'select', required: true, full: true,
          options: App.clientOptions(clients) },
        { name: 'descricao', label: 'Descrição', value: 'Boleto', full: true },
        { name: 'dataVenda', label: 'Data da venda', type: 'date', value: App.today(), required: true },
        { name: 'valor', label: 'Valor total (R$)', type: 'number', step: '0.01', required: true },
        { name: 'parcelas', label: 'Nº de parcelas', type: 'number', value: 3, required: true },
        { name: 'intervaloDias', label: 'Intervalo entre parcelas (dias)', type: 'number', value: 30, required: true },
        { name: 'primeiroVencimento', label: 'Vencimento da 1ª parcela', type: 'date', value: App.addDays(App.today(), 30), required: true },
        { name: 'forma', label: 'Forma', type: 'select', value: 'boleto',
          options: ['boleto', 'pix', 'cartao', 'cheque', 'outro'].map(v => ({ value: v, label: v })) }
      ], async d => {
        const out = await App.post('/receivables/generate', {
          clienteId: Number(d.clienteId), descricao: d.descricao, dataVenda: d.dataVenda,
          valor: Number(d.valor), parcelas: Number(d.parcelas), intervaloDias: Number(d.intervaloDias),
          primeiroVencimento: d.primeiroVencimento, forma: d.forma
        });
        App.closeModal();
        App.toast(`${out.length} parcela(s) geradas: ` + out.map(p => App.date(p.vencimento)).join(', '), 'ok');
        App.route();
      });
      /* Pré-visualização: as mesmas contas do servidor, para a pessoa ver as
         datas e o valor de cada parcela ANTES de gerar. */
      const preview = document.createElement('div');
      preview.className = 'small muted'; preview.style.margin = '4px 0 10px';
      m.querySelector('.actions').before(preview);
      m.addEventListener('input', () => {
        const g = n => m.querySelector(`[name=${n}]`).value;
        const valor = Number(g('valor')) || 0, n = Number(g('parcelas')) || 1, int = Number(g('intervaloDias')) || 30;
        if (!valor) { preview.textContent = ''; return; }
        const primeiro = g('primeiroVencimento');
        const parts = [];
        const cent = Math.round(valor * 100), base = Math.floor(cent / n);
        for (let i = 1; i <= Math.min(n, 12); i++) {
          const dia = primeiro ? App.addDays(primeiro, int * (i - 1)) : App.addDays(g('dataVenda'), int * i);
          const v = (i === n ? cent - base * (n - 1) : base) / 100;
          parts.push(`Parcela ${i} — R$ ${App.money(v)} — ${App.date(dia)}`);
        }
        preview.innerHTML = '<b>Pré-visualização:</b><br>' + parts.join('<br>')
          + (n > 12 ? `<br><span class="muted">… e mais ${n - 12} parcela(s)</span>` : '');
      });
    },

    /* Baixa do boleto. Por padrão recebe tudo que falta; marcando
       "recebimento parcial", entra só o valor informado e a parcela fica
       "Parcialmente paga" com o restante ainda em cobrança. */
    receive(id) {
      const r = receivables.find(x => x.id === id);
      if (!r) return;
      const falta = saldoDe(r);
      const m = App.form(`✓ Receber — ${r.descricao}`, [
        { name: 'data', label: 'Data do recebimento', type: 'date', value: App.today(), required: true },
        { name: 'forma', label: 'Forma', type: 'select', value: r.forma || 'boleto',
          options: ['boleto', 'pix', 'cartao', 'cheque', 'dinheiro', 'outro'].map(v => ({ value: v, label: v })) },
        { name: 'conta', label: 'Conta bancária', value: 'principal' },
        { name: 'parcialmente', label: 'Recebimento parcial (o cliente pagou só uma parte)', type: 'checkbox', value: false, full: true },
        { name: 'valor', label: 'Valor recebido agora (R$)', type: 'number', step: '0.01', value: falta.toFixed(2) },
        { name: 'obs', label: 'Observação', full: true }
      ], async d => {
        const corpo = { data: d.data, conta: d.conta, forma: d.forma, obs: d.obs };
        if (d.parcialmente) corpo.valor = Number(d.valor);
        const out = await App.post(`/receivables/${id}/receive`, corpo);
        App.closeModal();
        App.toast(out.quitada
          ? 'Recebimento lançado no fluxo de caixa — parcela quitada'
          : `Recebido R$ ${App.money(out.valor)} — falta R$ ${App.money(out.saldo)} nesta parcela`, 'ok');
        App.route();
      }, { submitLabel: 'Lançar recebimento' });

      const campoValor = m.querySelector('[name=valor]').closest('.field');
      const ajustar = () => { campoValor.style.display = m.querySelector('[name=parcialmente]').checked ? '' : 'none'; };
      m.querySelector('[name=parcialmente]').addEventListener('change', ajustar);
      ajustar();
      m.querySelector('.actions').insertAdjacentHTML('afterbegin',
        `<p class="small muted" style="margin-right:auto">Falta receber <b>R$ ${App.money(falta)}</b> desta parcela` +
        (recebidoDe(r) ? ` (R$ ${App.money(recebidoDe(r))} já recebidos).` : '.') +
        `<br>O valor entra no Fluxo de caixa na hora, sem lançamento duplicado.</p>`);
    },

    async cancel(id) {
      const r = receivables.find(x => x.id === id);
      if (!await App.confirm(recebidoDe(r)
        ? `Esta parcela já tem R$ ${App.money(recebidoDe(r))} recebidos. Cancelar tira o restante da cobrança, mas o que já entrou continua no caixa. Confirma?`
        : 'Cancelar esta parcela?')) return;
      await App.post(`/receivables/${id}/cancel`, {});
      App.route();
    },

    /* Painel do título: total combinado, parcelas, o que já entrou e o que
       falta — para venda de cabeçote e para serviço, do mesmo jeito. */
    detalhe(id) {
      const r = receivables.find(x => x.id === id);
      if (!r) return;
      const grupo = grupoDe(r).slice().sort((a, b) =>
        String(a.vencimento || '').localeCompare(String(b.vencimento || '')) || a.id - b.id);
      const vivos = grupo.filter(x => x.status !== 'cancelada');
      const total = vivos.reduce((s, x) => s + x.valor, 0);
      const recebidoParcelas = vivos.reduce((s, x) => s + recebidoDe(x), 0);

      // Recebimentos parciais ficam guardados na venda / na OS.
      const fonte = r.refType === 'sales' ? sales.find(x => x.id === r.refId)
        : r.refType === 'serviceOrders' ? oss.find(x => x.id === r.refId) : null;
      const parciais = (fonte && fonte.recebimentos) || [];
      const recebidoParcial = parciais.reduce((s, x) => s + (Number(x.valor) || 0), 0);
      const valorContratado = fonte
        ? Number(fonte.valorTotal) || 0
        : total;
      const recebido = Math.round((recebidoParcelas + recebidoParcial) * 100) / 100;
      const saldo = Math.round((valorContratado - recebido) * 100) / 100;
      const pag = (fonte && fonte.pagamento) || {};

      App.modal(`
        <h2>${ORIGENS[origemDe(r)][0]} — ${App.esc(refDe(r))}</h2>
        <p class="small muted">${App.esc(App.clientName(r.clienteId, clients))}${
          fonte && fonte.modelo ? ' · ' + App.esc(fonte.modelo) : ''}${
          fonte && fonte.descricaoServico ? ' · ' + App.esc(fonte.descricaoServico) : ''}</p>
        <div class="grid cols-4" style="margin-top:12px">
          <div class="card kpi"><div class="label">Valor total</div><div class="value money">${App.money(valorContratado)}</div></div>
          <div class="card kpi k-ok"><div class="label">Já recebido</div><div class="value money">${App.money(recebido)}</div></div>
          <div class="card kpi ${saldo > 0 ? 'k-warn' : 'k-ok'}"><div class="label">Saldo em aberto</div><div class="value money">${App.money(saldo)}</div></div>
          <div class="card kpi"><div class="label">Situação</div><div class="value" style="font-size:15px;padding-top:6px">${
            App.badge(saldo <= 0.005 ? 'pago' : recebido > 0 ? 'parcial' : 'pendente')}</div></div>
        </div>
        <div class="section-title">FORMA DE PAGAMENTO</div>
        <p class="small">${App.esc(pag.forma || r.forma || '—')}${
          vivos.length > 1 ? ` · ${vivos.length} parcelas de ~R$ ${App.money(total / vivos.length)}` : ' · parcela única'}${
          pag.primeiroVencimento ? ` · 1º vencimento em ${App.date(pag.primeiroVencimento)}` : ''}${
          pag.intervaloDias && vivos.length > 1 ? ` · a cada ${pag.intervaloDias} dias` : ''}</p>
        <div class="section-title">PARCELAS</div>
        ${App.table(grupo, [
          { h: 'Parcela', cell: x => x.parcelas > 1 ? `${x.parcela}/${x.parcelas}` : 'única' },
          { h: 'Descrição', cell: x => `<span class="small">${App.esc(x.descricao)}</span>` },
          { h: 'Vencimento', cell: x => App.date(x.vencimento) },
          { h: 'Valor', class: 'num', cell: x => App.moneyHtml(x.valor) },
          { h: 'Recebido', class: 'num', cell: x => recebidoDe(x) ? 'R$ ' + App.money(recebidoDe(x)) : '—' },
          { h: 'A receber', class: 'num', cell: x => saldoDe(x) ? 'R$ ' + App.money(saldoDe(x)) : '—' },
          { h: 'Recebida em', cell: x => x.dataRecebimento ? App.date(x.dataRecebimento) : '—' },
          { h: 'Situação', cell: situacao }
        ], { emptyMsg: 'Sem parcelas' })}
        ${parciais.length ? `<div class="section-title">RECEBIMENTOS PARCIAIS (na venda / OS)</div>
          ${App.table(parciais, [
            { h: 'Data', cell: x => App.date(x.data) },
            { h: 'Forma', cell: x => App.esc(x.forma || '—') },
            { h: 'Observação', cell: x => `<span class="small muted">${App.esc(x.obs || '—')}</span>` },
            { h: 'Valor', class: 'num', cell: x => App.moneyHtml(x.valor) }
          ])}` : ''}
        <div class="actions"><button class="btn" onclick="App.closeModal()">Fechar</button></div>`, { wide: true });
    },

    print() {
      const list = filtrada();
      const f = document.getElementById('rf').value;
      const fo = document.getElementById('rf-origem').value;
      const titulo = 'Contas a receber' +
        (fo ? ' — ' + ORIGENS[fo][0] : '') +
        (f ? ' — ' + (App.STATUS[f] || [f])[0] : '');
      const emAberto = list.filter(aberto).reduce((s, r) => s + saldoDe(r), 0);
      App.print(titulo,
        `<table><tr><th>Origem</th><th>Referência</th><th>Cliente</th><th>Descrição</th><th>Parcela</th><th>Vencimento</th><th class="num">Valor</th><th class="num">A receber</th><th>Status</th></tr>
        ${list.map(r => `<tr><td>${ORIGENS[origemDe(r)][0]}</td><td>${App.esc(refDe(r))}</td>
        <td>${App.esc(App.clientName(r.clienteId, clients))}</td><td>${App.esc(r.descricao)}</td>
        <td>${r.parcelas > 1 ? r.parcela + '/' + r.parcelas : 'única'}</td><td>${App.date(r.vencimento)}</td>
        <td class="num">R$ ${App.money(r.valor)}</td><td class="num">R$ ${App.money(saldoDe(r))}</td>
        <td>${(App.STATUS[r.status] || [r.status])[0]}</td></tr>`).join('')}</table>`,
        `${list.length} título(s) — R$ ${App.money(emAberto)} em aberto`);
    },

    /* Folha de cobrança do mês: uma linha por boleto, na ordem da tela. */
    printBoletos() {
      const list = porStatus(selecaoBol());
      const livre = !!(bolEl('bol-de').value || bolEl('bol-ate').value);
      const periodo = livre
        ? `${App.date(bolEl('bol-de').value) || '…'} a ${App.date(bolEl('bol-ate').value) || '…'}`
        : (mesBol ? rotuloMes(mesBol) : 'todos os meses');
      const aReceber = list.filter(aberto).reduce((s, r) => s + saldoDe(r), 0);
      const vencido = list.filter(emAtraso).reduce((s, r) => s + saldoDe(r), 0);
      App.print(`Boletos a receber — ${periodo}`,
        `<table><tr><th>Cliente</th><th>Venda / OS</th><th>Referência</th><th>Parcela</th>
          <th>Vencimento</th><th class="num">Valor</th><th class="num">Recebido</th>
          <th class="num">A receber</th><th>Situação</th><th>Pago em</th></tr>
        ${list.map(r => `<tr>
          <td>${App.esc(App.clientName(r.clienteId, clients))}</td>
          <td>${App.esc(refDe(r))}</td>
          <td>${App.esc(baseDesc(r))}</td>
          <td>${r.parcelas > 1 ? r.parcela + '/' + r.parcelas : 'única'}</td>
          <td>${App.date(r.vencimento)}</td>
          <td class="num">R$ ${App.money(r.valor)}</td>
          <td class="num">${recebidoDe(r) ? 'R$ ' + App.money(recebidoDe(r)) : '—'}</td>
          <td class="num">${saldoDe(r) ? 'R$ ' + App.money(saldoDe(r)) : '—'}</td>
          <td>${(SIT[r.status] || [r.status])[0]}</td>
          <td>${r.dataRecebimento ? App.date(r.dataRecebimento) : '—'}</td></tr>`).join('')}</table>`,
        `${list.length} boleto(s) — R$ ${App.money(aReceber)} a receber` +
        (vencido ? ` · R$ ${App.money(vencido)} vencido` : ''));
    }
  };
});

/* ================= FLUXO DE CAIXA ================= */
App.registerView('cashflow', async (view) => {
  App.setTitle('Fluxo de caixa', 'Quando o dinheiro efetivamente entrou ou saiu — não confundir com a DRE');
  const flows = await App.get('/cashflow');
  flows.sort((a, b) => (a.data < b.data ? 1 : -1) || b.id - a.id);
  /* Corrigir ou apagar lançamento de caixa é função da Direção. */
  const podeEditarCF = App.can('cashflow_edit');
  /* Lançamento que veio de outro módulo é o reflexo daquele registro:
     mexer aqui deixaria os dois lados divergentes, então só o manual é
     editável — o resto se desfaz na origem. */
  const manualCF = f => !f.refType;
  /* A ordem escolhida vive aqui, fora do render, para sobreviver ao
     redesenho que a busca provoca a cada tecla. */
  let ordemCF = { chave: 'Data', desc: true };
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  /* 'YYYY-MM' → 'Agosto/2026'. O formato ISO é o que se compara e o que se
     navega; o rótulo existe só para a pessoa ler. */
  const rotuloMes = (m) => {
    if (!m) return 'Todo o período';
    const [ano, mes] = m.split('-');
    const nome = MESES[Number(mes) - 1] || mes;
    return nome.charAt(0).toUpperCase() + nome.slice(1) + '/' + ano;
  };
  /* Anda n meses no calendário, inclusive virando o ano. Precisa funcionar
     para meses sem nenhum lançamento — é justamente onde a pessoa quer
     conferir que não houve movimento. */
  const somarMeses = (m, n) => {
    const d = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + n, 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  };

  const mesAtual = App.today().slice(0, 7);
  const mesesComLancamento = [...new Set(flows.map(f => (f.data || '').slice(0, 7)).filter(Boolean))];
  /* '' significa "todo o período". Começa no mês corrente, que é o que a
     pessoa quer ver ao abrir a tela. */
  let periodo = mesAtual;

  const doMes = (m) => m ? flows.filter(f => (f.data || '').slice(0, 7) === m) : flows;
  const somar = (lista, tipo) => lista.filter(f => f.tipo === tipo).reduce((s, f) => s + (Number(f.valor) || 0), 0);
  /* Saldo acumulado: tudo que entrou e saiu ATÉ o fim do mês escolhido,
     não só o mês. É o número que responde "quanto a empresa tinha em caixa
     naquele fechamento" — setembro carrega o que sobrou de agosto. */
  const acumuladoAte = (m) => flows
    .filter(f => !m || (f.data || '').slice(0, 7) <= m)
    .reduce((s, f) => s + (f.tipo === 'entrada' ? (Number(f.valor) || 0) : -(Number(f.valor) || 0)), 0);

  view.innerHTML = `
    <div class="toolbar cf-periodo">
      <button class="btn sm" id="cf-ant" title="Mês anterior">◀</button>
      <select id="cf-mes" style="max-width:210px"></select>
      <button class="btn sm" id="cf-prox" title="Próximo mês">▶</button>
      <button class="btn sm ghost" id="cf-hoje">Mês atual</button>
      <button class="btn sm ghost" id="cf-todos">Todo o período</button>
      <div class="spacer"></div>
      <span class="small muted" id="cf-periodo-info"></span>
    </div>

    <div class="grid cols-4" id="cf-kpis"></div>

    <div class="toolbar" style="margin-top:14px">
      <button class="btn" onclick="CF.manual()">+ Lançamento manual</button>
      <label class="btn" style="cursor:pointer">📥 Importar planilha de gastos (Excel)
        <input type="file" id="cf-import" accept=".xlsx" hidden></label>
      <span id="cf-import-prog" class="small muted"></span>
      <input class="search" id="cf-busca" placeholder="🔎 Buscar por origem, descrição, categoria, conta ou documento…" style="max-width:340px">
      <span class="small muted">clique num lançamento para ver de onde veio</span>
      <div class="spacer"></div>
      <span class="muted small" id="cf-contagem"></span>
      <button class="btn" onclick="CF.exportCsv()">⬇ Exportar CSV/Excel</button>
    </div>
    <div id="cf-tabela"></div>`;

  /* O seletor lista os meses que têm lançamento, mais o mês corrente e o
     que estiver escolhido — assim navegar com as setas para um mês vazio
     não deixa o seletor sem opção correspondente. */
  const montarSeletor = () => {
    const meses = [...new Set(mesesComLancamento.concat([mesAtual, periodo].filter(Boolean)))]
      .sort().reverse();
    document.getElementById('cf-mes').innerHTML =
      ['<option value="">Todo o período</option>']
        .concat(meses.map(m => `<option value="${m}"${m === periodo ? ' selected' : ''}>${
          App.esc(rotuloMes(m))}${mesesComLancamento.includes(m) ? '' : ' (sem lançamentos)'}</option>`)).join('');
  };

  const renderKpis = () => {
    const lista = doMes(periodo);
    const ent = somar(lista, 'entrada');
    const sai = somar(lista, 'saida');
    const saldoMes = Math.round((ent - sai) * 100) / 100;
    const acum = Math.round(acumuladoAte(periodo) * 100) / 100;
    const anterior = Math.round((acum - saldoMes) * 100) / 100;

    document.getElementById('cf-kpis').innerHTML = `
      <div class="card kpi k-ok"><div class="label">Entradas ${periodo ? 'do mês' : 'no período'}</div>
        <div class="value money">${App.money(ent)}</div></div>
      <div class="card kpi k-danger"><div class="label">Saídas ${periodo ? 'do mês' : 'no período'}</div>
        <div class="value money">${App.money(sai)}</div></div>
      <div class="card kpi ${saldoMes >= 0 ? 'k-ok' : 'k-danger'}">
        <div class="label">Saldo ${periodo ? 'do mês' : 'do período'}</div>
        <div class="value money">${App.money(saldoMes)}</div>
        <div class="hint">${ent ? App.money(ent) : '0,00'} − ${sai ? App.money(sai) : '0,00'}</div></div>
      <div class="card kpi ${acum >= 0 ? 'k-ok' : 'k-danger'}">
        <div class="label">Saldo acumulado</div>
        <div class="value money">${App.money(acum)}</div>
        <div class="hint">${periodo
          ? `${App.money(anterior)} de meses anteriores ${saldoMes >= 0 ? '+' : '−'} ${App.money(Math.abs(saldoMes))} deste mês`
          : 'todo o histórico'}</div></div>`;

    document.getElementById('cf-periodo-info').textContent = periodo
      ? `${lista.length} lançamento(s) em ${rotuloMes(periodo)}`
      : `${flows.length} lançamento(s) em todo o histórico`;
  };



  /* Busca sem acento e por pedaço em todos os campos que descrevem o
     lançamento — é como se acha "aquela saída da Sanepar de agosto". */
  const renderCF = () => {
    montarSeletor();
    renderKpis();
    const list = App.filtraPor(doMes(periodo), document.getElementById('cf-busca').value,
      ['origem', 'descricao', 'categoria', 'conta', 'documento', 'data',
        f => f.tipo === 'entrada' ? 'entrada' : 'saida']);
    document.getElementById('cf-contagem').textContent =
      `${list.length} lançamento(s)${list.length > 200 ? ' — mostrando os 200 mais recentes' : ''}`;
    document.getElementById('cf-tabela').innerHTML = App.table(list.slice(0, 200), [
      { h: 'Data', sort: f => f.data || '', cell: f => App.date(f.data) },
      { h: 'Tipo', sort: f => f.tipo || '', sortDesc: false,
        cell: f => f.tipo === 'entrada' ? '<span class="badge ok">Entrada</span>' : '<span class="badge danger">Saída</span>' },
      { h: 'Origem', sort: f => f.origem || f.descricao || '', sortDesc: false,
        cell: f => `${App.esc(f.origem || f.descricao || '—')}<div class="small muted">${App.esc(f.descricao !== f.origem ? f.descricao || '' : '')}</div>` },
      { h: 'Categoria', sort: f => f.categoria || '', sortDesc: false,
        cell: f => `<span class="small muted">${App.esc(f.categoria || '—')}</span>` },
      { h: 'Conta', cell: f => App.esc(f.conta || '—') },
      { h: 'Documento', cell: f => App.esc(f.documento || '—') },
      { h: 'Valor', class: 'num', sort: f => Number(f.valor) || 0,
        cell: f => `<b class="${f.tipo === 'entrada' ? 'pos' : 'neg'}">${f.tipo === 'entrada' ? '+' : '−'} R$ ${App.money(f.valor)}</b>` },
      ...(podeEditarCF ? [{ h: '', class: 'num', cell: f => manualCF(f)
        ? `<button class="btn sm ghost" onclick="CF.editar(${f.id})" title="Editar este lançamento">✏️ Editar</button>
           <button class="btn sm ghost" onclick="CF.excluir(${f.id})" title="Excluir este lançamento">🗑️ Excluir</button>`
        : `<span class="small muted" title="Veio de ${App.esc(CF_ORIGEM[f.refType] || f.refType)} — desfaça por lá para os dois lados baterem">automático</span>` }] : [])
    ], {
      emptyMsg: periodo
        ? `Nenhum lançamento em ${rotuloMes(periodo)} — use as setas para procurar outro mês.`
        : 'Nenhum lançamento — os módulos de vendas, contas e compras alimentam o caixa automaticamente',
      sortState: ordemCF,
      onSort: (o) => { ordemCF = o; renderCF(); },
      onRow: (f) => CF.detalhe(f.id)
    });
  };
  renderCF();
  document.getElementById('cf-busca').addEventListener('input', renderCF);

  /* Trocar de mês recalcula tudo: entradas, saídas, saldo do mês, acumulado
     e a lista. A busca digitada continua valendo. */
  const irPara = (m) => { periodo = m; renderCF(); };
  document.getElementById('cf-mes').addEventListener('change', e => irPara(e.target.value));
  document.getElementById('cf-ant').onclick = () => irPara(somarMeses(periodo || mesAtual, -1));
  document.getElementById('cf-prox').onclick = () => irPara(somarMeses(periodo || mesAtual, 1));
  document.getElementById('cf-hoje').onclick = () => irPara(mesAtual);
  document.getElementById('cf-todos').onclick = () => irPara('');

  document.getElementById('cf-import').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const prog = document.getElementById('cf-import-prog');
    prog.textContent = 'Lendo a planilha…';
    try {
      const r = await fetch('/api/cashflow/import-xlsx', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + App.token() },
        body: f
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Falha ao ler a planilha');
      prog.textContent = '';
      e.target.value = '';
      CF.importPreview(data);
    } catch (err) {
      prog.textContent = '';
      e.target.value = '';
      App.toast(err.message, 'err');
    }
  });

  window.CF = {
    importPreview(data) {
      const rs = data.resumo;
      const novosRows = data.rows.filter(x => !x.jaExiste);
      const meses = {};
      for (const x of novosRows) {
        const m = x.data.slice(0, 7);
        meses[m] = meses[m] || { entrada: 0, saida: 0 };
        meses[m][x.tipo] += x.valor;
      }
      const mesesOrd = Object.keys(meses).sort();
      const mesNome = m => {
        const n = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
        return n[Number(m.slice(5, 7)) - 1] + '/' + m.slice(2, 4);
      };
      const m = App.modal(`
        <h2>📥 Importar planilha de gastos</h2>
        <p class="small muted">Encontrei <b>${rs.saidas} gastos</b> (R$ ${App.money(rs.totalSaidas)}) e
        <b>${rs.entradas} entradas</b> (R$ ${App.money(rs.totalEntradas)}) na planilha.</p>
        ${rs.repetidos ? `<p class="small" style="margin-top:6px"><span class="badge info">${rs.repetidos} já estavam no sistema</span>
          <span class="muted">— importações repetidas não duplicam nada.</span></p>` : ''}
        <div class="card" style="margin-top:10px;background:var(--bg-1)">
          <b>Vai entrar agora: ${rs.novos} lançamento(s)</b>
          <div class="small muted" style="margin:4px 0 8px">Saídas novas: R$ ${App.money(rs.novosSaidas)} ·
          Entradas novas: R$ ${App.money(rs.novosEntradas)}</div>
          ${mesesOrd.length ? `<table style="font-size:12.5px"><tr><th>Mês</th><th class="num">Entradas</th><th class="num">Saídas</th></tr>
            ${mesesOrd.map(k => `<tr><td>${mesNome(k)}</td>
              <td class="num pos">R$ ${App.money(meses[k].entrada)}</td>
              <td class="num neg">R$ ${App.money(meses[k].saida)}</td></tr>`).join('')}</table>` : ''}
        </div>
        ${data.avisos.length ? `<p class="small muted" style="margin-top:8px">⚠ ${data.avisos.length} linha(s) ignorada(s) por falta de valor:<br>
          ${data.avisos.slice(0, 5).map(a => App.esc(a)).join('<br>')}${data.avisos.length > 5 ? '<br>…' : ''}</p>` : ''}
        <p class="small muted" style="margin-top:8px">As categorias (componentes, salários, impostos…) foram sugeridas
        automaticamente pela descrição — alimentam a DRE e podem ser ajustadas depois.</p>
        <div class="actions">
          <button class="btn" onclick="App.closeModal()">Cancelar</button>
          <button class="btn primary" id="cf-imp-ok" ${rs.novos ? '' : 'disabled'}>
            ${rs.novos ? 'Importar ' + rs.novos + ' lançamento(s)' : 'Nada novo para importar'}</button>
        </div>`, { wide: true });
      m.querySelector('#cf-imp-ok').onclick = async () => {
        const r = await App.post('/cashflow/import-confirm', { rows: novosRows });
        App.closeModal();
        App.toast(`${r.inseridos} lançamento(s) importado(s)${r.pulados ? ' · ' + r.pulados + ' já existiam' : ''}`, 'ok');
        App.route();
      };
    },
    manual() {
      App.form('Lançamento manual no caixa', [
        { name: 'tipo', label: 'Tipo', type: 'select', value: 'entrada',
          options: [{ value: 'entrada', label: 'Entrada' }, { value: 'saida', label: 'Saída' }] },
        { name: 'valor', label: 'Valor (R$)', type: 'number', step: '0.01', required: true },
        { name: 'data', label: 'Data efetiva', type: 'date', value: App.today(), required: true },
        { name: 'conta', label: 'Conta bancária', value: 'principal' },
        { name: 'categoria', label: 'Categoria', type: 'select', value: 'despesa_operacional', options:
          [['venda_cabecote', 'Venda de cabeçote'], ['venda_peca', 'Venda de peça'], ['servico', 'Serviço']]
            .concat(CATS_PAG).map(([v, l]) => ({ value: v, label: l })) },
        { name: 'origem', label: 'Origem / descrição', required: true, full: true },
        { name: 'documento', label: 'Documento' }
      ], async d => {
        d.valor = Number(d.valor);
        await App.post('/cashflow', d);
        App.closeModal(); App.toast('Lançamento registrado', 'ok'); App.route();
      });
    },
    /**
     * Detalhe do lançamento: de onde veio aquele dinheiro, sem sair do caixa.
     * A lista principal continua enxuta — tudo isto só aparece no clique.
     */
    async detalhe(id) {
      let d;
      try { d = await App.get(`/cashflow/${id}/detalhe`); }
      catch (e) { return App.toast(e.message, 'err'); }
      const c = d.lancamento, o = d.origem;
      const entrada = c.tipo === 'entrada';
      const linha = (rotulo, valor, cls) => valor === '' || valor === null || valor === undefined
        ? '' : `<tr><td class="muted">${rotulo}</td><td class="num ${cls || ''}">${valor}</td></tr>`;

      /* Parcial ou total sai do que já entrou antes mais este lançamento
         contra o valor do documento — não é um campo guardado. */
      let resumo = '';
      if (o && o.valorTotal > 0) {
        const acumulado = (o.recebidoAntes || 0) + (o.valorLancamento || 0);
        const pct = Math.round(o.valorLancamento / o.valorTotal * 100);
        const quitado = Math.abs(o.saldo) < 0.005;
        resumo = `<div class="card" style="margin:10px 0;border-left:3px solid var(--${quitado ? 'ok' : 'accent'})">
          <b>${quitado && (o.recebidoAntes || 0) === 0
            ? `${entrada ? 'Recebimento' : 'Pagamento'} total`
            : `${entrada ? 'Recebimento' : 'Pagamento'} parcial — ${pct}% do total`}</b>
          <div class="small muted" style="margin-top:3px">
            ${App.money(acumulado)} de ${App.money(o.valorTotal)} ${entrada ? 'recebidos' : 'pagos'} até aqui${
              quitado ? ' · quitado' : ` · faltam R$ ${App.money(o.saldo)}`}</div>
        </div>`;
      }

      App.modal(`
        <h2>${entrada ? '↧ Entrada' : '↥ Saída'} de R$ ${App.money(c.valor)}</h2>
        <p class="small muted">${App.date(c.data)} · ${App.esc(c.origem || c.descricao || '—')}
          ${c.categoria ? ' · ' + App.esc(c.categoria) : ''}
          ${c.conta ? ' · conta ' + App.esc(c.conta) : ''}</p>

        ${!o ? `<div class="card" style="margin-top:10px">
            <b>Lançamento manual</b>
            <div class="small muted" style="margin-top:3px">Não veio de outro módulo — foi digitado direto no caixa.</div>
            ${c.documento ? `<div class="small" style="margin-top:6px">Documento: ${App.esc(c.documento)}</div>` : ''}
            ${c.descricao ? `<div class="small">Descrição: ${App.esc(c.descricao)}</div>` : ''}
          </div>` : `
          <h3 class="section-title">${App.esc(o.tipo)} — ${App.esc(o.titulo)}</h3>
          ${resumo}
          <table style="font-size:13.5px">
            ${linha('Cliente', o.cliente ? App.esc(o.cliente) : '')}
            ${linha('Fornecedor', o.fornecedor ? App.esc(o.fornecedor) : '')}
            ${linha('Colaborador', o.colaborador ? App.esc(o.colaborador) : '')}
            ${linha('Cabeçote', [o.modelo, o.identificacao].filter(Boolean).map(x => App.esc(x)).join(' · ') || '')}
            ${linha(entrada ? 'Valor total da venda/serviço' : 'Valor total do documento',
              o.valorTotal ? '<b>R$ ' + App.money(o.valorTotal) + '</b>' : '')}
            ${linha(entrada ? 'Já recebido antes deste' : 'Já pago antes deste',
              o.recebidoAntes ? 'R$ ' + App.money(o.recebidoAntes) : 'R$ 0,00')}
            ${linha(entrada ? 'Este recebimento' : 'Este pagamento',
              '<b class="' + (entrada ? 'pos' : 'neg') + '">R$ ' + App.money(o.valorLancamento) + '</b>')}
            ${linha('Saldo em aberto', o.valorTotal
              ? '<b class="' + (Math.abs(o.saldo) < 0.005 ? 'pos' : 'neg') + '">R$ ' + App.money(o.saldo) + '</b>' : '')}
            ${linha('Parcela', o.parcela ? `${o.parcela}${o.parcelas ? ' de ' + o.parcelas : ''}` : (o.parcelas > 1 ? `de ${o.parcelas}` : ''))}
            ${linha('Vencimento', o.vencimento ? App.date(o.vencimento) : '')}
            ${linha('Agendado para', o.agendado ? App.date(o.agendado) : '')}
            ${linha('Forma de pagamento', o.forma ? App.esc(o.forma) : '')}
            ${linha('Categoria', o.categoria ? App.esc(o.categoria) : '')}
            ${linha('Documento', o.documento ? App.esc(o.documento) : '')}
            ${linha(entrada ? 'Data do recebimento' : 'Data do pagamento', App.date(o.data))}
            ${linha('Situação', o.status ? App.badge(o.status) : '')}
          </table>
          ${(o.itens || []).length ? `<h3 class="section-title">${entrada ? 'Serviços / produtos' : 'Itens'}</h3>
            <ul style="margin:0 0 0 18px;line-height:1.7;font-size:13px">
              ${o.itens.map(i => `<li>${App.esc(i)}</li>`).join('')}</ul>` : ''}
          ${o.observacoes ? `<h3 class="section-title">Observações</h3><p>${App.esc(o.observacoes)}</p>` : ''}`}

        <div class="actions">
          <button class="btn" onclick="App.closeModal()">Fechar</button>
          ${o && o.atalho ? `<button class="btn primary" onclick="App.closeModal();location.hash='${o.atalho}'">Abrir ${App.esc(o.tipo.toLowerCase())}</button>` : ''}
        </div>`, { wide: true });
    },
    /* Só lançamento manual: o automático é reflexo de outro registro e se
       desfaz na origem, que estorna os dois lados de uma vez. */
    editar(id) {
      const f = flows.find(x => x.id === id);
      if (!f) return;
      App.form('Editar lançamento do caixa', [
        { name: 'tipo', label: 'Tipo', type: 'select', value: f.tipo,
          options: [{ value: 'entrada', label: 'Entrada' }, { value: 'saida', label: 'Saída' }] },
        { name: 'valor', label: 'Valor (R$)', type: 'number', step: '0.01', value: f.valor, required: true },
        { name: 'data', label: 'Data efetiva', type: 'date', value: f.data, required: true },
        { name: 'conta', label: 'Conta bancária', value: f.conta || 'principal' },
        { name: 'categoria', label: 'Categoria', type: 'select', value: f.categoria, options:
          [['venda_cabecote', 'Venda de cabeçote'], ['venda_peca', 'Venda de peça'], ['servico', 'Serviço']]
            .concat(CATS_PAG).map(([v, l]) => ({ value: v, label: l })) },
        { name: 'origem', label: 'Origem / descrição', value: f.origem || '', required: true, full: true },
        { name: 'documento', label: 'Documento', value: f.documento || '' }
      ], async d => {
        d.valor = Number(d.valor);
        await App.put('/cashflow/' + id, d);
        App.closeModal(); App.toast('Lançamento corrigido', 'ok'); App.route();
      });
    },
    excluir(id) {
      const f = flows.find(x => x.id === id);
      App.excluirLancamento(`/cashflow/${id}`, 'este lançamento',
        { nome: f ? `${f.tipo === 'entrada' ? 'Entrada' : 'Saída'} de R$ ${App.money(f.valor)} em ${App.date(f.data)} — ${f.origem || f.descricao || 'manual'}` : null });
    },
    /* Exporta o que está na tela: o mês escolhido, não o histórico inteiro —
       senão o arquivo nunca bate com os números que a pessoa está vendo. */
    exportCsv() {
      App.exportCsv(`fluxo-de-caixa${periodo ? '-' + periodo : ''}.csv`, doMes(periodo).map(f => ({
        data: App.date(f.data), tipo: f.tipo, origem: f.origem || '', categoria: f.categoria || '',
        conta: f.conta || '', documento: f.documento || '',
        valor: (f.tipo === 'entrada' ? '' : '-') + String(f.valor).replace('.', ',')
      })));
    }
  };
});

/* ================= PROJEÇÃO FINANCEIRA ================= */
App.registerView('projection', async (view) => {
  App.setTitle('Projeção financeira', 'Parcelas futuras, contas futuras e compromissos cadastrados');
  const p = await App.get('/projection');
  const nomes = { 7: '7 dias', 30: '30 dias', 60: '60 dias', 90: '90 dias', 180: '6 meses', 365: '1 ano' };

  view.innerHTML = `
    ${(p.vencidoReceber || p.vencidoPagar) ? `
    <div class="divergent">⚠ Existem valores já vencidos fora da projeção:
      a receber <b>R$ ${App.money(p.vencidoReceber)}</b> · a pagar <b>R$ ${App.money(p.vencidoPagar)}</b></div>` : ''}
    <div class="tablewrap"><table>
      <thead><tr><th>Período</th><th>Até</th><th class="num">A receber</th><th class="num">A pagar</th><th class="num">Saldo projetado</th></tr></thead>
      <tbody>${p.janelas.map(j => `
        <tr>
          <td><b>Próximos ${nomes[j.dias]}</b></td>
          <td>${App.date(j.limite)}</td>
          <td class="num pos">R$ ${App.money(j.aReceber)}</td>
          <td class="num neg">R$ ${App.money(j.aPagar)}</td>
          <td class="num"><b class="${j.saldoProjetado >= 0 ? 'pos' : 'neg'}">R$ ${App.money(j.saldoProjetado)}</b></td>
        </tr>`).join('')}</tbody>
    </table></div>
    <p class="small muted" style="margin-top:10px">A projeção considera todas as parcelas em aberto de contas a receber
    (boletos, cartões) e todas as contas a pagar cadastradas (incluindo compras parceladas e faturas de fornecedores),
    acumuladas até o fim de cada período.</p>`;
});

/* ================= DRE ================= */
App.registerView('dre', async (view) => {
  const month = App.today().slice(0, 7);
  App.setTitle('DRE / Resultado', 'Demonstrativo gerencial mensal — regime de caixa categorizado');

  const load = async (m) => {
    const d = await App.get('/dre?mes=' + m);
    const lines = (obj) => Object.entries(obj.linhas).map(([l, v]) =>
      `<tr><td style="padding-left:26px">${App.esc(l)}</td><td class="num">R$ ${App.money(v)}</td></tr>`).join('');
    document.getElementById('dre-body').innerHTML = `
      <div class="grid cols-3" style="margin-bottom:14px">
        <div class="card kpi"><div class="label">Receita (caixa)</div><div class="value money">${App.money(d.receita.total)}</div>
          <div class="hint">Competência: R$ ${App.money(d.receitaCompetencia.total)} (vendas + serviços do mês)</div></div>
        <div class="card kpi ${d.lucroLiquido >= 0 ? 'k-ok' : 'k-danger'}"><div class="label">Lucro líquido</div><div class="value money">${App.money(d.lucroLiquido)}</div></div>
        <div class="card kpi"><div class="label">Margem líquida</div><div class="value">${d.margemLiquida.toFixed(1)}%</div></div>
      </div>
      <div class="tablewrap"><table>
        <tr><td><b>RECEITA</b></td><td class="num"><b>R$ ${App.money(d.receita.total)}</b></td></tr>
        ${lines(d.receita)}
        <tr><td><b>(−) CUSTOS</b></td><td class="num"><b class="neg">R$ ${App.money(d.custos.total)}</b></td></tr>
        ${lines(d.custos)}
        <tr style="background:var(--accent-dim)"><td><b>= LUCRO BRUTO</b></td>
          <td class="num"><b>R$ ${App.money(d.lucroBruto)}</b></td></tr>
        <tr><td><b>(−) DESPESAS OPERACIONAIS</b></td><td class="num"><b class="neg">R$ ${App.money(d.despesasOperacionais.total)}</b></td></tr>
        ${lines(d.despesasOperacionais)}
        <tr><td><b>(−) DESPESAS FINANCEIRAS</b></td><td class="num"><b class="neg">R$ ${App.money(d.despesasFinanceiras.total)}</b></td></tr>
        ${lines(d.despesasFinanceiras)}
        <tr style="background:var(--accent-dim)"><td><b>= LUCRO LÍQUIDO</b></td>
          <td class="num"><b class="${d.lucroLiquido >= 0 ? 'pos' : 'neg'}">R$ ${App.money(d.lucroLiquido)}</b></td></tr>
      </table></div>`;
  };

  view.innerHTML = `
    <div class="toolbar">
      <input type="month" id="dre-mes" value="${month}" style="max-width:180px">
      <div class="spacer"></div>
      <button class="btn" onclick="window.print()">🖨️ Imprimir DRE</button>
    </div>
    <div id="dre-body"></div>`;
  await load(month);
  document.getElementById('dre-mes').addEventListener('change', e => load(e.target.value));
});
