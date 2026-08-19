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
        <button class="btn sm ghost" onclick="Quotes.replicate(${q.id})" title="Criar um novo orçamento usando este como modelo">📋</button>
        <button class="btn sm ghost wa" onclick="Quotes.wa(${q.id})" title="Enviar orçamento no WhatsApp">✆</button>
        <button class="btn sm ghost" onclick="Quotes.printOne(${q.id})">🖨️</button>` }
    ]);
  };
  render();
  document.getElementById('qf').addEventListener('change', render);

  window.Quotes = {
    wa(id) {
      const q = quotes.find(x => x.id === id);
      const c = clients.find(x => x.id === q.clienteId);
      App.waShare(`Orçamento nº ${q.numero} — ${(c && c.nome) || 'cliente'}`, App.waPhoneOf(c), App.waMsg.quote(q, c));
    },
    /* Novo orçamento com este como modelo: serviços, valores e observações
       vêm juntos; número, data, status e aprovação começam do zero. */
    replicate(id) {
      const q = quotes.find(x => x.id === id);
      if (!q) return;
      const m = App.form(`📋 Replicar orçamento nº ${q.numero}`, [
        { name: 'clienteId', label: 'Cliente do novo orçamento', type: 'select', required: true, full: true,
          value: q.clienteId, options: App.clientOptions(clients, q.clienteId) }
      ], async d => {
        const novo = await App.post(`/quotes/${id}/replicate`, { clienteId: Number(d.clienteId) });
        App.closeModal();
        App.toast(`Orçamento nº ${novo.numero} criado a partir do nº ${q.numero} — revise e salve`, 'ok');
        location.hash = '#/quotes/' + novo.id;
      }, { submitLabel: 'Criar cópia' });
      m.querySelector('.actions').insertAdjacentHTML('afterbegin',
        `<p class="small muted" style="margin-right:auto">Copia serviços, quantidades, valores e observações.<br>
         O orçamento original não é alterado.</p>`);
    },
    /* Aprovar fecha o ciclo inteiro: abre a OS, joga o trabalho na Produção
       e lança o valor em Contas a receber — sem ninguém redigitar nada. */
    approve(id) {
      const q = quotes.find(x => x.id === id);
      if (!q) return;
      const total = Number(q.total) || 0;
      const m = App.form(`✓ Aprovar orçamento nº ${q.numero}`, [
        { name: 'previsaoEntrega', label: 'Previsão de entrega', type: 'date',
          value: q.previsaoEntrega || '', full: true },
        { name: 'forma', label: 'Forma de pagamento', type: 'select', value: 'pix', options: [
          { value: 'pix', label: 'Pix' }, { value: 'dinheiro', label: 'Dinheiro' },
          { value: 'boleto', label: 'Boleto' }, { value: 'cartao', label: 'Cartão' },
          { value: 'cheque', label: 'Cheque' }, { value: 'outro', label: 'Outro' }] },
        { name: 'condicao', label: 'Condição', type: 'select', value: 'a_vista', options: [
          { value: 'a_vista', label: 'Cobrança única' },
          { value: 'parcelado', label: 'Parcelado' }] },
        { name: 'parcelas', label: 'Nº de parcelas', type: 'number', value: 1 },
        { name: 'intervaloDias', label: 'Intervalo entre parcelas (dias)', type: 'number', value: 30 },
        { name: 'vencimento', label: 'Vencimento da cobrança única', type: 'date', value: '' },
        { name: 'entrada', label: 'Entrada recebida agora (R$) — opcional', type: 'number', step: '0.01', value: '' }
      ], async d => {
        const os = await App.post(`/quotes/${id}/approve`, {
          previsaoEntrega: d.previsaoEntrega,
          forma: d.forma,
          parcelado: d.condicao === 'parcelado',
          parcelas: Number(d.parcelas) || 1,
          intervaloDias: Number(d.intervaloDias) || 30,
          vencimento: d.vencimento,
          entrada: Number(d.entrada) || 0
        });
        App.closeModal();
        App.toast(`Orçamento aprovado — OS nº ${os.numero}, produção e cobrança criadas`, 'ok');
        location.hash = '#/os';
      }, { submitLabel: 'Aprovar e abrir a OS' });

      m.querySelector('.actions').insertAdjacentHTML('afterbegin',
        `<p class="small muted" style="margin-right:auto">Valor do serviço: <b>R$ ${App.money(total)}</b><br>
         O trabalho entra na <b>Produção</b> e o valor em <b>Contas a receber</b> automaticamente.</p>`);

      /* Só mostra o que faz sentido para a condição escolhida. */
      const campo = n => m.querySelector(`[name=${n}]`).closest('.field');
      const ajustar = () => {
        const parcelado = m.querySelector('[name=condicao]').value === 'parcelado';
        campo('parcelas').style.display = parcelado ? '' : 'none';
        campo('intervaloDias').style.display = parcelado ? '' : 'none';
        campo('vencimento').style.display = parcelado ? 'none' : '';
      };
      m.querySelector('[name=condicao]').addEventListener('change', ajustar);
      ajustar();
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
      ${quote ? App.badge(quote.status) : ''}
      ${quote ? '<div class="spacer"></div><button class="btn sm ghost wa" onclick="QE.wa()">✆ Enviar no WhatsApp</button>' : ''}</div>
    <div class="grid cols-2">
      <div class="card">
        <h3>DADOS DO ORÇAMENTO</h3>
        <div class="formgrid">
          <label class="field full"><span>Cliente *</span>
            <select id="q-cliente" ${entry || readOnly ? 'disabled' : ''}>
              ${App.clientOptions(clients, quote ? quote.clienteId : entry ? entry.clienteId : '').map(o => `<option value="${o.value}"
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
    wa() {
      const c = clients.find(x => x.id === quote.clienteId);
      App.waShare(`Orçamento nº ${quote.numero} — ${(c && c.nome) || 'cliente'}`, App.waPhoneOf(c), App.waMsg.quote(quote, c));
    },
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
  const verValores = App.can('cashflow') || App.can('receivables') || App.can('payables') || App.can('finance_sensitive');

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
      { h: 'OS / Cliente', cell: o => `<b>OS ${o.numero} — ${App.esc(App.clientName(o.clienteId, clients))}</b>
        <div class="small muted">${[o.identificacao, o.modelo].filter(Boolean).map(x => App.esc(x)).join(' · ') || '—'}</div>` },
      { h: 'Serviços', cell: o => `<span class="small">${(o.itens || []).slice(0, 3).map(i => App.esc(i.nome)).join(', ')}${o.itens.length > 3 ? '…' : ''}</span>` },
      ...(verValores ? [{ h: 'Valor', class: 'num', cell: o => App.moneyHtml(o.valorTotal) }] : []),
      { h: 'Previsão', cell: o => App.date(o.previsaoEntrega) },
      { h: 'Responsável', cell: o => App.esc(App.userName(o.responsavelId)) },
      { h: 'Status', cell: o => App.badge(o.status) },
      ...(verValores ? [{ h: 'Pagto', cell: o => App.badge(o.pagamentoStatus) }] : []),
      { h: 'Envio', cell: o => App.badge(o.envioStatus === 'na_empresa' ? 'na_empresa' : o.envioStatus) },
      { h: '', class: 'num', cell: o => `
        <button class="btn sm" onclick="OS.open(${o.id})">Abrir</button>
        ${App.can('finance_sensitive') ? `<button class="btn sm ghost" onclick="OS.custos(${o.id})" title="Custo estimado × custo real">💲</button>` : ''}
        <button class="btn sm ghost" onclick="OS.editar(${o.id})" title="Editar OS">✏️</button>
        <button class="btn sm ghost" onclick="OS.duplicar(${o.id})" title="Duplicar OS">📋</button>
        ${o.status === 'cancelada' ? '' : `<button class="btn sm ghost" onclick="OS.cancelar(${o.id})" title="Cancelar OS">🚫</button>`}
        <button class="btn sm ghost" onclick="OS.excluir(${o.id})" title="Excluir OS">🗑</button>` }
    ]);
  };
  render();
  document.getElementById('osf').addEventListener('change', render);

  window.OS = {
    /* Custos do serviço: estimativa (custo-base) × o que foi gasto de verdade.
       O resultado usa o real quando existe; senão, a estimativa. */
    async custos(id) {
      const o = oss.find(x => x.id === id);
      const d = await App.get(`/os/${id}/custos`);
      const TIPOS = { mao_obra: 'Mão de obra', materiais: 'Materiais', componentes: 'Componentes',
                      terceirizacao: 'Terceirização', outros: 'Outros' };
      const linhas = (lista, campo) => (lista.length ? lista : [{ tipo: 'mao_obra', descricao: '', valor: '' }])
        .map((c, i) => `
          <div style="display:flex;gap:6px;margin-bottom:5px" data-linha="${campo}">
            <select style="max-width:150px" data-k="tipo">${Object.entries(TIPOS).map(([v, l]) =>
              `<option value="${v}" ${c.tipo === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
            <input placeholder="descrição" value="${App.esc(c.descricao || '')}" data-k="descricao" style="flex:1">
            <input type="number" step="0.01" placeholder="R$" value="${c.valor}" data-k="valor" style="max-width:110px">
            <button class="btn sm ghost" onclick="this.parentElement.remove();OS._somar()">✕</button>
          </div>`).join('');
      const m = App.modal(`
        <h2>Custos da OS nº ${o.numero}</h2>
        <p class="small muted">${App.esc(o.modelo || '')} — valor do serviço: <b>R$ ${App.money(d.resultado.bruto)}</b></p>
        <div class="grid cols-2" style="align-items:start;margin-top:10px">
          <div>
            <div class="section-title">CUSTO-BASE (estimado)</div>
            <div id="cb-lista">${linhas(d.custoBase, 'base')}</div>
            <button class="btn sm" onclick="OS._addLinha('cb-lista','base')">+ linha</button>
          </div>
          <div>
            <div class="section-title">CUSTO REAL (o que foi gasto)</div>
            <div id="cr-lista">${linhas(d.custoReal, 'real')}</div>
            <button class="btn sm" onclick="OS._addLinha('cr-lista','real')">+ linha</button>
          </div>
        </div>
        <div id="os-custo-resumo" class="card" style="margin-top:12px;background:var(--bg-1)"></div>
        <div class="actions">
          <button class="btn" onclick="App.closeModal()">Fechar</button>
          <button class="btn primary" id="os-custo-salvar">Salvar custos</button>
        </div>`, { wide: true });
      OS._modal = m;
      OS._bruto = d.resultado.bruto;
      OS._somar();
      m.addEventListener('input', () => OS._somar());
      m.querySelector('#os-custo-salvar').onclick = async () => {
        const r = await App.put(`/os/${id}/custos`, { custoBase: OS._ler('cb-lista'), custoReal: OS._ler('cr-lista') });
        App.closeModal();
        App.toast(`Custos salvos — resultado ${r.resultado.usouReal ? 'real' : 'previsto'}: R$ ${App.money(r.resultado.resultado)}`, 'ok');
        App.route();
      };
    },
    _addLinha(alvo, campo) {
      const d = document.createElement('div');
      d.style.cssText = 'display:flex;gap:6px;margin-bottom:5px';
      d.dataset.linha = campo;
      d.innerHTML = `
        <select style="max-width:150px" data-k="tipo">
          <option value="mao_obra">Mão de obra</option><option value="materiais">Materiais</option>
          <option value="componentes">Componentes</option><option value="terceirizacao">Terceirização</option>
          <option value="outros">Outros</option></select>
        <input placeholder="descrição" data-k="descricao" style="flex:1">
        <input type="number" step="0.01" placeholder="R$" data-k="valor" style="max-width:110px">
        <button class="btn sm ghost" onclick="this.parentElement.remove();OS._somar()">✕</button>`;
      document.getElementById(alvo).appendChild(d);
    },
    _ler(alvo) {
      return [...document.getElementById(alvo).children].map(l => ({
        tipo: l.querySelector('[data-k=tipo]').value,
        descricao: l.querySelector('[data-k=descricao]').value,
        valor: Number(l.querySelector('[data-k=valor]').value) || 0
      })).filter(c => c.descricao || c.valor);
    },
    _somar() {
      const m = OS._modal;
      if (!m) return;
      const soma = alvo => OS._ler(alvo).reduce((s, c) => s + c.valor, 0);
      const est = soma('cb-lista'), real = soma('cr-lista');
      const bruto = Number(OS._bruto) || 0;
      const usado = real > 0 ? real : est;
      const res = bruto - usado;
      m.querySelector('#os-custo-resumo').innerHTML = `
        <div style="display:flex;gap:22px;flex-wrap:wrap;font-size:13.5px">
          <span>Estimado: <b>R$ ${App.money(est)}</b></span>
          <span>Real: <b>R$ ${App.money(real)}</b></span>
          ${real > 0 ? `<span>Desvio: <b class="${real > est ? 'neg' : 'pos'}">R$ ${App.money(real - est)}</b></span>` : ''}
          <span class="spacer"></span>
          <span>Resultado ${real > 0 ? '(real)' : '(previsto)'}:
            <b class="${res >= 0 ? 'pos' : 'neg'}">R$ ${App.money(res)}</b></span>
        </div>`;
    },

    editar(id) {
      const o = oss.find(x => x.id === id);
      App.form(`✏️ Editar OS nº ${o.numero}`, [
        { name: 'clienteId', label: 'Cliente', type: 'select', value: o.clienteId, full: true,
          options: App.clientOptions(clients, o.clienteId) },
        { name: 'modelo', label: 'Modelo do cabeçote', value: o.modelo || '' },
        { name: 'identificacao', label: 'Identificação', value: o.identificacao || '' },
        { name: 'problema', label: 'Problema relatado', type: 'textarea', value: o.problema || '', full: true },
        { name: 'descricaoServico', label: 'Descrição do serviço', type: 'textarea', value: o.descricaoServico || '', full: true },
        { name: 'valorTotal', label: 'Valor total (R$)', type: 'number', step: '0.01', value: o.valorTotal },
        { name: 'previsaoEntrega', label: 'Previsão de entrega', type: 'date', value: o.previsaoEntrega || '' },
        { name: 'observacoes', label: 'Observações', type: 'textarea', value: o.observacoes || '', full: true }
      ], async d => {
        await App.put('/os/' + id, {
          clienteId: Number(d.clienteId), modelo: d.modelo, identificacao: d.identificacao,
          problema: d.problema, descricaoServico: d.descricaoServico,
          valorTotal: Number(d.valorTotal), previsaoEntrega: d.previsaoEntrega, observacoes: d.observacoes
        });
        App.closeModal(); App.toast('OS atualizada — a alteração ficou no histórico', 'ok'); App.route();
      });
    },
    duplicar(id) {
      const o = oss.find(x => x.id === id);
      App.form(`📋 Duplicar OS nº ${o.numero}`, [
        { name: 'clienteId', label: 'Cliente da nova OS', type: 'select', required: true, full: true,
          value: o.clienteId, options: App.clientOptions(clients, o.clienteId) }
      ], async d => {
        const nova = await App.post(`/os/${id}/duplicate`, { clienteId: Number(d.clienteId) });
        App.closeModal();
        App.toast(`OS nº ${nova.numero} criada a partir da nº ${o.numero} — o custo estimado veio junto`, 'ok');
        App.route();
      }, { submitLabel: 'Duplicar' });
    },
    cancelar(id) {
      const o = oss.find(x => x.id === id);
      App.form(`🚫 Cancelar OS nº ${o.numero}`, [
        { name: 'motivo', label: 'Motivo do cancelamento', type: 'textarea', full: true }
      ], async d => {
        await App.post(`/os/${id}/cancel`, { motivo: d.motivo });
        App.closeModal();
        App.toast('OS cancelada — parcelas em aberto canceladas, histórico preservado', 'ok');
        App.route();
      }, { submitLabel: 'Cancelar OS' });
    },
    async excluir(id) {
      const o = oss.find(x => x.id === id);
      if (!await App.confirm(`Excluir a OS nº ${o.numero}? Se já houver pagamento registrado, o sistema recusa e o caminho é Cancelar.`)) return;
      try {
        await App.del('/os/' + id);
        App.toast('OS excluída', 'ok');
        App.route();
      } catch (e) { App.toast(e.message, 'err'); }
    },
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
          ...(verValores ? [{ h: 'Total', class: 'num', cell: i => 'R$ ' + App.money(i.total) }] : [])
        ])}
        ${verValores ? `<p style="text-align:right;margin-top:6px">Total: <b>R$ ${App.money(o.valorTotal)}</b> · Pagamento: ${App.badge(o.pagamentoStatus)}</p>
        <div id="os-fin" class="small muted" style="text-align:right">carregando financeiro…</div>` : ''}
        <h3 style="margin:8px 0">Histórico</h3>
        <ul class="timeline">${(o.historico || []).slice().reverse().map(h =>
          `<li><div class="when">${App.dateTime(h.at)} · ${App.esc(h.por)}</div><div class="what">${App.esc(h.evento)}</div></li>`).join('')}</ul>
        <div class="actions">
          ${App.can('receivables') ? `
            <button class="btn primary" onclick="OS.receber(${o.id})">💰 Registrar recebimento</button>
            <button class="btn" onclick="OS.payment(${o.id})" title="Trocar a forma de pagamento e refazer as parcelas em aberto">🧾 Forma de pagamento</button>` : ''}
          <button class="btn wa" onclick="OS.wa(${o.id})" title="Avisar o cliente no WhatsApp">✆ WhatsApp</button>
          <button class="btn" onclick="OS.etiqueta(${o.id})" title="Etiqueta de envio com os dados do cliente">📦 Etiqueta</button>
          <button class="btn" onclick="OS.printOne(${o.id})">🖨️ Imprimir OS</button>
          <button class="btn primary" onclick="OS.save(${o.id})">Salvar</button>
        </div>`, { wide: true });
      if (verValores) OS._resumoFinanceiro(id);
    },

    /* Resumo do que já entrou e do que falta neste serviço. */
    async _resumoFinanceiro(id) {
      const el = document.getElementById('os-fin');
      if (!el) return;
      try {
        const d = await App.get(`/os/${id}/financeiro`);
        const parcelas = (d.parcelas || []).filter(p => p.status !== 'cancelada');
        el.innerHTML = `Recebido <b class="pos">R$ ${App.money(d.recebido)}</b> ·
          Saldo em aberto <b class="${d.saldo > 0 ? 'neg' : 'pos'}">R$ ${App.money(d.saldo)}</b>
          ${parcelas.length ? ` · ${parcelas.length} parcela(s) em Contas a receber` : ''}`;
      } catch (e) { el.textContent = ''; }
    },

    /* Recebimento (total ou parcial) — mesma regra da venda de cabeçote:
       serviço de R$ 3.000 com entrada de R$ 1.500 deixa R$ 1.500 em aberto. */
    async receber(id) {
      const o = oss.find(x => x.id === id);
      let d;
      try { d = await App.get(`/os/${id}/financeiro`); }
      catch (e) { return App.toast(e.message, 'err'); }
      if (d.saldo <= 0.005) return App.toast('Este serviço já está quitado.', 'ok');

      const m = App.form(`💰 Receber — OS nº ${o.numero}`, [
        { name: 'valor', label: 'Valor recebido agora (R$)', type: 'number', step: '0.01',
          value: d.saldo.toFixed(2), required: true },
        { name: 'forma', label: 'Forma', type: 'select', value: 'pix',
          options: ['pix', 'dinheiro', 'cartao', 'boleto', 'cheque', 'transferencia']
            .map(v => ({ value: v, label: v })) },
        { name: 'data', label: 'Data do recebimento', type: 'date', value: App.today(), required: true },
        { name: 'vencimentoSaldo', label: 'Vencimento do saldo (se sobrar)', type: 'date',
          value: o.previsaoEntrega || '' },
        { name: 'obs', label: 'Observação', full: true }
      ], async v => {
        const out = await App.post(`/os/${id}/receive`, {
          valor: Number(v.valor), forma: v.forma, data: v.data,
          vencimentoSaldo: v.vencimentoSaldo, obs: v.obs
        });
        App.closeModal();
        App.toast(out.saldo > 0
          ? `Recebido — saldo em aberto: R$ ${App.money(out.saldo)}`
          : 'Serviço quitado', 'ok');
        App.route();
      }, { submitLabel: 'Registrar recebimento' });

      m.querySelector('.actions').insertAdjacentHTML('afterbegin',
        `<p class="small muted" style="margin-right:auto">Valor do serviço: <b>R$ ${App.money(d.total)}</b> ·
         já recebido <b>R$ ${App.money(d.recebido)}</b> · em aberto <b>R$ ${App.money(d.saldo)}</b><br>
         O que sobrar continua em Contas a receber e na projeção.</p>` +
        ((d.recebimentos || []).length
          ? `<div style="width:100%;margin-top:8px">${App.table(d.recebimentos.map((r, i) => Object.assign({ _i: i }, r)), [
              { h: 'Recebido em', cell: r => App.date(r.data) },
              { h: 'Forma', cell: r => App.esc(r.forma || '—') },
              { h: 'Valor', class: 'num', cell: r => App.moneyHtml(r.valor) },
              { h: '', class: 'num', cell: r => `<button class="btn sm ghost" onclick="OS.desfazerRecebimento(${id}, ${r._i})" title="Desfazer este recebimento">↩️</button>` }
            ])}</div>`
          : ''));
    },

    async desfazerRecebimento(id, index) {
      if (!await App.confirm('Desfazer este recebimento? A entrada correspondente sai do caixa e o saldo volta para Contas a receber.')) return;
      try {
        const out = await App.post(`/os/${id}/unreceive`, { index });
        App.closeModal();
        App.toast(`Recebimento desfeito — saldo R$ ${App.money(out.saldo)}`, 'ok');
        App.route();
      } catch (e) { App.toast(e.message, 'err'); }
    },
    etiqueta(id) {
      const o = oss.find(x => x.id === id);
      const c = clients.find(x => x.id === o.clienteId) || {};
      Etiqueta.abrir('serviceOrders', o, c);
    },
    wa(id) {
      const o = oss.find(x => x.id === id);
      const c = clients.find(x => x.id === o.clienteId);
      App.waShare(`OS nº ${o.numero} — ${(c && c.nome) || 'cliente'}`, App.waPhoneOf(c), App.waMsg.os(o, c));
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
    /* Define/troca a forma de pagamento: as parcelas em aberto são refeitas,
       e o que já foi recebido nunca é tocado — nada de cobrança duplicada. */
    payment(id) {
      const o = oss.find(x => x.id === id);
      const m = App.form(`🧾 Forma de pagamento — OS nº ${o.numero}`, [
        { name: 'forma', label: 'Forma', type: 'select', value: (o.pagamento || {}).forma || 'boleto', options: [
          'pix', 'dinheiro', 'cartao', 'link', 'boleto', 'cheque'].map(v => ({ value: v, label: v })) },
        { name: 'valor', label: 'Valor (R$)', type: 'number', step: '0.01', value: o.valorTotal },
        { name: 'aVistaAgora', label: 'Já recebido à vista (entra no caixa agora)', type: 'checkbox', value: false, full: true },
        { name: 'parcelado', label: 'Parcelado (gera as parcelas em Contas a receber)', type: 'checkbox', value: false, full: true },
        { name: 'parcelas', label: 'Nº de parcelas', type: 'number', value: (o.pagamento || {}).parcelas || 1 },
        { name: 'intervaloDias', label: 'Intervalo entre parcelas (dias)', type: 'number', value: 30 },
        { name: 'vencimento', label: 'Vencimento (cobrança única)', type: 'date', value: o.previsaoEntrega || '' },
        { name: 'data', label: 'Data (se à vista)', type: 'date', value: App.today() }
      ], async d => {
        await App.post(`/os/${id}/payment`, d);
        App.closeModal(); App.toast('Cobrança do serviço atualizada', 'ok'); App.route();
      }, { submitLabel: 'Aplicar' });
      m.querySelector('.actions').insertAdjacentHTML('afterbegin',
        `<p class="small muted" style="margin-right:auto">As parcelas <b>em aberto</b> deste serviço são refeitas.<br>
         O que já foi recebido continua como está.</p>`);
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
