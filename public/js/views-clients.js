/* Clientes: cadastro completo + perfil consolidado com histórico */
'use strict';

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

App.registerView('clients', async (view, args) => {
  if (args[0]) return clientProfile(view, Number(args[0]));

  App.setTitle('Clientes', 'Cadastro e histórico completo por cliente');
  const clients = await App.get('/clients');
  App.cache.clients = clients;

  const render = (filter) => {
    const f = (filter || '').toLowerCase();
    const list = clients.filter(c =>
      !f || (c.nome || '').toLowerCase().includes(f) || (c.cidade || '').toLowerCase().includes(f) ||
      (c.cpfCnpj || '').includes(f) || (c.estado || '').toLowerCase() === f);
    document.getElementById('clients-table').innerHTML = App.table(list, [
      { h: 'Nome / Razão social', cell: c => `<b>${App.esc(c.nome)}</b><div class="small muted">${App.esc(c.tipo || '')}</div>` },
      { h: 'CPF/CNPJ', cell: c => `<span class="mono">${App.esc(c.cpfCnpj || '—')}</span>` },
      { h: 'Telefone / WhatsApp', cell: c => `${App.esc(c.telefone || '—')}${c.whatsapp ? `<div class="small muted">WhatsApp: ${App.esc(c.whatsapp)}</div>` : ''}` },
      { h: 'Cidade', cell: c => App.esc(c.cidade || '—') },
      { h: 'UF', cell: c => App.esc(c.estado || '—') },
      { h: '', class: 'num', cell: c => `<button class="btn sm" onclick="location.hash='#/clients/${c.id}'">Abrir perfil</button>` }
    ], { onRow: c => location.hash = '#/clients/' + c.id });
  };

  view.innerHTML = `
    <div class="toolbar">
      <button class="btn primary" onclick="Clients.edit()">+ Novo cliente</button>
      <input class="search" id="client-search" placeholder="Buscar por nome, cidade, UF ou CPF/CNPJ…">
      <div class="spacer"></div>
      <span class="muted small">${clients.length} cliente(s)</span>
    </div>
    <div id="clients-table"></div>`;
  render();
  document.getElementById('client-search').addEventListener('input', e => render(e.target.value));

  window.Clients = {
    edit(id) {
      const c = id ? clients.find(x => x.id === id) : {};
      App.form(id ? 'Editar cliente' : 'Novo cliente', [
        { name: 'nome', label: 'Nome / Razão social', value: c.nome, required: true, full: true },
        { name: 'cpfCnpj', label: 'CPF / CNPJ', value: c.cpfCnpj },
        { name: 'tipo', label: 'Tipo de cliente', type: 'select', value: c.tipo || 'consumidor', options: [
          { value: 'consumidor', label: 'Consumidor final' }, { value: 'loja', label: 'Loja / Revenda' },
          { value: 'preparadora', label: 'Preparadora / Oficina' }, { value: 'equipe', label: 'Equipe de competição' }] },
        { name: 'telefone', label: 'Telefone', value: c.telefone },
        { name: 'whatsapp', label: 'WhatsApp', value: c.whatsapp },
        { name: 'email', label: 'E-mail', type: 'email', value: c.email },
        { name: 'endereco', label: 'Endereço', value: c.endereco, full: true },
        { name: 'cidade', label: 'Cidade', value: c.cidade, required: true },
        { name: 'estado', label: 'Estado (UF)', type: 'select', value: c.estado || 'PR',
          options: UFS.map(u => ({ value: u, label: u })) },
        { name: 'observacoes', label: 'Observações', type: 'textarea', value: c.observacoes, full: true }
      ], async d => {
        if (id) await App.put('/clients/' + id, d);
        else await App.post('/clients', d);
        App.closeModal(); App.toast('Cliente salvo', 'ok'); App.route();
      });
    }
  };
});

/* ---------------- Perfil do cliente ---------------- */
async function clientProfile(view, id) {
  const p = await App.get('/clients/' + id + '/profile');
  const c = p.cliente;
  App.setTitle(c.nome, `${c.cidade || ''}${c.estado ? ' / ' + c.estado : ''} · ${c.cpfCnpj || 'sem CPF/CNPJ'}`);

  const fin = p.financeiro;
  const tabs = {
    compras: () => App.table(p.compras, [
      { h: 'Pedido', cell: s => `<b>nº ${s.numero}</b>` },
      { h: 'Data', cell: s => App.date(s.dataPedido) },
      { h: 'Produtos', cell: s => s.itens.map(i => `${i.qtd}× ${App.esc(i.produto)} (${i.comando})`).join('<br>') },
      { h: 'Valor', class: 'num', cell: s => App.moneyHtml(s.valorTotal) },
      { h: 'Pagamento', cell: s => App.esc((s.pagamento && s.pagamento.forma) || '—') },
      { h: 'Status', cell: s => App.badge(s.status) }
    ], { emptyMsg: 'Nenhuma compra registrada' }),
    servicos: () => App.table(p.ordens, [
      { h: 'OS', cell: o => `<b>nº ${o.numero}</b><div class="small muted">${App.esc(o.identificacao || '')}</div>` },
      { h: 'Modelo', cell: o => App.esc(o.modelo || '—') },
      { h: 'Serviços', cell: o => (o.itens || []).map(i => App.esc(i.nome)).join(', ') || '—' },
      { h: 'Valor', class: 'num', cell: o => App.moneyHtml(o.valorTotal) },
      { h: 'Status', cell: o => App.badge(o.status) },
      { h: 'Pagamento', cell: o => App.badge(o.pagamentoStatus) }
    ], { emptyMsg: 'Nenhum serviço registrado' })
    ,
    orcamentos: () => App.table(p.orcamentos, [
      { h: 'Nº', cell: q => `<b>${q.numero}</b>` },
      { h: 'Data', cell: q => App.date(q.dataOrcamento) },
      { h: 'Modelo', cell: q => App.esc(q.modelo || '—') },
      { h: 'Valor', class: 'num', cell: q => App.moneyHtml(q.total) },
      { h: 'Status', cell: q => App.badge(q.status) }
    ], { emptyMsg: 'Nenhum orçamento' }),
    financeiro: () => App.table(p.recebiveis, [
      { h: 'Descrição', cell: r => App.esc(r.descricao) },
      { h: 'Forma', cell: r => App.esc(r.forma || '—') },
      { h: 'Vencimento', cell: r => App.date(r.vencimento) },
      { h: 'Valor', class: 'num', cell: r => App.moneyHtml(r.valor) },
      { h: 'Status', cell: r => App.badge(r.status) }
    ], { emptyMsg: 'Nenhum lançamento' }),
    historico: () => p.historico.length
      ? `<ul class="timeline">${p.historico.map(h => `
          <li><div class="when">${App.dateTime(h.at)} · ${App.esc(h.userName)}</div>
          <div class="what">${App.esc(h.details)}</div></li>`).join('')}</ul>`
      : '<div class="empty">Sem eventos registrados</div>'
  };

  view.innerHTML = `
    <div class="toolbar">
      <a class="btn sm ghost" href="#/clients">← Voltar</a>
      <button class="btn sm" onclick="Clients2.editClient()">✎ Editar cadastro</button>
      <div class="spacer"></div>
      ${App.waPhone(App.waPhoneOf(c)) ? `<a class="btn sm wa" target="_blank" href="https://wa.me/${App.waPhone(App.waPhoneOf(c))}">✆ WhatsApp</a>` : ''}
    </div>
    <div class="grid cols-4">
      <div class="card kpi"><div class="label">Total comprado</div><div class="value money">${App.money(fin.totalComprado)}</div></div>
      <div class="card kpi k-ok"><div class="label">Total pago</div><div class="value money">${App.money(fin.totalPago)}</div></div>
      <div class="card kpi ${fin.emAberto ? 'k-warn' : ''}"><div class="label">Em aberto</div><div class="value money">${App.money(fin.emAberto)}</div></div>
      <div class="card kpi ${fin.vencido ? 'k-danger' : ''}"><div class="label">Vencido</div><div class="value money">${App.money(fin.vencido)}</div></div>
    </div>
    <div class="card" style="margin-top:14px">
      <div class="tabs" id="ctabs">
        <button data-t="compras" class="active">Compras (${p.compras.length})</button>
        <button data-t="servicos">Serviços (${p.ordens.length})</button>
        <button data-t="orcamentos">Orçamentos (${p.orcamentos.length})</button>
        <button data-t="financeiro">Financeiro (${p.recebiveis.length})</button>
        <button data-t="historico">Linha do tempo</button>
      </div>
      <div id="ctab-body">${tabs.compras()}</div>
    </div>`;

  document.getElementById('ctabs').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    document.querySelectorAll('#ctabs button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    document.getElementById('ctab-body').innerHTML = tabs[b.dataset.t]();
  });

  window.Clients2 = {
    editClient() {
      App.form('Editar cliente', [
        { name: 'nome', label: 'Nome / Razão social', value: c.nome, required: true, full: true },
        { name: 'cpfCnpj', label: 'CPF / CNPJ', value: c.cpfCnpj },
        { name: 'tipo', label: 'Tipo de cliente', type: 'select', value: c.tipo || 'consumidor', options: [
          { value: 'consumidor', label: 'Consumidor final' }, { value: 'loja', label: 'Loja / Revenda' },
          { value: 'preparadora', label: 'Preparadora / Oficina' }, { value: 'equipe', label: 'Equipe de competição' }] },
        { name: 'telefone', label: 'Telefone', value: c.telefone },
        { name: 'whatsapp', label: 'WhatsApp', value: c.whatsapp },
        { name: 'email', label: 'E-mail', value: c.email },
        { name: 'endereco', label: 'Endereço', value: c.endereco, full: true },
        { name: 'cidade', label: 'Cidade', value: c.cidade, required: true },
        { name: 'estado', label: 'Estado (UF)', type: 'select', value: c.estado, options: UFS.map(u => ({ value: u, label: u })) },
        { name: 'observacoes', label: 'Observações', type: 'textarea', value: c.observacoes, full: true }
      ], async d => {
        await App.put('/clients/' + c.id, d);
        App.closeModal(); App.toast('Cliente atualizado', 'ok'); App.route();
      });
    }
  };
}
