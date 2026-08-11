/* Dashboard principal + Minhas pendências */
'use strict';

App.registerView('dashboard', async (view) => {
  App.setTitle('Dashboard', 'Visão geral da operação — ' + new Date().toLocaleDateString('pt-BR'));
  const d = await App.get('/dashboard');
  const fin = App.can('finance_sensitive');

  const kpi = (label, value, opts = {}) => `
    <div class="card kpi ${opts.cls || ''}">
      <div class="label">${label}</div>
      <div class="value ${opts.money ? 'money' : ''}">${opts.money ? App.money(value) : value}</div>
      ${opts.hint ? `<div class="hint">${opts.hint}</div>` : ''}
    </div>`;

  const tasksHtml = d.minhasPendencias.length
    ? d.minhasPendencias.map(t => `
        <li style="display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px solid var(--line-soft)">
          <div>
            <div>${App.esc(t.titulo)}</div>
            <div class="small muted">${App.esc(t.descricao || t.origem || '')}</div>
          </div>
          <div style="text-align:right;flex:none">
            ${t.due ? `<div class="small ${t.due < App.today() ? 'neg' : 'muted'}">${App.date(t.due)}</div>` : ''}
            ${App.badge(t.prioridade || 'normal')}
          </div>
        </li>`).join('')
    : '<div class="empty">Nenhuma pendência para você 🎉</div>';

  view.innerHTML = `
    <div class="grid cols-4">
      ${kpi('Faturamento do mês', d.faturamentoMes, { money: true, hint: `Vendas: R$ ${App.money(d.vendasMes.valor)} · Serviços: R$ ${App.money(d.servicosMes.valor)}` })}
      ${kpi('Vendas do mês', d.vendasMes.qtd, { hint: 'pedidos registrados' })}
      ${kpi('Serviços do mês', d.servicosMes.qtd, { hint: 'OS finalizadas' })}
      ${fin ? kpi('Lucro estimado (vendas)', d.lucroEstimadoMes || 0, { money: true, cls: (d.lucroEstimadoMes || 0) >= 0 ? 'k-ok' : 'k-danger', hint: `Margem: ${(d.margemMes || 0).toFixed(1)}%` }) : kpi('Bens de clientes', d.bensDeClientes, { hint: 'na empresa agora' })}
    </div>
    <div class="grid cols-4" style="margin-top:14px">
      ${kpi('Contas a receber', d.contasReceber, { money: true })}
      ${kpi('Contas a pagar', d.contasPagar, { money: true })}
      ${kpi('Saldo em caixa', d.saldoCaixa, { money: true, cls: d.saldoCaixa >= 0 ? 'k-ok' : 'k-danger' })}
      ${kpi('Valores vencidos', d.vencidosReceber + d.vencidosPagar, { money: true, cls: (d.vencidosReceber + d.vencidosPagar) > 0 ? 'k-danger' : 'k-ok', hint: `A receber: R$ ${App.money(d.vencidosReceber)} · A pagar: R$ ${App.money(d.vencidosPagar)}` })}
    </div>
    <div class="grid cols-4" style="margin-top:14px">
      ${kpi('Orçamentos aguardando', d.orcamentosAguardando, { cls: d.orcamentosAguardando ? 'k-warn' : '', hint: 'aprovação do cliente' })}
      ${kpi('Serviços em andamento', d.servicosAndamento)}
      ${kpi('Cabeçotes aguardando produção', d.cabecotesAguardandoProducao, { cls: d.cabecotesAguardandoProducao ? 'k-warn' : '' })}
      ${kpi('Pedidos não entregues', d.pedidosNaoEntregues, { hint: `${d.pedidosAguardandoEnvio} prontos aguardando envio` })}
    </div>

    <div class="grid cols-2" style="margin-top:14px">
      <div class="card">
        <h3>MINHAS PENDÊNCIAS</h3>
        <ul style="list-style:none">${tasksHtml}</ul>
        <div style="margin-top:10px"><a class="btn sm" href="#/tasks">Ver central de pendências →</a></div>
      </div>
      <div class="card">
        <h3>ATALHOS RÁPIDOS</h3>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${App.can('entries') ? '<a class="btn" href="#/entries">⬇ Registrar entrada de cabeçote</a>' : ''}
          ${App.can('quotes') ? '<a class="btn" href="#/quotes">📄 Novo orçamento</a>' : ''}
          ${App.can('sales') ? '<a class="btn" href="#/sales">🛒 Nova venda</a>' : ''}
          ${App.can('purchases') ? '<a class="btn" href="#/purchases">📥 Lançar compra</a>' : ''}
          ${App.can('payables') ? '<a class="btn" href="#/payables">↥ Agenda de pagamentos (sextas)</a>' : ''}
          ${App.can('reports') ? '<a class="btn" href="#/reports">🖨 Imprimir pendências da produção</a>' : ''}
        </div>
      </div>
    </div>`;
});

/* ---------------- Central de pendências ---------------- */
App.registerView('tasks', async (view) => {
  App.setTitle('Minhas pendências', 'Central de tarefas da equipe');
  const [tasks, meta] = await Promise.all([App.get('/tasks'), Promise.resolve(App.meta)]);
  const users = meta.users.filter(u => u.active);

  const PRIO = { urgente: 'URGENTE', semana: 'ESTA SEMANA', aguardando: 'AGUARDANDO', normal: 'NORMAL' };
  const open = tasks.filter(t => t.status === 'aberta');
  const done = tasks.filter(t => t.status === 'concluida').slice(-15).reverse();

  const section = (key) => {
    const list = open.filter(t => (t.prioridade || 'normal') === key)
      .sort((a, b) => (a.due || '9999') < (b.due || '9999') ? -1 : 1);
    if (!list.length) return '';
    return `<div class="section-title">${PRIO[key]}</div>` + App.table(list, [
      { h: 'Tarefa', cell: t => `<b>${App.esc(t.titulo)}</b><div class="small muted">${App.esc(t.descricao || '')}</div>` },
      { h: 'Responsável', cell: t => t.assigneeId ? App.esc(App.userName(t.assigneeId)) : '<span class="muted">— qualquer um —</span>' },
      { h: 'Prazo', cell: t => t.due ? `<span class="${t.due < App.today() ? 'neg' : ''}">${App.date(t.due)}</span>` : '—' },
      { h: 'Origem', cell: t => `<span class="small muted">${App.esc(t.origem || 'manual')}</span>` },
      { h: '', class: 'num', cell: t => `<button class="btn sm" onclick="Tasks.complete(${t.id})">✓ Concluir</button>
        <button class="btn sm ghost" onclick="Tasks.edit(${t.id})">Editar</button>` }
    ]);
  };

  view.innerHTML = `
    <div class="toolbar">
      <button class="btn primary" onclick="Tasks.edit()">+ Nova pendência</button>
      <div class="spacer"></div>
      <button class="btn" onclick="Tasks.print()">🖨️ Imprimir</button>
    </div>
    ${section('urgente')}${section('semana')}${section('normal')}${section('aguardando')}
    ${open.length === 0 ? '<div class="card"><div class="empty">Nenhuma pendência aberta</div></div>' : ''}
    ${done.length ? `<div class="section-title muted">Concluídas recentemente</div>` + App.table(done, [
      { h: 'Tarefa', cell: t => App.esc(t.titulo) },
      { h: 'Responsável', cell: t => App.esc(App.userName(t.assigneeId)) },
      { h: 'Status', cell: t => App.badge('concluida') }
    ]) : ''}`;

  window.Tasks = {
    _all: tasks,
    async complete(id) {
      await App.put('/tasks/' + id, { status: 'concluida', concluidaEm: App.today() });
      App.toast('Pendência concluída', 'ok');
      App.route();
    },
    edit(id) {
      const t = id ? tasks.find(x => x.id === id) : {};
      App.form(id ? 'Editar pendência' : 'Nova pendência', [
        { name: 'titulo', label: 'Título', value: t.titulo, required: true, full: true },
        { name: 'descricao', label: 'Descrição', type: 'textarea', value: t.descricao, full: true },
        { name: 'prioridade', label: 'Prioridade', type: 'select', value: t.prioridade || 'normal', options: [
          { value: 'urgente', label: 'Urgente' }, { value: 'semana', label: 'Esta semana' },
          { value: 'normal', label: 'Normal' }, { value: 'aguardando', label: 'Aguardando' }] },
        { name: 'assigneeId', label: 'Atribuir a', type: 'select', value: t.assigneeId || '', options: [
          { value: '', label: '— qualquer um —' }].concat(users.map(u => ({ value: u.id, label: u.name }))) },
        { name: 'due', label: 'Prazo', type: 'date', value: t.due },
        { name: 'origem', label: 'Origem', value: t.origem || 'manual' }
      ], async d => {
        d.assigneeId = d.assigneeId ? Number(d.assigneeId) : null;
        if (id) await App.put('/tasks/' + id, d);
        else await App.post('/tasks', Object.assign(d, { status: 'aberta' }));
        App.closeModal(); App.toast('Pendência salva', 'ok'); App.route();
      });
    },
    print() {
      const rows = open.map(t => `<tr><td>${PRIO[t.prioridade || 'normal']}</td><td>${App.esc(t.titulo)}</td>
        <td>${App.esc(t.descricao || '')}</td><td>${App.esc(App.userName(t.assigneeId))}</td><td>${App.date(t.due)}</td></tr>`).join('');
      App.print('Pendências em aberto', `<table><tr><th>Prioridade</th><th>Tarefa</th><th>Descrição</th><th>Responsável</th><th>Prazo</th></tr>${rows}</table>`,
        open.length + ' pendência(s)');
    }
  };
});
