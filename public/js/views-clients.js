/* Clientes: cadastro completo + perfil consolidado com histórico */
'use strict';

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

/* Formulário de cliente (usado na lista e no perfil): máscaras, validação
   e busca de endereço pelo CEP em um só lugar. */
function clientForm(titulo, c, onSubmit) {
  const m = App.form(titulo, [
    { name: 'nome', label: 'Nome / Razão social', value: c.nome, required: true, full: true },
    { name: 'cpfCnpj', label: 'CPF / CNPJ', value: c.cpfCnpj, mask: 'cpfcnpj', placeholder: 'só números' },
    { name: 'tipo', label: 'Tipo de cliente', type: 'select', value: c.tipo || 'consumidor', options: [
      { value: 'consumidor', label: 'Consumidor final' }, { value: 'loja', label: 'Loja / Revenda' },
      { value: 'preparadora', label: 'Preparadora / Oficina' }, { value: 'equipe', label: 'Equipe de competição' }] },
    { name: 'telefone', label: 'Telefone', value: c.telefone },
    { name: 'whatsapp', label: 'WhatsApp', value: c.whatsapp },
    { name: 'email', label: 'E-mail', type: 'email', value: c.email },
    { name: 'cep', label: 'CEP (preenche o endereço sozinho)', value: c.cep, mask: 'cep', placeholder: 'só números' },
    { name: 'endereco', label: 'Endereço (rua/avenida)', value: c.endereco, full: true },
    { name: 'numero', label: 'Número', value: c.numero },
    { name: 'bairro', label: 'Bairro', value: c.bairro },
    { name: 'cidade', label: 'Cidade', value: c.cidade, required: true },
    { name: 'estado', label: 'Estado (UF)', type: 'select', value: c.estado || 'PR',
      options: UFS.map(u => ({ value: u, label: u })) },
    { name: 'complemento', label: 'Complemento / ponto de referência', value: c.complemento, full: true },
    { name: 'observacoes', label: 'Observações', type: 'textarea', value: c.observacoes, full: true }
  ], onSubmit, { wide: true });

  /* Busca automática do endereço pelo CEP — sem internet, segue manual */
  const cepInp = m.querySelector('[name=cep]');
  const campo = n => m.querySelector(`[name=${n}]`);
  let ultimoCep = App.digits(c.cep || '');
  cepInp.addEventListener('input', async () => {
    const d = App.digits(cepInp.value);
    if (d.length < 8) { ultimoCep = ''; return; }   // apagou/editou: pode consultar de novo
    if (d === ultimoCep) return;                     // evita repetir a consulta enquanto digita
    ultimoCep = d;
    const rotulo = cepInp.parentElement.querySelector('span');
    rotulo.dataset.orig = rotulo.dataset.orig || rotulo.textContent;
    rotulo.textContent = 'CEP — buscando endereço…';
    const end = await App.lookupCep(d);
    rotulo.textContent = rotulo.dataset.orig;
    if (!end) { App.toast('Não consegui consultar o CEP agora — preencha o endereço manualmente', 'err'); return; }
    const aplicar = () => {
      if (end.endereco) campo('endereco').value = end.endereco;
      if (end.bairro) campo('bairro').value = end.bairro;
      if (end.cidade) campo('cidade').value = end.cidade;
      if (end.estado) campo('estado').value = end.estado;
      App.toast('Endereço preenchido pelo CEP — confira e ajuste se precisar', 'ok');
    };

    // Nunca sobrescreve endereço já preenchido sem confirmar. A confirmação é
    // embutida no próprio formulário (uma janela sobre a outra fecharia o cadastro).
    const preenchidos = ['endereco', 'bairro', 'cidade'].filter(n => campo(n).value.trim());
    if (!preenchidos.length) return aplicar();

    m.querySelectorAll('.cep-confirma').forEach(x => x.remove());
    const aviso = document.createElement('div');
    aviso.className = 'cep-confirma';
    aviso.innerHTML = `
      <div><b>CEP ${App.fmtCep(d)}:</b> ${App.esc([end.endereco, end.bairro].filter(Boolean).join(', '))}
        — ${App.esc(end.cidade)}/${App.esc(end.estado)}</div>
      <div style="display:flex;gap:6px;margin-top:6px">
        <button type="button" class="btn sm primary" data-sim>Substituir endereço</button>
        <button type="button" class="btn sm" data-nao>Manter o que já está</button>
      </div>`;
    cepInp.parentElement.after(aviso);
    aviso.querySelector('[data-sim]').onclick = () => { aplicar(); aviso.remove(); };
    aviso.querySelector('[data-nao]').onclick = () => aviso.remove();
  });
  return m;
}

App.registerView('clients', async (view, args) => {
  if (args[0]) return clientProfile(view, Number(args[0]));

  App.setTitle('Clientes', 'Cadastro e histórico completo por cliente');
  const clients = await App.get('/clients');
  App.cache.clients = clients;

  /* Ordenação: alfabética por padrão; o seletor oferece as demais. */
  const ORDENS = {
    nome: (a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'),
    codigo: (a, b) => (a.codigo || '').localeCompare(b.codigo || '', 'pt-BR'),
    recentes: (a, b) => b.id - a.id,
    cidade: (a, b) => (a.cidade || '').localeCompare(b.cidade || '', 'pt-BR') || (a.nome || '').localeCompare(b.nome || '', 'pt-BR'),
    estado: (a, b) => (a.estado || '').localeCompare(b.estado || '', 'pt-BR') || (a.nome || '').localeCompare(b.nome || '', 'pt-BR')
  };
  let ordem = 'nome';
  let verInativos = false;

  const render = (filter) => {
    clients.sort(ORDENS[ordem] || ORDENS.nome);
    const base = verInativos ? clients : App.ativos(clients);
    /* Busca sem acento e por pedaço: "preparacoes" acha "Preparações",
       "12345678" acha o CNPJ com pontuação e "12" acha o CLI-000012. */
    const list = App.filtraPor(base, filter,
      ['nome', 'razaoSocial', 'apelido', 'codigo', 'cidade', 'estado', 'email', 'tipo',
        c => App.digits(c.cpfCnpj), c => App.digits(c.telefone), c => App.digits(c.whatsapp),
        c => App.digits(c.cep)]);
    document.getElementById('clients-table').innerHTML = App.table(list, [
      { h: 'Código', cell: c => c.codigo ? `<span class="mono">${App.esc(c.codigo)}</span>` : '<span class="muted">—</span>' },
      { h: 'Nome / Razão social', cell: c => `<b>${App.esc(c.nome)}</b>${App.seloInativo(c)}<div class="small muted">${App.esc(c.tipo || '')}</div>` },
      { h: 'CPF / CNPJ', cell: c => c.cpfCnpj ? `<span class="mono">${App.esc(App.fmtCpfCnpj(c.cpfCnpj))}</span>` : '<span class="muted">—</span>' },
      { h: 'Telefone / WhatsApp', cell: c => `${App.esc(c.telefone || '—')}${c.whatsapp ? `<div class="small muted">WhatsApp: ${App.esc(c.whatsapp)}</div>` : ''}` },
      { h: 'Cidade', cell: c => App.esc(c.cidade || '—') },
      { h: 'UF', cell: c => App.esc(c.estado || '—') },
      { h: '', class: 'num', cell: c => `
        <button class="btn sm" onclick="location.hash='#/clients/${c.id}'">Abrir perfil</button>
        <button class="btn sm ghost" onclick="event.stopPropagation();Clients.edit(${c.id})" title="Editar cadastro">✏️</button>
        ${c.ativo === false
          ? `<button class="btn sm ghost" onclick="event.stopPropagation();Clients.reativar(${c.id})" title="Reativar cadastro">↩️</button>`
          : `<button class="btn sm ghost" onclick="event.stopPropagation();Clients.excluir(${c.id})" title="Excluir cadastro">🗑️</button>`}` }
    ], { onRow: c => location.hash = '#/clients/' + c.id });
  };

  view.innerHTML = `
    <div class="toolbar">
      <button class="btn primary" onclick="Clients.edit()">+ Novo cliente</button>
      <input class="search" id="client-search" placeholder="🔎 Buscar por código, nome, razão social, cidade, UF, CPF/CNPJ, telefone…">
      <select id="client-sort" style="max-width:170px" title="Ordenar por">
        <option value="nome">A–Z por nome</option>
        <option value="codigo">Por código</option>
        <option value="recentes">Mais recentes</option>
        <option value="cidade">Por cidade</option>
        <option value="estado">Por estado</option>
      </select>
      <div class="spacer"></div>
      ${clients.some(c => c.ativo === false) ? `<label class="small muted" style="display:flex;gap:6px;align-items:center;cursor:pointer">
        <input type="checkbox" id="client-inativos" style="width:auto"> Mostrar inativos</label>` : ''}
      <span class="muted small">${App.ativos(clients).length} cliente(s)</span>
    </div>
    <div id="clients-table"></div>`;
  render();
  document.getElementById('client-search').addEventListener('input', e => render(e.target.value));
  document.getElementById('client-sort').addEventListener('change', e => {
    ordem = e.target.value;
    render(document.getElementById('client-search').value);
  });
  const chkInativos = document.getElementById('client-inativos');
  if (chkInativos) chkInativos.addEventListener('change', e => {
    verInativos = e.target.checked;
    render(document.getElementById('client-search').value);
  });

  window.Clients = {
    excluir(id) {
      const c = clients.find(x => x.id === id);
      App.excluirCadastro('clients', id, c && c.nome);
    },
    reativar(id) {
      const c = clients.find(x => x.id === id);
      App.reativar('clients', id, c && c.nome);
    },
    edit(id) {
      const c = id ? clients.find(x => x.id === id) : {};
      const titulo = id
        ? 'Editar cliente' + (c && c.codigo ? ' · ' + c.codigo : '')
        : 'Novo cliente (o código é gerado ao salvar)';
      clientForm(titulo, c, async d => {
        if (id) await App.put('/clients/' + id, d);
        else await App.post('/clients', d);
        App.closeModal(); App.toast('Cliente salvo', 'ok'); App.route();
      });
    }
  };
});

/* ---------------- Perfil do cliente ---------------- */
async function clientProfile(view, id) {
  const podeVerCredito = App.can(['credits', 'clients']);
  const [p, cred] = await Promise.all([
    App.get('/clients/' + id + '/profile'),
    podeVerCredito ? App.get('/clients/' + id + '/credits') : Promise.resolve(null)
  ]);
  const c = p.cliente;
  const gereCredito = App.can('credits_manage');
  App.setTitle(c.nome, [
    c.codigo, `${c.cidade || ''}${c.estado ? ' / ' + c.estado : ''}`.trim(),
    c.cpfCnpj ? App.fmtCpfCnpj(c.cpfCnpj) : 'sem CPF/CNPJ'
  ].filter(Boolean).join(' · '));

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
    /* Crédito é o contrário de conta a receber: aqui a empresa deve ao
       cliente. Por isso vive numa aba própria, com saldo, cada origem e o
       extrato de tudo que entrou e saiu. */
    creditos: () => !cred ? '<div class="empty">Sem permissão para ver créditos</div>' : `
      <div class="grid cols-3" style="margin-bottom:14px">
        <div class="card kpi ${cred.saldo > 0 ? 'k-ok' : ''}">
          <div class="label">Saldo disponível</div><div class="value money">${App.money(cred.saldo)}</div>
          <div class="small muted">a favor do cliente</div></div>
        <div class="card kpi"><div class="label">Total gerado</div><div class="value money">${App.money(cred.gerado)}</div></div>
        <div class="card kpi"><div class="label">Total utilizado</div><div class="value money">${App.money(cred.usado)}</div></div>
      </div>
      ${gereCredito ? `<div class="toolbar" style="margin-bottom:10px">
        <button class="btn primary" onclick="Cred.novo()">+ Lançar crédito</button>
        ${cred.saldo > 0 ? '<button class="btn" onclick="Cred.usar()">− Usar crédito numa venda</button>' : ''}
      </div>` : ''}
      <div class="section-title">Créditos</div>
      ${App.table(cred.creditos, [
        { h: 'Data', cell: x => App.date(x.data) },
        { h: 'Origem', cell: x => `<b>${App.esc(x.origemLabel || x.origem)}</b>${
          x.descricao ? `<div class="small muted">${App.esc(x.descricao)}</div>` : ''}` },
        { h: 'Documento', cell: x => App.esc(x.refLabel || '—') },
        { h: 'Gerado', class: 'num', cell: x => App.moneyHtml(x.valor) },
        { h: 'Utilizado', class: 'num', cell: x => x.usado ? `<span class="neg">${App.money(x.usado)}</span>` : '<span class="muted">—</span>' },
        { h: 'Saldo', class: 'num', cell: x => `<b class="${x.saldo > 0 ? 'pos' : 'muted'}">${App.money(x.saldo)}</b>` },
        { h: 'Observações', cell: x => App.esc(x.observacoes || '—') },
        { h: 'Situação', cell: x => App.badge(x.status === 'usado' ? 'pago' : x.status === 'cancelado' ? 'cancelado' : 'aberto') },
        ...(gereCredito ? [{ h: '', class: 'num', cell: x => `
          ${x.saldo > 0 && x.status !== 'cancelado' ? `<button class="btn sm" onclick="Cred.usar(${x.id})">Usar</button>` : ''}
          ${!x.usado && x.status !== 'cancelado' ? `<button class="btn sm ghost" onclick="Cred.cancelar(${x.id})" title="Cancelar crédito">🚫</button>` : ''}
          ${x.usado ? `<button class="btn sm ghost" onclick="Cred.usos(${x.id})" title="Ver e estornar usos">↩</button>` : ''}` }] : [])
      ], { emptyMsg: 'Nenhum crédito lançado para este cliente' })}
      <div class="section-title">Histórico de movimentações</div>
      ${App.table(cred.movimentos, [
        { h: 'Data', cell: m => App.date(m.data) },
        { h: 'Movimento', cell: m => `<b>${App.esc(m.origem)}</b>${m.descricao ? `<div class="small muted">${App.esc(m.descricao)}</div>` : ''}` },
        { h: 'Documento', cell: m => App.esc(m.refLabel || '—') },
        { h: 'Valor', class: 'num', cell: m => m.valor === 0 ? '<span class="muted">—</span>'
          : `<span class="${m.valor > 0 ? 'pos' : 'neg'}">${m.valor > 0 ? '+' : '−'} ${App.money(Math.abs(m.valor))}</span>` },
        { h: 'Crédito', cell: m => '#' + m.creditoId },
        { h: 'Por', cell: m => App.esc(m.por || '—') }
      ], { emptyMsg: 'Sem movimentações' })}`,
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
    ${cred && cred.saldo > 0 ? `<div class="card" style="margin-top:12px;border-left:3px solid var(--ok)">
      <b>💳 Este cliente tem R$ ${App.money(cred.saldo)} de crédito</b>
      <span class="muted small">— pode ser abatido numa próxima venda. Veja a aba Créditos.</span>
    </div>` : ''}
    <div class="card" style="margin-top:14px">
      <div class="tabs" id="ctabs">
        <button data-t="compras" class="active">Compras (${p.compras.length})</button>
        <button data-t="servicos">Serviços (${p.ordens.length})</button>
        <button data-t="orcamentos">Orçamentos (${p.orcamentos.length})</button>
        <button data-t="financeiro">Financeiro (${p.recebiveis.length})</button>
        ${cred ? `<button data-t="creditos">Créditos${cred.saldo > 0 ? ` · R$ ${App.money(cred.saldo)}` : ''}</button>` : ''}
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

  const ORIGENS = [
    ['compra', 'Compra feita com o cliente (lojista/fornecedor)'],
    ['devolucao', 'Devolução de peça ou serviço'],
    ['acordo', 'Acordo comercial'],
    ['pagamento_maior', 'Pagamento a maior do cliente'],
    ['outro', 'Outro']
  ];

  window.Cred = {
    novo() {
      App.form('Lançar crédito para ' + c.nome, [
        { name: 'valor', label: 'Valor do crédito (R$)', type: 'number', step: '0.01', required: true },
        { name: 'data', label: 'Data', type: 'date', value: App.today(), required: true },
        { name: 'origem', label: 'Origem do crédito', type: 'select', value: 'compra',
          options: ORIGENS.map(([v, l]) => ({ value: v, label: l })), full: true },
        { name: 'descricao', label: 'Descrição (o que gerou este crédito)', full: true },
        { name: 'observacoes', label: 'Observações', type: 'textarea', full: true }
      ], async d => {
        d.valor = Number(d.valor);
        await App.post('/credits', Object.assign({ clienteId: c.id }, d));
        App.closeModal(); App.toast('Crédito lançado — fica disponível para abater numa venda', 'ok'); App.route();
      });
    },
    /* Usar o crédito: escolhe o pedido em aberto do cliente e abate. Sem
       pedido, fica só registrado como uso (ex.: acerto fora do sistema). */
    usar(creditoId) {
      const abertos = cred.creditos.filter(x => x.saldo > 0 && x.status !== 'cancelado');
      const alvo = creditoId ? abertos.find(x => x.id === creditoId) : null;
      const pedidos = p.compras.filter(s => {
        const rec = (s.recebimentos || []).reduce((a, r) => a + r.valor, 0);
        return s.status !== 'cancelado' && (s.valorTotal - rec) > 0.005;
      });
      App.form('Usar crédito de ' + c.nome, [
        { name: 'creditoId', label: 'Crédito', type: 'select', value: alvo ? alvo.id : (abertos[0] || {}).id,
          options: abertos.map(x => ({ value: x.id,
            label: `#${x.id} · ${App.date(x.data)} · saldo R$ ${App.money(x.saldo)} (${x.origemLabel || x.origem})` })), full: true },
        { name: 'refId', label: 'Abater no pedido', type: 'select', value: '', full: true,
          options: [{ value: '', label: '— só registrar o uso, sem abater pedido —' }].concat(
            pedidos.map(s => ({ value: s.id,
              label: `nº ${s.numero} · ${App.date(s.dataPedido)} · falta R$ ${App.money(
                s.valorTotal - (s.recebimentos || []).reduce((a, r) => a + r.valor, 0))}` }))) },
        { name: 'valor', label: 'Valor a usar (R$)', type: 'number', step: '0.01', required: true,
          value: alvo ? alvo.saldo : (abertos[0] || {}).saldo },
        { name: 'data', label: 'Data', type: 'date', value: App.today(), required: true },
        { name: 'obs', label: 'Observação', full: true }
      ], async d => {
        const corpo = { valor: Number(d.valor), data: d.data, obs: d.obs };
        if (d.refId) { corpo.refType = 'sales'; corpo.refId = Number(d.refId); }
        const r = await App.post(`/credits/${Number(d.creditoId)}/usar`, corpo);
        App.closeModal();
        App.toast(`Crédito usado — saldo do cliente: R$ ${App.money(r.saldoCliente)}`, 'ok');
        App.route();
      });
    },
    usos(creditoId) {
      const x = cred.creditos.find(y => y.id === creditoId);
      App.modal(`
        <h2>Usos do crédito #${x.id}</h2>
        <p class="small muted">Gerado em ${App.date(x.data)} — R$ ${App.money(x.valor)} · saldo atual R$ ${App.money(x.saldo)}</p>
        ${App.table((x.usos || []).map((u, i) => Object.assign({ _i: i }, u)), [
          { h: 'Data', cell: u => App.date(u.data) },
          { h: 'Uso', cell: u => App.esc(u.descricao || '—') },
          { h: 'Valor', class: 'num', cell: u => App.moneyHtml(u.valor) },
          { h: 'Por', cell: u => App.esc(u.por || '—') },
          { h: '', class: 'num', cell: u => `<button class="btn sm ghost" onclick="Cred.estornar(${x.id}, ${u._i})" title="Estornar este uso">↩ Estornar</button>` }
        ], { emptyMsg: 'Nenhum uso' })}
        <div class="actions"><button class="btn primary" onclick="App.closeModal()">Fechar</button></div>`, { wide: true });
    },
    estornar(creditoId, index) {
      App.form('Estornar uso do crédito', [
        { name: 'motivo', label: 'Motivo do estorno (fica registrado)', required: true, full: true }
      ], async d => {
        const r = await App.post(`/credits/${creditoId}/estornar-uso`, { index, motivo: d.motivo });
        App.closeModal();
        App.toast(`Uso estornado — saldo do crédito: R$ ${App.money(r.credito.saldo)}`, 'ok');
        App.route();
      });
    },
    cancelar(creditoId) {
      App.form('Cancelar crédito', [
        { name: 'motivo', label: 'Motivo do cancelamento (fica registrado)', required: true, full: true }
      ], async d => {
        await App.post(`/credits/${creditoId}/cancelar`, d);
        App.closeModal(); App.toast('Crédito cancelado', 'ok'); App.route();
      });
    }
  };

  window.Clients2 = {
    editClient() {
      clientForm('Editar cliente', c, async d => {
        await App.put('/clients/' + c.id, d);
        App.closeModal(); App.toast('Cliente atualizado', 'ok'); App.route();
      });
    }
  };
}
