/* Financeiro: contas a pagar (agenda de sextas), recorrentes, contas a receber,
   fluxo de caixa, projeção e DRE */
'use strict';

const CATS_PAG = [
  ['agua', 'Água'], ['energia', 'Energia'], ['telefone', 'Telefone'], ['internet', 'Internet'],
  ['aluguel', 'Aluguel'], ['componentes', 'Fornecedores / componentes'], ['materiais', 'Materiais'],
  ['consorcio', 'Consórcio (veículos da empresa)'], ['impostos', 'Impostos'], ['salarios', 'Salários'],
  ['beneficios', 'Benefícios'], ['manutencao', 'Manutenção'], ['sistemas', 'Sistemas'],
  ['marketing', 'Marketing'], ['tarifas', 'Tarifas bancárias'], ['juros', 'Juros'],
  ['despesa_operacional', 'Outras despesas operacionais'], ['despesa_financeira', 'Outras despesas financeiras']
];

/* ================= CONTAS A PAGAR ================= */
App.registerView('payables', async (view) => {
  App.setTitle('Contas a pagar', 'Agenda de pagamentos às sextas-feiras + pagamentos imediatos');
  const [payables, agenda, recurring, suppliers] = await Promise.all([
    App.get('/payables'), App.get('/payables/agenda'), App.get('/recurring'), App.get('/suppliers')]);

  const openTotal = payables.filter(p => p.status !== 'pago').reduce((s, p) => s + p.valor, 0);
  const overdue = payables.filter(p => p.status === 'vencida');
  const dow = d => ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][new Date(d + 'T12:00:00').getDay()];

  view.innerHTML = `
    <div class="toolbar">
      <button class="btn primary" onclick="Pay.create()">+ Nova conta</button>
      <button class="btn" onclick="Pay.recurringList()">↻ Contas recorrentes (${recurring.filter(r => r.ativo).length})</button>
      <div class="spacer"></div>
      <span class="badge ${overdue.length ? 'danger' : 'ok'}">${overdue.length} vencida(s)</span>
      <span class="badge">Total em aberto: R$ ${App.money(openTotal)}</span>
      <button class="btn" onclick="Pay.print()">🖨️ Imprimir agenda</button>
    </div>

    <div class="section-title">AGENDA DE PAGAMENTOS (agrupada por data programada)</div>
    ${agenda.length ? agenda.map(g => `
      <div class="card" style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <b>${App.date(g.data)} <span class="muted small">(${dow(g.data)})</span>
          ${dow(g.data) === 'sex' ? '<span class="badge accent">dia de pagamento</span>' : ''}
          ${g.data < App.today() ? '<span class="badge danger">atrasado</span>' : ''}</b>
          <b>R$ ${App.money(g.total)}</b>
        </div>
        ${App.table(g.contas, [
          { h: 'Conta', cell: p => `${App.esc(p.descricao)}${p.tipoPagamento === 'imediato' ? ' <span class="badge info">imediato</span>' : ''}` },
          { h: 'Categoria', cell: p => `<span class="small muted">${(CATS_PAG.find(c => c[0] === p.categoria) || [null, p.categoria])[1]}</span>` },
          { h: 'Vencimento', cell: p => App.date(p.vencimento) },
          { h: 'Documento', cell: p => App.esc(p.documento || '—') },
          { h: 'Valor', class: 'num', cell: p => App.moneyHtml(p.valor) },
          { h: 'Status', cell: p => App.badge(p.status) },
          { h: '', class: 'num', cell: p => `<button class="btn sm primary" onclick="Pay.pay(${p.id})">✓ Pagar</button>` }
        ])}
      </div>`).join('') : '<div class="card"><div class="empty">Nenhuma conta em aberto 🎉</div></div>'}

    <div class="section-title muted">Pagas recentemente</div>
    ${App.table(payables.filter(p => p.status === 'pago').slice(-15).reverse(), [
      { h: 'Conta', cell: p => App.esc(p.descricao) },
      { h: 'Pago em', cell: p => App.date(p.dataPagamento) },
      { h: 'Valor', class: 'num', cell: p => App.moneyHtml(p.valor) },
      { h: 'Status', cell: p => App.badge('pago') }
    ], { emptyMsg: 'Nenhum pagamento ainda' })}`;

  window.Pay = {
    create() {
      App.form('Nova conta a pagar', [
        { name: 'descricao', label: 'Descrição', required: true, full: true },
        { name: 'categoria', label: 'Categoria', type: 'select', value: 'despesa_operacional',
          options: CATS_PAG.map(([v, l]) => ({ value: v, label: l })) },
        { name: 'fornecedorId', label: 'Fornecedor (opcional)', type: 'select', value: '',
          options: [{ value: '', label: '—' }].concat(suppliers.map(s => ({ value: s.id, label: s.nome }))) },
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
          { name: 'instrucao', label: 'Instrução (ex.: emitir boleto no site)', value: r.instrucao, full: true },
          { name: 'ativo', label: 'Ativa', type: 'checkbox', value: r.ativo !== false }
        ], async d => {
          d.diaVencimento = Number(d.diaVencimento);
          if (id) await App.put('/recurring/' + id, d);
          else await App.post('/recurring', d);
          App.closeModal(); App.toast('Conta recorrente salva', 'ok');
        });
      });
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
});

/* ================= CONTAS A RECEBER ================= */
App.registerView('receivables', async (view) => {
  App.setTitle('Contas a receber', 'Boletos, cartões, Pix — com geração automática de parcelas');
  const [receivables, clients] = await Promise.all([App.get('/receivables'), App.get('/clients')]);
  receivables.sort((a, b) => (a.vencimento || '') < (b.vencimento || '') ? -1 : 1);

  const open = receivables.filter(r => r.status === 'aberto' || r.status === 'vencida');
  const totalOpen = open.reduce((s, r) => s + r.valor, 0);
  const totalOverdue = open.filter(r => r.status === 'vencida').reduce((s, r) => s + r.valor, 0);

  view.innerHTML = `
    <div class="toolbar">
      <button class="btn primary" onclick="Recv.generate()">+ Gerar boletos / parcelas</button>
      <select id="rf" style="max-width:180px"><option value="">Todos</option>
        <option value="aberto">Em aberto</option><option value="vencida">Vencidas</option>
        <option value="paga">Pagas</option><option value="cancelada">Canceladas</option></select>
      <div class="spacer"></div>
      <span class="badge ${totalOverdue ? 'danger' : 'ok'}">Vencido: R$ ${App.money(totalOverdue)}</span>
      <span class="badge">Em aberto: R$ ${App.money(totalOpen)}</span>
      <button class="btn" onclick="Recv.print()">🖨️ Imprimir</button>
    </div>
    <div id="r-table"></div>`;

  const render = () => {
    const f = document.getElementById('rf').value;
    const list = receivables.filter(r => !f || r.status === f);
    document.getElementById('r-table').innerHTML = App.table(list, [
      { h: 'Cliente', cell: r => `<b>${App.esc(App.clientName(r.clienteId, clients))}</b>` },
      { h: 'Descrição', cell: r => `<span class="small">${App.esc(r.descricao)}</span>` },
      { h: 'Forma', cell: r => App.esc(r.forma || '—') },
      { h: 'Parcela', cell: r => r.parcelas > 1 ? `${r.parcela}/${r.parcelas}` : 'única' },
      { h: 'Vencimento', cell: r => App.date(r.vencimento) },
      { h: 'Valor', class: 'num', cell: r => App.moneyHtml(r.valor) },
      { h: 'Status', cell: r => App.badge(r.status) },
      { h: '', class: 'num', cell: r => (r.status === 'aberto' || r.status === 'vencida') ? `
        <button class="btn sm primary" onclick="Recv.receive(${r.id})">✓ Receber</button>
        <button class="btn sm ghost" onclick="Recv.cancel(${r.id})">✕</button>` : '' }
    ], { emptyMsg: 'Nenhum recebível' });
  };
  render();
  document.getElementById('rf').addEventListener('change', render);

  window.Recv = {
    generate() {
      const m = App.form('Gerar boletos / parcelas automáticas', [
        { name: 'clienteId', label: 'Cliente', type: 'select', required: true, full: true,
          options: App.clientOptions(clients) },
        { name: 'descricao', label: 'Descrição', value: 'Boleto', full: true },
        { name: 'dataVenda', label: 'Data da venda', type: 'date', value: App.today(), required: true },
        { name: 'valor', label: 'Valor total (R$)', type: 'number', step: '0.01', required: true },
        { name: 'parcelas', label: 'Nº de parcelas', type: 'number', value: 3, required: true },
        { name: 'intervaloDias', label: 'Intervalo entre parcelas (dias)', type: 'number', value: 20, required: true },
        { name: 'forma', label: 'Forma', type: 'select', value: 'boleto',
          options: ['boleto', 'pix', 'cartao', 'cheque', 'outro'].map(v => ({ value: v, label: v })) }
      ], async d => {
        const out = await App.post('/receivables/generate', {
          clienteId: Number(d.clienteId), descricao: d.descricao, dataVenda: d.dataVenda,
          valor: Number(d.valor), parcelas: Number(d.parcelas), intervaloDias: Number(d.intervaloDias), forma: d.forma
        });
        App.closeModal();
        App.toast(`${out.length} parcela(s) geradas: ` + out.map(p => App.date(p.vencimento)).join(', '), 'ok');
        App.route();
      });
      // pré-visualização das parcelas ao digitar
      const preview = document.createElement('div');
      preview.className = 'small muted'; preview.style.margin = '4px 0 10px';
      m.querySelector('.actions').before(preview);
      m.addEventListener('input', () => {
        const g = n => m.querySelector(`[name=${n}]`).value;
        const valor = Number(g('valor')) || 0, n = Number(g('parcelas')) || 1, int = Number(g('intervaloDias')) || 30;
        if (!valor) { preview.textContent = ''; return; }
        const base = new Date(g('dataVenda') + 'T12:00:00');
        const parts = [];
        for (let i = 1; i <= Math.min(n, 12); i++) {
          const dt = new Date(base); dt.setDate(dt.getDate() + int * i);
          parts.push(`${i}ª — ${dt.toLocaleDateString('pt-BR')} — R$ ${App.money(valor / n)}`);
        }
        preview.innerHTML = '<b>Pré-visualização:</b><br>' + parts.join('<br>');
      });
    },
    receive(id) {
      const r = receivables.find(x => x.id === id);
      App.form(`Receber: ${r.descricao} — R$ ${App.money(r.valor)}`, [
        { name: 'data', label: 'Data do recebimento', type: 'date', value: App.today(), required: true },
        { name: 'conta', label: 'Conta bancária', value: 'principal' }
      ], async d => {
        await App.post(`/receivables/${id}/receive`, d);
        App.closeModal(); App.toast('Recebimento lançado no fluxo de caixa', 'ok'); App.route();
      });
    },
    async cancel(id) {
      if (!await App.confirm('Cancelar esta parcela?')) return;
      await App.post(`/receivables/${id}/cancel`, {});
      App.route();
    },
    print() {
      const f = document.getElementById('rf').value;
      const list = receivables.filter(r => !f || r.status === f);
      App.print('Contas a receber' + (f ? ' — ' + (App.STATUS[f] || [f])[0] : ''),
        `<table><tr><th>Cliente</th><th>Descrição</th><th>Parcela</th><th>Vencimento</th><th class="num">Valor</th><th>Status</th></tr>
        ${list.map(r => `<tr><td>${App.esc(App.clientName(r.clienteId, clients))}</td><td>${App.esc(r.descricao)}</td>
        <td>${r.parcelas > 1 ? r.parcela + '/' + r.parcelas : 'única'}</td><td>${App.date(r.vencimento)}</td>
        <td class="num">R$ ${App.money(r.valor)}</td><td>${(App.STATUS[r.status] || [r.status])[0]}</td></tr>`).join('')}</table>`,
        list.length + ' título(s)');
    }
  };
});

/* ================= FLUXO DE CAIXA ================= */
App.registerView('cashflow', async (view) => {
  App.setTitle('Fluxo de caixa', 'Quando o dinheiro efetivamente entrou ou saiu — não confundir com a DRE');
  const flows = await App.get('/cashflow');
  flows.sort((a, b) => (a.data < b.data ? 1 : -1) || b.id - a.id);
  const saldo = flows.reduce((s, f) => s + (f.tipo === 'entrada' ? f.valor : -f.valor), 0);
  const month = App.today().slice(0, 7);
  const inMonth = flows.filter(f => (f.data || '').slice(0, 7) === month);
  const entradasMes = inMonth.filter(f => f.tipo === 'entrada').reduce((s, f) => s + f.valor, 0);
  const saidasMes = inMonth.filter(f => f.tipo === 'saida').reduce((s, f) => s + f.valor, 0);

  view.innerHTML = `
    <div class="grid cols-3">
      <div class="card kpi ${saldo >= 0 ? 'k-ok' : 'k-danger'}"><div class="label">Saldo acumulado</div><div class="value money">${App.money(saldo)}</div></div>
      <div class="card kpi k-ok"><div class="label">Entradas no mês</div><div class="value money">${App.money(entradasMes)}</div></div>
      <div class="card kpi k-danger"><div class="label">Saídas no mês</div><div class="value money">${App.money(saidasMes)}</div></div>
    </div>
    <div class="toolbar" style="margin-top:14px">
      <button class="btn" onclick="CF.manual()">+ Lançamento manual</button>
      <div class="spacer"></div>
      <button class="btn" onclick="CF.exportCsv()">⬇ Exportar CSV/Excel</button>
    </div>
    ${App.table(flows.slice(0, 100), [
      { h: 'Data', cell: f => App.date(f.data) },
      { h: 'Tipo', cell: f => f.tipo === 'entrada' ? '<span class="badge ok">Entrada</span>' : '<span class="badge danger">Saída</span>' },
      { h: 'Origem', cell: f => `${App.esc(f.origem || f.descricao || '—')}<div class="small muted">${App.esc(f.descricao !== f.origem ? f.descricao || '' : '')}</div>` },
      { h: 'Categoria', cell: f => `<span class="small muted">${App.esc(f.categoria || '—')}</span>` },
      { h: 'Conta', cell: f => App.esc(f.conta || '—') },
      { h: 'Documento', cell: f => App.esc(f.documento || '—') },
      { h: 'Valor', class: 'num', cell: f => `<b class="${f.tipo === 'entrada' ? 'pos' : 'neg'}">${f.tipo === 'entrada' ? '+' : '−'} R$ ${App.money(f.valor)}</b>` }
    ], { emptyMsg: 'Nenhum lançamento — os módulos de vendas, contas e compras alimentam o caixa automaticamente' })}`;

  window.CF = {
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
    exportCsv() {
      App.exportCsv('fluxo-de-caixa.csv', flows.map(f => ({
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
