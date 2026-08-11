/* Oficina: entrada de cabeçotes, bens de clientes, orçamentos e ordens de serviço */
'use strict';

/* ================= ENTRADA DE CABEÇOTES ================= */
App.registerView('entries', async (view) => {
  App.setTitle('Entrada de cabeçotes', 'Fluxo: Entrada → Orçamento → Aprovação → OS → Produção → Finalização → Pagamento → NF → Envio');
  const [entries, clients] = await Promise.all([App.get('/headEntries'), App.get('/clients')]);
  App.cache.clients = clients;
  entries.sort((a, b) => b.id - a.id);

  view.innerHTML = `
    <div class="toolbar">
      <button class="btn primary" onclick="Entries.create()">⬇ Registrar entrada</button>
      <select id="ef-status" style="max-width:220px">
        <option value="">Todos os status</option>
        ${['recebido', 'em_analise', 'aguardando_orcamento', 'orcado', 'aprovado', 'finalizado'].map(s =>
          `<option value="${s}">${(App.STATUS[s] || [s])[0]}</option>`).join('')}
      </select>
      <div class="spacer"></div>
      <button class="btn" onclick="Entries.print()">🖨️ Imprimir</button>
    </div>
    <div id="entries-table"></div>`;

  const render = () => {
    const f = document.getElementById('ef-status').value;
    const list = entries.filter(e => !f || e.status === f);
    document.getElementById('entries-table').innerHTML = App.table(list, [
      { h: 'Identificação', cell: e => `<b>${App.esc(e.codigo)}</b>${e.entradaDireta ? ' <span class="badge warn" title="Entrou sem orçamento">exceção</span>' : ''}` },
      { h: 'Chegada', cell: e => App.date(e.dataChegada) },
      { h: 'Cliente', cell: e => App.esc(App.clientName(e.clienteId, clients)) },
      { h: 'Cidade/UF', cell: e => `${App.esc(e.cidade || '—')}/${App.esc(e.estado || '—')}` },
      { h: 'Peça / Modelo', cell: e => `${App.esc(e.peca)}<div class="small muted">${App.esc(e.modelo || '')}</div>` },
      { h: 'Problema relatado', cell: e => `<span class="small">${App.esc((e.defeito || '—').slice(0, 80))}</span>` },
      { h: 'Doc. fiscal', cell: e => e.docFiscal && e.docFiscal.tipo !== 'sem_documento'
          ? App.esc(e.docFiscal.tipo.toUpperCase() + ' ' + (e.docFiscal.numero || ''))
          : '<span class="badge warn">sem documento</span>' },
      { h: 'Status', cell: e => App.badge(e.status) },
      { h: '', class: 'num', cell: e => `
        ${App.can('quotes') && e.status !== 'orcado' && e.status !== 'aprovado' && !e.quoteId ? `<button class="btn sm primary" onclick="location.hash='#/quotes/novo/${e.id}'">Orçar</button>` : ''}
        <button class="btn sm ghost" onclick="Entries.setStatus(${e.id})">Status</button>
        <button class="btn sm ghost" onclick="Entries.trace(${e.id})">Rastrear</button>` }
    ]);
  };
  render();
  document.getElementById('ef-status').addEventListener('change', render);

  window.Entries = {
    create() {
      App.form('Registrar entrada de cabeçote', [
        { name: 'clienteId', label: 'Cliente', type: 'select', required: true, full: true,
          options: App.clientOptions(clients) },
        { name: 'dataChegada', label: 'Data de chegada', type: 'date', value: App.today(), required: true },
        { name: 'peca', label: 'Peça', value: 'Cabeçote', required: true },
        { name: 'modelo', label: 'Modelo', full: false },
        { name: 'docTipo', label: 'Documento fiscal', type: 'select', value: 'sem_documento', options: [
          { value: 'sem_documento', label: 'Sem documento fiscal (registrar mesmo assim)' },
          { value: 'nf', label: 'NF de remessa para conserto' },
          { value: 'outro', label: 'Outro documento' }] },
        { name: 'docNumero', label: 'Número do documento' },
        { name: 'entradaDireta', label: 'Entrada direta em produção (EXCEÇÃO — sem orçamento)', type: 'checkbox', value: false, full: true },
        { name: 'defeito', label: 'Descrição do problema / defeito', type: 'textarea', full: true },
        { name: 'observacoes', label: 'Observações', type: 'textarea', full: true }
      ], async d => {
        d.clienteId = Number(d.clienteId);
        d.docFiscal = { tipo: d.docTipo, numero: d.docNumero || '' };
        await App.post('/entries', d);
        App.closeModal();
        App.toast('Entrada registrada — o cabeçote entrou como BEM DE CLIENTE (estoque de terceiros)', 'ok');
        App.route();
      });
    },
    setStatus(id) {
      const e = entries.find(x => x.id === id);
      App.form('Status da entrada ' + e.codigo, [
        { name: 'status', label: 'Novo status', type: 'select', value: e.status, full: true, options:
          ['recebido', 'em_analise', 'aguardando_orcamento', 'orcado', 'aprovado', 'finalizado'].map(s =>
            ({ value: s, label: (App.STATUS[s] || [s])[0] })) }
      ], async d => {
        await App.post(`/entries/${id}/status`, d);
        App.closeModal(); App.route();
      });
    },
    async trace(id) {
      const e = entries.find(x => x.id === id);
      const tl = await App.get(`/trace/headEntries/${id}`);
      const os = e.osId ? await App.get('/serviceOrders/' + e.osId).catch(() => null) : null;
      App.modal(`
        <h2>Rastreabilidade — ${App.esc(e.codigo)}</h2>
        <p class="small muted">Cliente: ${App.esc(App.clientName(e.clienteId, clients))} · Status atual: ${App.badge(e.status)}
        ${os ? ` · OS nº ${os.numero} (${(App.STATUS[os.status] || [os.status])[0]})` : ''}</p>
        <hr class="sep">
        ${tl.length ? `<ul class="timeline">${tl.map(h => `
          <li><div class="when">${App.dateTime(h.at)} · ${App.esc(h.userName)}</div>
          <div class="what">${App.esc(h.details)}</div></li>`).join('')}</ul>` : '<div class="empty">Sem eventos</div>'}
        <div class="actions"><button class="btn" onclick="App.closeModal()">Fechar</button></div>`);
    },
    print() {
      const f = document.getElementById('ef-status').value;
      const list = entries.filter(e => !f || e.status === f);
      App.print('Cabeçotes — ' + (f ? (App.STATUS[f] || [f])[0] : 'todas as entradas'),
        `<table><tr><th>ID</th><th>Chegada</th><th>Cliente</th><th>Modelo</th><th>Problema</th><th>Status</th></tr>
        ${list.map(e => `<tr><td>${App.esc(e.codigo)}</td><td>${App.date(e.dataChegada)}</td>
          <td>${App.esc(App.clientName(e.clienteId, clients))}</td><td>${App.esc(e.modelo || '')}</td>
          <td>${App.esc(e.defeito || '')}</td><td>${(App.STATUS[e.status] || [e.status])[0]}</td></tr>`).join('')}</table>`,
        list.length + ' cabeçote(s)');
    }
  };
});

/* ================= BENS DE CLIENTES ================= */
App.registerView('assets', async (view) => {
  App.setTitle('Bens de clientes dentro da empresa', 'Estoque de terceiros — totalmente separado do estoque próprio');
  const [assets, clients] = await Promise.all([App.get('/assets'), App.get('/clients')]);
  const inHouse = assets.filter(a => a.status === 'na_empresa');
  const returned = assets.filter(a => a.status === 'devolvido').slice(-20).reverse();

  view.innerHTML = `
    <div class="card" style="margin-bottom:14px;border-left:3px solid var(--accent)">
      <b>⚠ Regra fundamental:</b> <span class="muted">bens de clientes NUNCA entram no estoque comercializável da empresa.
      A devolução dá saída do estoque de terceiros — jamais do estoque próprio.</span>
    </div>
    <div class="toolbar">
      <span class="badge accent">${inHouse.length} bem(ns) na empresa agora</span>
      <div class="spacer"></div>
      <button class="btn" onclick="Assets.print()">🖨️ Imprimir</button>
    </div>
    ${App.table(inHouse, [
      { h: 'Identificação', cell: a => `<b>${App.esc(a.identificacao)}</b>` },
      { h: 'Cliente', cell: a => App.esc(App.clientName(a.clienteId, clients)) },
      { h: 'Entrada', cell: a => App.date(a.dataEntrada) },
      { h: 'Motivo', cell: a => App.esc(a.motivo || '—') },
      { h: 'OS', cell: a => a.osId ? 'OS #' + a.osId : '<span class="muted">—</span>' },
      { h: 'Doc. fiscal', cell: a => a.semDocumentoFiscal
          ? '<span class="badge warn">sem documento fiscal</span>'
          : App.esc((a.docFiscal && (a.docFiscal.tipo + ' ' + a.docFiscal.numero)) || '—') },
      { h: 'Status', cell: a => App.badge(a.status) },
      { h: '', class: 'num', cell: a => `<button class="btn sm" onclick="Assets.devolver(${a.id})">Devolver ao cliente</button>` }
    ], { emptyMsg: 'Nenhum bem de terceiro na empresa no momento' })}
    ${returned.length ? `<div class="section-title muted">Devolvidos recentemente</div>` + App.table(returned, [
      { h: 'Identificação', cell: a => App.esc(a.identificacao) },
      { h: 'Cliente', cell: a => App.esc(App.clientName(a.clienteId, clients)) },
      { h: 'Saída', cell: a => App.date(a.dataSaida) },
      { h: 'NF de retorno', cell: a => App.esc(a.nfRetorno || '—') },
      { h: 'Status', cell: a => App.badge(a.status) }
    ]) : ''}`;

  window.Assets = {
    devolver(id) {
      const a = assets.find(x => x.id === id);
      App.form('Devolver bem ao cliente', [
        { name: 'info', label: 'Bem', value: a.identificacao, full: true, type: 'text' },
        { name: 'dataSaida', label: 'Data de saída', type: 'date', value: App.today(), required: true },
        { name: 'nfRetorno', label: 'NF de retorno (se houver)' }
      ], async d => {
        await App.post(`/assets/${id}/return`, d);
        App.closeModal(); App.toast('Bem devolvido — saiu do estoque de terceiros', 'ok'); App.route();
      });
    },
    print() {
      App.print('Bens de clientes dentro da empresa',
        `<table><tr><th>Identificação</th><th>Cliente</th><th>Entrada</th><th>Motivo</th><th>Doc. fiscal</th></tr>
        ${inHouse.map(a => `<tr><td>${App.esc(a.identificacao)}</td><td>${App.esc(App.clientName(a.clienteId, clients))}</td>
        <td>${App.date(a.dataEntrada)}</td><td>${App.esc(a.motivo || '')}</td>
        <td>${a.semDocumentoFiscal ? 'SEM DOCUMENTO' : App.esc((a.docFiscal && a.docFiscal.numero) || '')}</td></tr>`).join('')}</table>`,
        inHouse.length + ' bem(ns) de terceiros na empresa');
    }
  };
});

/* ================= ORÇAMENTOS ================= */
App.registerView('quotes', async (view, args) => {
  if (args[0] === 'novo') return quoteEditor(view, { entryId: args[1] ? Number(args[1]) : null });
  if (args[0]) return quoteEditor(view, { quoteId: Number(args[0]) });

  App.setTitle('Orçamentos', 'Validade padrão: ' + App.meta.settings.quoteValidityDays + ' dias (configurável na Administração)');
  const [quotes, clients] = await Promise.all([App.get('/quotes'), App.get('/clients')]);
  quotes.sort((a, b) => b.id - a.id);

  view.innerHTML = `
    <div class="toolbar">
      <button class="btn primary" onclick="location.hash='#/quotes/novo'">+ Novo orçamento</button>
      <select id="qf" style="max-width:200px">
        <option value="">Todos</option>
        <option value="aberto">Em aberto</option><option value="aprovado">Aprovados</option>
        <option value="recusado">Recusados</option><option value="cancelado">Cancelados</option>
      </select>
      <div class="spacer"></div>
      <button class="btn" onclick="Quotes.print()">🖨️ Imprimir lista</button>
    </div>
    <div id="q-table"></div>`;

  const validade = q => {
    const lim = new Date(q.dataOrcamento);
    lim.setDate(lim.getDate() + (q.validadeDias || 30));
    return lim.toISOString().slice(0, 10);
  };
  const render = () => {
    const f = document.getElementById('qf').value;
    const list = quotes.filter(q => !f || q.status === f);
    document.getElementById('q-table').innerHTML = App.table(list, [
      { h: 'Nº', cell: q => `<b>${q.numero}</b>` },
      { h: 'Cliente', cell: q => App.esc(App.clientName(q.clienteId, clients)) },
      { h: 'Modelo', cell: q => App.esc(q.modelo || '—') },
      { h: 'Data', cell: q => App.date(q.dataOrcamento) },
      { h: 'Validade', cell: q => {
        const v = validade(q);
        const expirado = q.status === 'aberto' && v < App.today();
        return `<span class="${expirado ? 'neg' : ''}">${App.date(v)}${expirado ? ' (expirado)' : ''}</span>`; } },
      { h: 'Total', class: 'num', cell: q => App.moneyHtml(q.total) },
      { h: 'Status', cell: q => App.badge(q.status) },
      { h: '', class: 'num', cell: q => `
        <button class="btn sm ghost" onclick="location.hash='#/quotes/${q.id}'">${q.status === 'aberto' ? 'Editar' : 'Ver'}</button>
        ${q.status === 'aberto' ? `
          <button class="btn sm primary" onclick="Quotes.approve(${q.id})">✓ Aprovar</button>
          <button class="btn sm danger" onclick="Quotes.reject(${q.id})">✗</button>` : ''}
        <button class="btn sm ghost" onclick="Quotes.printOne(${q.id})">🖨️</button>` }
    ]);
  };
  render();
  document.getElementById('qf').addEventListener('change', render);

  window.Quotes = {
    async approve(id) {
      if (!await App.confirm('Aprovar este orçamento? Uma Ordem de Serviço será criada automaticamente com todos os dados (cliente, cabeçote, serviços e valores).')) return;
      const os = await App.post(`/quotes/${id}/approve`, {});
      App.toast(`Orçamento aprovado — OS nº ${os.numero} criada`, 'ok');
      location.hash = '#/os';
    },
    async reject(id) {
      const m = App.modal(`
        <h2>Recusar / cancelar orçamento</h2>
        <div class="actions" style="border:none;justify-content:flex-start">
          <button class="btn danger" id="r1">Cliente recusou</button>
          <button class="btn" id="r2">Cancelar orçamento</button>
          <button class="btn ghost" onclick="App.closeModal()">Voltar</button>
        </div>`);
      m.querySelector('#r1').onclick = async () => { await App.post(`/quotes/${id}/reject`, { status: 'recusado' }); App.closeModal(); App.route(); };
      m.querySelector('#r2').onclick = async () => { await App.post(`/quotes/${id}/reject`, { status: 'cancelado' }); App.closeModal(); App.route(); };
    },
    printOne(id) {
      const q = quotes.find(x => x.id === id);
      const c = clients.find(x => x.id === q.clienteId) || {};
      App.print(`Orçamento nº ${q.numero}`, `
        <table><tr><th style="width:50%">Cliente</th><th>CPF/CNPJ</th><th>Data</th><th>Validade</th></tr>
        <tr><td>${App.esc(c.nome || '')}</td><td>${App.esc(q.cpfCnpj || '')}</td>
        <td>${App.date(q.dataOrcamento)}</td><td>${q.validadeDias} dias</td></tr></table>
        <table><tr><th>Modelo</th><th>Chegada</th><th>Previsão de entrega</th></tr>
        <tr><td>${App.esc(q.modelo || '')}</td><td>${App.date(q.dataChegada)}</td><td>${App.date(q.previsaoEntrega)}</td></tr></table>
        ${q.problema ? `<h3>Problema relatado</h3><p>${App.esc(q.problema)}</p>` : ''}
        ${q.descricaoServico ? `<h3>Descrição do serviço</h3><p>${App.esc(q.descricaoServico)}</p>` : ''}
        <h3>Itens</h3>
        <table><tr><th>Serviço / Item</th><th class="num">Qtd</th><th class="num">Valor unit.</th><th class="num">Total</th></tr>
        ${q.itens.map(i => `<tr><td>${App.esc(i.nome)}</td><td class="num">${i.qtd}</td>
          <td class="num">R$ ${App.money(i.valorUnit)}</td><td class="num">R$ ${App.money(i.total)}</td></tr>`).join('')}
        ${q.custosAdicionais ? `<tr><td colspan="3">Custos adicionais</td><td class="num">R$ ${App.money(q.custosAdicionais)}</td></tr>` : ''}
        <tr><td colspan="3"><b>TOTAL DO ORÇAMENTO</b></td><td class="num"><b>R$ ${App.money(q.total)}</b></td></tr></table>
        ${q.observacoes ? `<h3>Observações</h3><p>${App.esc(q.observacoes)}</p>` : ''}
        <div class="sig"><div>Jaques Motorsport</div><div>Cliente</div></div>`,
        `Cliente: ${c.nome || ''} — validade ${q.validadeDias} dias`);
    },
    print() {
      const f = document.getElementById('qf').value;
      const list = quotes.filter(q => !f || q.status === f);
      App.print('Orçamentos' + (f ? ' — ' + (App.STATUS[f] || [f])[0] : ''),
        `<table><tr><th>Nº</th><th>Cliente</th><th>Modelo</th><th>Data</th><th class="num">Total</th><th>Status</th></tr>
        ${list.map(q => `<tr><td>${q.numero}</td><td>${App.esc(App.clientName(q.clienteId, clients))}</td>
        <td>${App.esc(q.modelo || '')}</td><td>${App.date(q.dataOrcamento)}</td>
        <td class="num">R$ ${App.money(q.total)}</td><td>${(App.STATUS[q.status] || [q.status])[0]}</td></tr>`).join('')}</table>`,
        list.length + ' orçamento(s)');
    }
  };
});

/* ---- Editor de orçamento (novo ou existente) ---- */
async function quoteEditor(view, { entryId, quoteId }) {
  const [clients, catalog, entries] = await Promise.all([
    App.get('/clients'), App.get('/serviceCatalog'), App.get('/headEntries')]);
  const quote = quoteId ? await App.get('/quotes/' + quoteId) : null;
  const entry = quote ? entries.find(e => e.id === quote.entryId)
    : entryId ? entries.find(e => e.id === entryId) : null;
  const readOnly = quote && quote.status !== 'aberto';

  App.setTitle(quote ? `Orçamento nº ${quote.numero}` : 'Novo orçamento',
    entry ? `Vinculado à entrada ${entry.codigo}` : 'Orçamento avulso');

  let itens = quote ? JSON.parse(JSON.stringify(quote.itens)) : [];
  const activeCatalog = catalog.filter(s => s.ativo);

  const totals = () => {
    const t = itens.reduce((s, i) => s + i.qtd * i.valorUnit, 0);
    const extras = Number(document.getElementById('q-extras')?.value) || (quote ? quote.custosAdicionais : 0) || 0;
    return { itens: t, extras, total: t + extras };
  };

  const renderItems = () => {
    const t = totals();
    document.getElementById('q-items').innerHTML = `
      ${App.table(itens.map((i, idx) => Object.assign({ _idx: idx }, i)), [
        { h: 'Serviço / Item', cell: i => App.esc(i.nome) },
        { h: 'Qtd', class: 'num', cell: i => readOnly ? i.qtd :
          `<input type="number" min="0" step="0.5" value="${i.qtd}" style="width:70px;text-align:right" onchange="QE.setQty(${i._idx}, this.value)">` },
        { h: 'Valor unit.', class: 'num', cell: i => readOnly ? 'R$ ' + App.money(i.valorUnit) :
          `<input type="number" min="0" step="0.01" value="${i.valorUnit}" style="width:110px;text-align:right" onchange="QE.setVal(${i._idx}, this.value)"
             title="Valor personalizado deste orçamento — não altera o preço-base do catálogo">` },
        { h: 'Total', class: 'num', cell: i => '<b>R$ ' + App.money(i.qtd * i.valorUnit) + '</b>' },
        ...(readOnly ? [] : [{ h: '', class: 'num', cell: i => `<button class="btn sm ghost" onclick="QE.rm(${i._idx})">✕</button>` }])
      ], { emptyMsg: 'Adicione serviços do catálogo abaixo' })}
      <div style="display:flex;justify-content:flex-end;gap:26px;padding:12px 6px;font-size:14px">
        <span class="muted">Itens: <b>R$ ${App.money(t.itens)}</b></span>
        <span class="muted">Adicionais: <b>R$ ${App.money(t.extras)}</b></span>
        <span>TOTAL: <b style="font-size:17px;color:var(--accent-strong)">R$ ${App.money(t.total)}</b></span>
      </div>`;
  };

  view.innerHTML = `
    <div class="toolbar"><a class="btn sm ghost" href="#/quotes">← Voltar</a>
      ${quote ? App.badge(quote.status) : ''}</div>
    <div class="grid cols-2">
      <div class="card">
        <h3>DADOS DO ORÇAMENTO</h3>
        <div class="formgrid">
          <label class="field full"><span>Cliente *</span>
            <select id="q-cliente" ${entry || readOnly ? 'disabled' : ''}>
              ${App.clientOptions(clients).map(o => `<option value="${o.value}"
                ${String(o.value) === String(quote ? quote.clienteId : entry ? entry.clienteId : '') ? 'selected' : ''}>${App.esc(o.label)}</option>`).join('')}
            </select></label>
          <label class="field"><span>Data do orçamento</span>
            <input type="date" id="q-data" value="${quote ? quote.dataOrcamento : App.today()}" ${readOnly ? 'disabled' : ''}></label>
          <label class="field"><span>Validade (dias)</span>
            <input type="number" id="q-validade" value="${quote ? quote.validadeDias : App.meta.settings.quoteValidityDays}" ${readOnly ? 'disabled' : ''}></label>
          <label class="field"><span>Data de chegada do cabeçote</span>
            <input type="date" id="q-chegada" value="${quote ? quote.dataChegada : entry ? entry.dataChegada : ''}" ${entry || readOnly ? 'disabled' : ''}></label>
          <label class="field"><span>Previsão de entrega</span>
            <input type="date" id="q-previsao" value="${quote ? quote.previsaoEntrega || '' : ''}" ${readOnly ? 'disabled' : ''}></label>
          <label class="field full"><span>Modelo do cabeçote</span>
            <input id="q-modelo" value="${App.esc(quote ? quote.modelo : entry ? entry.modelo : '')}" ${readOnly ? 'disabled' : ''}></label>
          <label class="field full"><span>Descrição do problema</span>
            <textarea id="q-problema" ${readOnly ? 'disabled' : ''}>${App.esc(quote ? quote.problema : entry ? entry.defeito : '')}</textarea></label>
          <label class="field full"><span>Descrição do serviço</span>
            <textarea id="q-servico" ${readOnly ? 'disabled' : ''}>${App.esc(quote ? quote.descricaoServico : '')}</textarea></label>
          <label class="field"><span>Custos adicionais (R$)</span>
            <input type="number" step="0.01" id="q-extras" value="${quote ? quote.custosAdicionais || 0 : 0}" ${readOnly ? 'disabled' : ''}></label>
          <label class="field full"><span>Observações</span>
            <textarea id="q-obs" ${readOnly ? 'disabled' : ''}>${App.esc(quote ? quote.observacoes : '')}</textarea></label>
        </div>
      </div>
      <div class="card">
        <h3>SERVIÇOS DO CATÁLOGO</h3>
        ${readOnly ? '' : `
        <div class="inline-inputs" style="margin-bottom:10px">
          <select id="q-cat">
            ${activeCatalog.map(s => `<option value="${s.id}">${App.esc(s.nome)} — R$ ${App.money(s.preco)}${s.preco === 0 ? ' (definir)' : ''}</option>`).join('')}
          </select>
          <button class="btn primary" onclick="QE.add()" style="flex:none">+ Adicionar</button>
        </div>
        <div class="inline-inputs" style="margin-bottom:12px">
          <input id="q-avulso" placeholder="Ou item avulso (nome)…">
          <input id="q-avulso-v" type="number" step="0.01" placeholder="Valor" style="max-width:110px">
          <button class="btn" onclick="QE.addAvulso()" style="flex:none">+</button>
        </div>`}
        <div id="q-items"></div>
        ${readOnly ? '' : `<div class="actions" style="border:none">
          <button class="btn primary" onclick="QE.save()">${quote ? 'Salvar alterações' : 'Criar orçamento'}</button>
        </div>`}
      </div>
    </div>`;
  renderItems();
  document.getElementById('q-extras')?.addEventListener('input', renderItems);

  window.QE = {
    add() {
      const s = activeCatalog.find(x => x.id === Number(document.getElementById('q-cat').value));
      if (!s) return;
      itens.push({ serviceId: s.id, nome: s.nome, qtd: 1, valorUnit: s.preco });
      renderItems();
    },
    addAvulso() {
      const nome = document.getElementById('q-avulso').value.trim();
      if (!nome) return;
      itens.push({ serviceId: null, nome, qtd: 1, valorUnit: Number(document.getElementById('q-avulso-v').value) || 0 });
      document.getElementById('q-avulso').value = ''; document.getElementById('q-avulso-v').value = '';
      renderItems();
    },
    setQty(i, v) { itens[i].qtd = Number(v) || 0; renderItems(); },
    setVal(i, v) { itens[i].valorUnit = Number(v) || 0; renderItems(); },
    rm(i) { itens.splice(i, 1); renderItems(); },
    async save() {
      const body = {
        clienteId: Number(document.getElementById('q-cliente').value),
        entryId: entry ? entry.id : null,
        dataOrcamento: document.getElementById('q-data').value,
        dataChegada: document.getElementById('q-chegada').value,
        validadeDias: Number(document.getElementById('q-validade').value),
        previsaoEntrega: document.getElementById('q-previsao').value,
        modelo: document.getElementById('q-modelo').value,
        problema: document.getElementById('q-problema').value,
        descricaoServico: document.getElementById('q-servico').value,
        custosAdicionais: Number(document.getElementById('q-extras').value) || 0,
        observacoes: document.getElementById('q-obs').value,
        itens
      };
      if (!body.clienteId) return App.toast('Selecione o cliente', 'err');
      if (!itens.length) return App.toast('Adicione ao menos um item', 'err');
      try {
        if (quote) await App.put('/quotes/' + quote.id, body);
        else await App.post('/quotes', body);
        App.toast('Orçamento salvo', 'ok');
        location.hash = '#/quotes';
      } catch (e) { App.toast(e.message, 'err'); }
    }
  };
}

/* ================= ORDENS DE SERVIÇO ================= */
App.registerView('os', async (view) => {
  App.setTitle('Ordens de serviço', 'Serviços de preparação e retrabalho de cabeçotes de clientes');
  const [oss, clients] = await Promise.all([App.get('/serviceOrders'), App.get('/clients')]);
  oss.sort((a, b) => b.id - a.id);
  const OS_ST = ['em_analise', 'em_andamento', 'aguardando_peca', 'finalizado', 'aguardando_pagamento', 'cancelado'];

  view.innerHTML = `
    <div class="toolbar">
      <select id="osf" style="max-width:220px">
        <option value="">Todos os status</option>
        ${OS_ST.map(s => `<option value="${s}">${(App.STATUS[s] || [s])[0]}</option>`).join('')}
      </select>
      <div class="spacer"></div>
      <button class="btn" onclick="OS.print()">🖨️ Imprimir</button>
    </div>
    <div id="os-table"></div>`;

  const render = () => {
    const f = document.getElementById('osf').value;
    const list = oss.filter(o => !f || o.status === f);
    document.getElementById('os-table').innerHTML = App.table(list, [
      { h: 'OS', cell: o => `<b>nº ${o.numero}</b><div class="small muted">${App.esc(o.identificacao || '')}</div>` },
      { h: 'Cliente', cell: o => App.esc(App.clientName(o.clienteId, clients)) },
      { h: 'Modelo', cell: o => App.esc(o.modelo || '—') },
      { h: 'Serviços', cell: o => `<span class="small">${(o.itens || []).slice(0, 3).map(i => App.esc(i.nome)).join(', ')}${o.itens.length > 3 ? '…' : ''}</span>` },
      { h: 'Valor', class: 'num', cell: o => App.moneyHtml(o.valorTotal) },
      { h: 'Previsão', cell: o => App.date(o.previsaoEntrega) },
      { h: 'Responsável', cell: o => App.esc(App.userName(o.responsavelId)) },
      { h: 'Status', cell: o => App.badge(o.status) },
      { h: 'Pagto', cell: o => App.badge(o.pagamentoStatus) },
      { h: 'Envio', cell: o => App.badge(o.envioStatus === 'na_empresa' ? 'na_empresa' : o.envioStatus) },
      { h: '', class: 'num', cell: o => `<button class="btn sm" onclick="OS.open(${o.id})">Abrir</button>` }
    ]);
  };
  render();
  document.getElementById('osf').addEventListener('change', render);

  window.OS = {
    open(id) {
      const o = oss.find(x => x.id === id);
      const users = App.meta.users.filter(u => u.active);
      App.modal(`
        <h2>OS nº ${o.numero} — ${App.esc(App.clientName(o.clienteId, clients))}</h2>
        <p class="small muted">${App.esc(o.identificacao || '')} · ${App.esc(o.modelo || '')} · Orçamento vinculado nº ${o.quoteId || '—'}</p>
        <hr class="sep">
        <div class="formgrid">
          <label class="field"><span>Status</span>
            <select id="os-st">${OS_ST.map(s => `<option value="${s}" ${o.status === s ? 'selected' : ''}>${(App.STATUS[s] || [s])[0]}</option>`).join('')}</select></label>
          <label class="field"><span>Responsável</span>
            <select id="os-resp"><option value="">—</option>${users.map(u =>
              `<option value="${u.id}" ${o.responsavelId === u.id ? 'selected' : ''}>${App.esc(u.name)}</option>`).join('')}</select></label>
          <label class="field"><span>Envio / entrega</span>
            <select id="os-envio">${['na_empresa', 'pronto', 'enviado', 'entregue'].map(s =>
              `<option value="${s}" ${o.envioStatus === s ? 'selected' : ''}>${(App.STATUS[s] || [s])[0]}</option>`).join('')}</select></label>
          <label class="field"><span>NF de retorno</span><input id="os-nf" value="${App.esc(o.nfRetorno || '')}"></label>
        </div>
        <h3 style="margin:8px 0">Serviços</h3>
        ${App.table(o.itens || [], [
          { h: 'Serviço', cell: i => App.esc(i.nome) },
          { h: 'Qtd', class: 'num', cell: i => i.qtd },
          { h: 'Total', class: 'num', cell: i => 'R$ ' + App.money(i.total) }
        ])}
        <p style="text-align:right;margin-top:6px">Total: <b>R$ ${App.money(o.valorTotal)}</b> · Pagamento: ${App.badge(o.pagamentoStatus)}</p>
        <h3 style="margin:8px 0">Histórico</h3>
        <ul class="timeline">${(o.historico || []).slice().reverse().map(h =>
          `<li><div class="when">${App.dateTime(h.at)} · ${App.esc(h.por)}</div><div class="what">${App.esc(h.evento)}</div></li>`).join('')}</ul>
        <div class="actions">
          ${o.pagamentoStatus === 'pendente' && App.can('receivables') ? `<button class="btn" onclick="OS.payment(${o.id})">💰 Registrar pagamento</button>` : ''}
          <button class="btn" onclick="OS.printOne(${o.id})">🖨️ Imprimir OS</button>
          <button class="btn primary" onclick="OS.save(${o.id})">Salvar</button>
        </div>`, { wide: true });
    },
    async save(id) {
      const o = oss.find(x => x.id === id);
      const st = document.getElementById('os-st').value;
      const resp = document.getElementById('os-resp').value;
      if (st !== o.status || Number(resp || 0) !== (o.responsavelId || 0)) {
        await App.post(`/os/${id}/status`, { status: st, responsavelId: resp ? Number(resp) : null });
      }
      const envio = document.getElementById('os-envio').value;
      const nf = document.getElementById('os-nf').value;
      if (envio !== o.envioStatus || nf !== (o.nfRetorno || '')) {
        await App.post(`/os/${id}/envio`, { envioStatus: envio, nfRetorno: nf });
      }
      App.closeModal(); App.toast('OS atualizada', 'ok'); App.route();
    },
    payment(id) {
      const o = oss.find(x => x.id === id);
      App.form(`Pagamento da OS nº ${o.numero} — R$ ${App.money(o.valorTotal)}`, [
        { name: 'forma', label: 'Forma', type: 'select', value: 'pix', options: [
          'pix', 'dinheiro', 'cartao', 'link', 'boleto', 'cheque'].map(v => ({ value: v, label: v })) },
        { name: 'valor', label: 'Valor (R$)', type: 'number', step: '0.01', value: o.valorTotal },
        { name: 'parcelado', label: 'Parcelado (gera boletos automáticos)', type: 'checkbox', value: false, full: true },
        { name: 'parcelas', label: 'Nº de parcelas', type: 'number', value: 1 },
        { name: 'intervaloDias', label: 'Intervalo entre parcelas (dias)', type: 'number', value: 30 },
        { name: 'data', label: 'Data (se à vista)', type: 'date', value: App.today() }
      ], async d => {
        await App.post(`/os/${id}/payment`, d);
        App.closeModal(); App.toast('Pagamento registrado', 'ok'); App.route();
      });
    },
    printOne(id) {
      const o = oss.find(x => x.id === id);
      App.print(`Ordem de Serviço nº ${o.numero}`, `
        <table><tr><th>Cliente</th><th>Identificação</th><th>Modelo</th><th>Previsão</th><th>Responsável</th></tr>
        <tr><td>${App.esc(App.clientName(o.clienteId, clients))}</td><td>${App.esc(o.identificacao || '')}</td>
        <td>${App.esc(o.modelo || '')}</td><td>${App.date(o.previsaoEntrega)}</td><td>${App.esc(App.userName(o.responsavelId))}</td></tr></table>
        ${o.problema ? `<h3>Problema</h3><p>${App.esc(o.problema)}</p>` : ''}
        <h3>Serviços a executar</h3>
        <ul class="check">${(o.itens || []).map(i => `<li>${i.qtd}× ${App.esc(i.nome)}</li>`).join('')}</ul>
        ${o.observacoes ? `<h3>Observações</h3><p>${App.esc(o.observacoes)}</p>` : ''}
        <div class="sig"><div>Executado por</div><div>Conferido por</div></div>`,
        `Status: ${(App.STATUS[o.status] || [o.status])[0]}`);
    },
    print() {
      const f = document.getElementById('osf').value;
      const list = oss.filter(o => !f || o.status === f);
      App.print('Ordens de serviço' + (f ? ' — ' + (App.STATUS[f] || [f])[0] : ''),
        `<table><tr><th>OS</th><th>Cliente</th><th>Modelo</th><th>Serviços</th><th>Previsão</th><th>Status</th></tr>
        ${list.map(o => `<tr><td>${o.numero}</td><td>${App.esc(App.clientName(o.clienteId, clients))}</td>
        <td>${App.esc(o.modelo || '')}</td><td>${(o.itens || []).map(i => App.esc(i.nome)).join(', ')}</td>
        <td>${App.date(o.previsaoEntrega)}</td><td>${(App.STATUS[o.status] || [o.status])[0]}</td></tr>`).join('')}</table>`,
        list.length + ' OS');
    }
  };
});
