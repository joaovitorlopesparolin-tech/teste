/* Compras (com leitura de NF-e), fornecedores e fechamento mensal com divergência */
'use strict';

/* ================= COMPRAS ================= */
App.registerView('purchases', async (view) => {
  App.setTitle('Compras', 'Com ou sem nota fiscal — sempre no controle gerencial');
  const [purchases, suppliers, clients, serviceOrders, sales] = await Promise.all([
    App.get('/purchases'), App.get('/suppliers'), App.get('/clients'),
    App.get('/serviceOrders'), App.get('/sales')]);
  /* A referência é sempre a DATA DA COMPRA — não o vencimento nem o pagamento.
     Padrão: mais recente primeiro. */
  let ordemData = 'desc';
  let periodo = 'todos', de = '', ate = '';

  const hoje = App.today();
  const somaDias = (d, n) => {
    const x = new Date(d + 'T12:00:00');
    x.setDate(x.getDate() + n);
    return x.toISOString().slice(0, 10);
  };
  const mesDe = d => d.slice(0, 7);
  const mesAnterior = () => {
    const x = new Date(hoje + 'T12:00:00');
    x.setMonth(x.getMonth() - 1);
    return x.toISOString().slice(0, 7);
  };
  /* Semana começando no domingo, como o calendário brasileiro. */
  const inicioSemana = () => somaDias(hoje, -new Date(hoje + 'T12:00:00').getDay());

  const noPeriodo = (d) => {
    if (!d) return periodo === 'todos';
    if (periodo === 'todos') return true;
    if (periodo === 'hoje') return d === hoje;
    if (periodo === 'semana') return d >= inicioSemana() && d <= hoje;
    if (periodo === 'mes') return mesDe(d) === mesDe(hoje);
    if (periodo === 'anterior') return mesDe(d) === mesAnterior();
    if (periodo === 'custom') return (!de || d >= de) && (!ate || d <= ate);
    return true;
  };

  const DOCS = { nf: 'NF', recibo: 'Recibo', comprovante: 'Comprovante', sem_documento: 'Sem documento', outro: 'Outro' };

  /* Agendamentos de pagamento: [chave, nome, explicação] */
  const AGEND = [
    ['programado', 'Sexta-feira anterior ao vencimento',
      'Regra da casa: o sistema acha sozinho a sexta anterior — venc. qui 20/08 paga sex 14/08'],
    ['imediato', 'Imediato',
      'Pago na hora da compra: mercado, limpeza, água, emergências, despesas do dia a dia'],
    ['a_cada_30', 'A cada 30 dias',
      'Fornecedor de acumulado (Jaú, Retifoz, Ferragens, Mangopar…): cada compra registrada, pagamento consolidado depois'],
    ['inicio_mes', 'Início do mês seguinte',
      'Fornecedor de fechamento mensal: compras de agosto pagam no início de setembro, no dia escolhido abaixo'],
    ['outro', 'Outro (data combinada)',
      'Condição negociada com o fornecedor: dia 10, dia 15, uma data específica — você define abaixo']
  ];
  const agendNome = v => (AGEND.find(x => x[0] === v) || ['', v || '—'])[1];

  view.innerHTML = `
    <div class="toolbar">
      <button class="btn primary" onclick="Purch.create()">+ Nova compra</button>
      <button class="btn" onclick="Purch.importNfe()">📎 Importar NF-e (XML)</button>
      <select id="pc-periodo" style="max-width:170px" title="Filtrar pela data da compra">
        <option value="todos">Todo o período</option>
        <option value="hoje">Hoje</option>
        <option value="semana">Esta semana</option>
        <option value="mes">Este mês</option>
        <option value="anterior">Mês anterior</option>
        <option value="custom">Período personalizado…</option>
      </select>
      <span id="pc-custom" style="display:none;gap:6px;align-items:center">
        <input type="date" id="pc-de" style="max-width:150px" title="De">
        <span class="muted small">até</span>
        <input type="date" id="pc-ate" style="max-width:150px" title="Até">
      </span>
      <select id="pc-ordem" style="max-width:200px" title="Ordenar pela data da compra">
        <option value="desc">Mais recentes primeiro</option>
        <option value="asc">Mais antigas primeiro</option>
      </select>
      <div class="spacer"></div>
      <span class="muted small" id="pc-contagem"></span>
      <button class="btn" onclick="Purch.print()">🖨️ Imprimir</button>
    </div>
    <div id="pc-tabela"></div>`;

  const colunas = [
      { h: 'Data', cell: p => App.date(p.data) },
      { h: 'Fornecedor', cell: p => `<b>${App.esc(p.fornecedorNome || '—')}</b>` },
      { h: 'Itens', cell: p => `<span class="small">${(p.itens || []).slice(0, 3).map(i => App.esc(i.descricao)).join(', ') || '—'}</span>` },
      { h: 'Valor', class: 'num', cell: p => App.moneyHtml(p.valor) },
      { h: 'Documento', cell: p => p.documentoTipo === 'sem_documento'
          ? '<span class="badge warn">sem documento</span>'
          : `${DOCS[p.documentoTipo] || p.documentoTipo} ${App.esc(p.documentoNumero || '')}` },
      { h: 'Categoria', cell: p => `<span class="small">${App.esc(App.catCompraNome(p.categoria))}</span>` },
      { h: 'Vínculo', cell: p => `<span class="small muted">${App.esc(App.vincCompraNome((p.vinculo || {}).tipo))}${p.vinculo && p.vinculo.refNome ? ': ' + App.esc(p.vinculo.refNome) : ''}</span>` },
      { h: 'Pagamento', cell: p => `<span class="small">${App.esc(agendNome(p.tipoPagamento))}${p.parcelas > 1 ? ` · ${p.parcelas}x` : ''}</span>` },
    { h: '', class: 'num', cell: p => `<button class="btn sm ghost" onclick="Purch.edit(${p.id})">✏️ Editar</button>` }
  ];

  const renderCompras = () => {
    const lista = purchases
      .filter(p => noPeriodo(p.data))
      .sort((a, b) => {
        const d = String(a.data || '').localeCompare(String(b.data || ''));
        // Mesmo dia: o lançamento mais novo primeiro, para não embaralhar.
        return (ordemData === 'asc' ? d : -d) || (ordemData === 'asc' ? a.id - b.id : b.id - a.id);
      });
    document.getElementById('pc-tabela').innerHTML =
      App.table(lista, colunas, { emptyMsg: 'Nenhuma compra neste período' });
    const soma = lista.reduce((s, p) => s + (Number(p.valor) || 0), 0);
    document.getElementById('pc-contagem').textContent =
      `${lista.length} compra(s) · R$ ${App.money(soma)}`;
  };

  document.getElementById('pc-periodo').addEventListener('change', e => {
    periodo = e.target.value;
    document.getElementById('pc-custom').style.display = periodo === 'custom' ? 'inline-flex' : 'none';
    renderCompras();
  });
  document.getElementById('pc-de').addEventListener('change', e => { de = e.target.value; renderCompras(); });
  document.getElementById('pc-ate').addEventListener('change', e => { ate = e.target.value; renderCompras(); });
  document.getElementById('pc-ordem').addEventListener('change', e => { ordemData = e.target.value; renderCompras(); });
  renderCompras();

  window.Purch = {
    create(prefill) { Purch.openForm(prefill || {}, null); },
    edit(id) {
      const c = purchases.find(x => x.id === id);
      if (!c) return;
      Purch.openForm({
        fornecedorId: c.fornecedorId, fornecedorNome: c.fornecedorNome, data: c.data,
        valor: c.valor, documentoTipo: c.documentoTipo, documentoNumero: c.documentoNumero,
        categoria: c.categoria, formaPagamento: c.formaPagamento, vencimento: c.vencimento,
        parcelas: c.parcelas, tipoPagamento: c.tipoPagamento || 'programado',
        agendamentoDia: c.agendamentoDia, agendamentoData: c.agendamentoData,
        vinculo: c.vinculo || {}, itens: c.itens, observacoes: c.observacoes
      }, id);
    },

    openForm(pf, editId) {
      const vinc = pf.vinculo || {};
      const m = App.form(editId ? 'Editar compra' : 'Nova compra', [
        { name: 'fornecedorId', label: 'Fornecedor', type: 'select', value: pf.fornecedorId || '',
          options: [{ value: '', label: '— avulso / outro —' }].concat(App.ativos(suppliers, pf.fornecedorId).map(s => ({ value: s.id, label: s.nome + (s.ativo === false ? ' (inativo)' : '') }))) },
        { name: 'fornecedorNome', label: 'Fornecedor avulso (se não cadastrado)', value: pf.fornecedorNome || '' },
        { name: 'data', label: 'Data', type: 'date', value: pf.data || App.today(), required: true },
        { name: 'valor', label: 'Valor total (R$)', type: 'number', step: '0.01', value: pf.valor, required: true },
        { name: 'documentoTipo', label: 'Documento', type: 'select', value: pf.documentoTipo || 'nf',
          options: Object.entries(DOCS).map(([v, l]) => ({ value: v, label: l })) },
        { name: 'documentoNumero', label: 'Número do documento', value: pf.documentoNumero || '' },
        { name: 'categoria', label: 'Categoria (para custos e DRE)', type: 'select', value: pf.categoria || 'componentes',
          options: App.CATCOMPRA.map(([v, l]) => ({ value: v, label: l })) },
        { name: 'formaPagamento', label: 'Forma de pagamento', type: 'select', value: pf.formaPagamento || 'boleto',
          options: ['boleto', 'pix', 'cartao', 'dinheiro', 'cheque'].map(v => ({ value: v, label: v })) },
        { name: 'tipoPagamento', label: 'Agendamento do pagamento', type: 'select', value: pf.tipoPagamento || 'programado',
          options: AGEND.map(([v, l]) => ({ value: v, label: l })) },
        { name: 'vencimento', label: 'Vencimento', type: 'date', value: pf.vencimento || '' },
        { name: 'agendamentoDia', label: 'Dia do pagamento no mês seguinte (1 a 28)', type: 'number', value: pf.agendamentoDia || 5 },
        { name: 'agendamentoData', label: 'Data de pagamento combinada', type: 'date', value: pf.agendamentoData || '' },
        { name: 'parcelas', label: 'Parcelas', type: 'number', value: pf.parcelas || 1 },
        { name: 'vinculoTipo', label: 'Vincular a', type: 'select',
          value: vinc.tipo && App.VINCCOMPRA.some(x => x[0] === vinc.tipo) ? vinc.tipo : (vinc.tipo || 'sem_vinculo'),
          options: App.VINCCOMPRA.map(([v, l]) => ({ value: v, label: l }))
            .concat(vinc.tipo && !App.VINCCOMPRA.some(x => x[0] === vinc.tipo)
              ? [{ value: vinc.tipo, label: App.vincCompraNome(vinc.tipo) + ' (antigo)' }] : []) },
        { name: 'vinculoRefSel', label: 'Qual registro?', type: 'select', value: vinc.refId || '',
          options: [{ value: '', label: '— selecione —' }] },
        { name: 'vinculoRef', label: 'Referência do vínculo (texto livre)', value: vinc.refNome || '' },
        { name: 'itensTexto', label: 'Itens (um por linha: descrição ; qtd ; valor)', type: 'textarea',
          value: (pf.itens || []).map(i => `${i.descricao} ; ${i.qtd} ; ${i.valorUnit}`).join('\n'), full: true },
        { name: 'observacoes', label: 'Observações', type: 'textarea', value: pf.observacoes || '', full: true }
      ], async d => {
        const itens = (d.itensTexto || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => {
          const [descricao, qtd, valorUnit] = l.split(';').map(x => x.trim());
          const q = Number(qtd) || 1, v = Number(valorUnit) || 0;
          return { descricao, qtd: q, valorUnit: v, total: q * v };
        });
        // Vínculo: com registro escolhido, guarda o id e o nome do registro.
        const tipoV = d.vinculoTipo;
        const listaV = Purch._listaVinculo(tipoV);
        let refId = null, refNome = d.vinculoRef || null;
        if (listaV && d.vinculoRefSel) {
          const escolhido = listaV.find(x => String(x.value) === String(d.vinculoRefSel));
          if (escolhido) { refId = escolhido.value; refNome = escolhido.label; }
        }
        const corpo = {
          fornecedorId: d.fornecedorId ? Number(d.fornecedorId) : null,
          fornecedorNome: d.fornecedorNome,
          data: d.data, valor: Number(d.valor), itens,
          documentoTipo: d.documentoTipo, documentoNumero: d.documentoNumero,
          categoria: d.categoria, formaPagamento: d.formaPagamento,
          vencimento: d.vencimento, parcelas: Number(d.parcelas) || 1,
          tipoPagamento: d.tipoPagamento,
          agendamentoDia: d.tipoPagamento === 'inicio_mes' ? Number(d.agendamentoDia) || 5 : null,
          agendamentoData: d.tipoPagamento === 'outro' ? d.agendamentoData : '',
          vinculo: { tipo: tipoV, refId, refNome },
          observacoes: d.observacoes
        };
        if (editId) {
          await App.put('/purchases/' + editId, corpo);
          App.closeModal();
          App.toast('Compra atualizada — contas a pagar e projeções acompanharam a mudança', 'ok');
        } else {
          await App.post('/purchases', corpo);
          App.closeModal();
          App.toast('Compra registrada — contas a pagar geradas na agenda', 'ok');
        }
        App.route();
      }, { wide: true });

      /* Explicações discretas embaixo dos seletores + campos condicionais. */
      const campo = nome => { const el = m.querySelector(`[name="${nome}"]`); return el ? el.closest('label') : null; };
      const mostra = (nome, sim) => { const l = campo(nome); if (l) l.style.display = sim ? '' : 'none'; };

      App.explicarSelect(m, 'categoria', App.CATCOMPRA);
      App.explicarSelect(m, 'tipoPagamento', AGEND, tipo => {
        mostra('agendamentoDia', tipo === 'inicio_mes');
        mostra('agendamentoData', tipo === 'outro');
        mostra('vencimento', tipo !== 'imediato');
      });
      App.explicarSelect(m, 'vinculoTipo', App.VINCCOMPRA, tipo => {
        const lista = Purch._listaVinculo(tipo);
        mostra('vinculoRefSel', !!lista);
        mostra('vinculoRef', !lista && tipo !== 'sem_vinculo');
        if (lista) {
          const sel = m.querySelector('[name="vinculoRefSel"]');
          sel.innerHTML = '<option value="">— selecione —</option>' +
            lista.map(o => `<option value="${o.value}" ${String(o.value) === String(vinc.refId || '') ? 'selected' : ''}>${App.esc(o.label)}</option>`).join('');
        }
      });
    },

    /* Listas pesquisáveis do vínculo: cliente, OS ou pedido de venda. */
    _listaVinculo(tipo) {
      if (tipo === 'cliente') return clients.map(c => ({ value: c.id, label: c.nome }));
      if (tipo === 'os') return serviceOrders.map(o => ({
        value: o.id, label: `OS ${o.numero} — ${App.clientName(o.clienteId, clients)}${o.modelo ? ' · ' + o.modelo : ''}` }));
      if (tipo === 'pedido') return sales.map(v => ({
        value: v.id, label: `Pedido ${v.numero} — ${App.clientName(v.clienteId, clients)}` }));
      return null;
    },

    importNfe() {
      const m = App.modal(`
        <h2>Importar NF-e (XML)</h2>
        <p class="small muted">Selecione o arquivo XML da NF-e. O sistema lê fornecedor, número, data, itens,
        valores e parcelas — e você confere tudo antes de confirmar.</p>
        <input type="file" id="nfe-file" accept=".xml,text/xml" style="margin:12px 0">
        <div id="nfe-preview"></div>
        <div class="actions"><button class="btn" onclick="App.closeModal()">Cancelar</button></div>`);
      m.querySelector('#nfe-file').addEventListener('change', async e => {
        const file = e.target.files[0];
        if (!file) return;
        const xml = await file.text();
        try {
          const p = await App.post('/purchases/parse-nfe', { xml });
          m.querySelector('#nfe-preview').innerHTML = `
            <div class="card" style="background:var(--bg-1)">
              <b>${App.esc(p.fornecedorNome)}</b> — CNPJ ${App.esc(p.fornecedorCnpj)}<br>
              <span class="small muted">NF ${App.esc(p.numeroNF)} · ${App.date(p.data)} · Total R$ ${App.money(p.valorTotal)}</span>
              <ul class="small" style="margin:8px 0 0 18px">${p.itens.map(i =>
                `<li>${App.esc(i.descricao)} — ${i.qtd} × R$ ${App.money(i.valorUnit)}</li>`).join('')}</ul>
              ${p.parcelas.length ? `<div class="small muted" style="margin-top:6px">Parcelas: ${p.parcelas.map(x =>
                App.date(x.vencimento) + ' (R$ ' + App.money(x.valor) + ')').join(' · ')}</div>` : ''}
            </div>
            <div class="actions" style="border:none">
              <button class="btn primary" id="nfe-ok">Conferi — preencher compra</button>
            </div>`;
          m.querySelector('#nfe-ok').onclick = () => {
            App.closeModal();
            Purch.create({
              fornecedorId: p.fornecedorId, fornecedorNome: p.fornecedorNome,
              data: p.data, valor: p.valorTotal, documentoTipo: 'nf', documentoNumero: p.numeroNF,
              vencimento: p.parcelas[0] ? p.parcelas[0].vencimento : '',
              parcelas: p.parcelas.length || 1,
              itens: p.itens.map(i => ({ descricao: i.descricao, qtd: i.qtd, valorUnit: i.valorUnit }))
            });
          };
        } catch (err) { App.toast(err.message, 'err'); }
      });
    },
    print() {
      const visiveis = purchases.filter(p => noPeriodo(p.data))
        .sort((a, b) => (ordemData === 'asc' ? 1 : -1) * String(a.data || '').localeCompare(String(b.data || '')));
      App.print('Compras registradas',
        `<table><tr><th>Data</th><th>Fornecedor</th><th class="num">Valor</th><th>Documento</th><th>Pagamento</th></tr>
        ${visiveis.map(p => `<tr><td>${App.date(p.data)}</td><td>${App.esc(p.fornecedorNome || '')}</td>
        <td class="num">R$ ${App.money(p.valor)}</td><td>${p.documentoTipo === 'sem_documento' ? 'SEM DOCUMENTO' : App.esc(p.documentoNumero || p.documentoTipo)}</td>
        <td>${App.esc(p.formaPagamento || '')}</td></tr>`).join('')}</table>`,
        visiveis.length + ' compra(s)');
    }
  };
});

/* ================= FORNECEDORES + FECHAMENTO MENSAL ================= */
App.registerView('suppliers', async (view) => {
  App.setTitle('Fornecedores', 'Cadastro, despesas diárias e fechamento mensal com conferência de divergências');
  const [suppliers, expenses, invoices, clients, abertos] = await Promise.all([
    App.get('/suppliers'), App.get('/supplierExpenses'), App.get('/supplierInvoices'), App.get('/clients'),
    App.get('/suppliers/open-summary')]);

  suppliers.sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
  const openBySupplier = id => expenses.filter(e => e.fornecedorId === id && e.status === 'aberto');
  /* Em aberto = compras não quitadas + gastos do fechamento mensal.
     Vem calculado do servidor; nunca é digitado à mão. */
  const emAberto = id => Number(abertos[id]) || 0;

  const temInativos = suppliers.some(s => s.ativo === false);
  const verInativos = App.verInativosFornecedor === true;
  const visiveis = verInativos ? suppliers : App.ativos(suppliers);

  view.innerHTML = `
    <div class="toolbar">
      <button class="btn primary" onclick="Supp.edit()">+ Novo fornecedor</button>
      <button class="btn" onclick="Supp.addExpense()">+ Registrar gasto do dia</button>
      <div class="spacer"></div>
      <input class="search" id="supp-busca" placeholder="🔎 Buscar por nome, CNPJ, contato ou cidade…" style="max-width:320px">
      ${temInativos ? `<label class="small muted" style="display:flex;gap:6px;align-items:center;cursor:pointer">
        <input type="checkbox" id="supp-inativos" style="width:auto" ${verInativos ? 'checked' : ''}> Mostrar inativos</label>` : ''}
      <span class="muted small" id="supp-contagem"></span>
    </div>
    <div id="supp-tabela"></div>
    <div class="section-title">Faturas mensais</div>
    ${App.table(invoices.slice().reverse(), [
      { h: 'Fornecedor', cell: i => App.esc(i.fornecedorNome) },
      { h: 'Mês', cell: i => i.mes },
      { h: 'Registrado internamente', class: 'num', cell: i => 'R$ ' + App.money(i.valorRegistrado) },
      { h: 'Valor cobrado', class: 'num', cell: i => 'R$ ' + App.money(i.valorCobrado) },
      { h: 'Diferença', class: 'num', cell: i => Math.abs(i.diferenca) < 0.005
          ? '<span class="pos">R$ 0,00</span>'
          : `<b class="neg">R$ ${App.money(i.diferenca)}</b>` },
      { h: 'Status', cell: i => App.badge(i.status) },
      { h: '', class: 'num', cell: i => i.status !== 'confirmada'
          ? `<button class="btn sm primary" onclick="Supp.confirm(${i.id})">Conferir e confirmar</button>` : '' }
    ], { emptyMsg: 'Nenhuma fatura fechada ainda' })}`;

  /* Busca sem acento e por pedaço, igual à de Clientes. */
  const renderSupp = () => {
    const q = document.getElementById('supp-busca').value;
    const list = App.filtraPor(visiveis, q,
      ['nome', 'razaoSocial', 'email', 'cidade', 'estado', 'observacoes',
        x => App.digits(x.cnpj), x => App.digits(x.telefone)]);
    document.getElementById('supp-contagem').textContent = `${list.length} fornecedor(es)`;
    document.getElementById('supp-tabela').innerHTML = App.table(list, [
      { h: 'Fornecedor', cell: s => `<b>${App.esc(s.nome)}</b>${App.seloInativo(s)}${s.fechamentoMensal ? ' <span class="badge info">fechamento mensal</span>' : ''}` },
      { h: 'CNPJ', cell: s => `<span class="mono">${App.esc(s.cnpj ? App.fmtCpfCnpj(s.cnpj) : '—')}</span>` },
      { h: 'Contato', cell: s => App.esc(s.telefone || s.email || '—') },
      { h: 'Em aberto no mês', class: 'num', cell: s => {
        const t = emAberto(s.id);
        return t
          ? `<button class="btn sm ghost" onclick="Supp.conferir(${s.id})" title="Ver o que compõe este valor"><b class="neg">R$ ${App.money(t)}</b></button>`
          : '<span class="muted">R$ 0,00</span>'; } },
      { h: '', class: 'num', cell: s => `
        <button class="btn sm" onclick="Supp.conferir(${s.id})">🔍 Conferir</button>
        <button class="btn sm" onclick="Supp.detail(${s.id})">Despesas</button>
        ${s.fechamentoMensal ? `<button class="btn sm primary" onclick="Supp.close(${s.id})">Fechar fatura</button>` : ''}
        <button class="btn sm ghost" onclick="Supp.edit(${s.id})" title="Editar cadastro">✏️</button>
        ${s.ativo === false
          ? `<button class="btn sm ghost" onclick="Supp.reativar(${s.id})" title="Reativar cadastro">↩️</button>`
          : `<button class="btn sm ghost" onclick="Supp.excluir(${s.id})" title="Excluir cadastro">🗑️</button>`}` }
    ], { emptyMsg: 'Nenhum fornecedor encontrado' });
  };
  renderSupp();
  document.getElementById('supp-busca').addEventListener('input', renderSupp);


  const chkSuppInativos = document.getElementById('supp-inativos');
  if (chkSuppInativos) chkSuppInativos.addEventListener('change', e => {
    App.verInativosFornecedor = e.target.checked;
    App.route();
  });

  window.Supp = {
    excluir(id) {
      const f = suppliers.find(x => x.id === id);
      App.excluirCadastro('suppliers', id, f && f.nome);
    },
    reativar(id) {
      const f = suppliers.find(x => x.id === id);
      App.reativar('suppliers', id, f && f.nome);
    },
    /* Detalhamento do "Em aberto no mês": é com esta lista que se confere,
       linha a linha, a cobrança que o fornecedor manda no fim do mês. */
    async conferir(id) {
      const d = await App.get('/suppliers/' + id + '/open');
      App.modal(`
        <h2>${App.esc(d.fornecedor.nome)} — em aberto</h2>
        <p class="small muted">Compare com a cobrança enviada pelo fornecedor: valores a mais ou a menos,
        compras não lançadas e lançamentos em duplicidade aparecem na comparação.</p>
        ${App.table(d.itens, [
          { h: 'Data', cell: i => App.date(i.data) },
          { h: 'Descrição', cell: i => App.esc(i.descricao || '—') },
          { h: 'Cliente / OS / pedido', cell: i => `<span class="small muted">${App.esc(i.vinculo || '—')}</span>` },
          { h: 'Documento', cell: i => `<span class="small mono">${App.esc(i.documento || '—')}</span>` },
          { h: 'Valor', class: 'num', cell: i => 'R$ ' + App.money(i.valor) },
          { h: 'Status', cell: i => `<span class="badge ${i.status === 'sem conta a pagar' ? 'warn' : ''}">${App.esc(i.status)}</span>` }
        ], { emptyMsg: 'Nada em aberto para este fornecedor' })}
        <p style="text-align:right;margin-top:10px;font-size:15px">Total registrado pela empresa:
          <b style="color:var(--accent-strong)">R$ ${App.money(d.total)}</b></p>
        <div class="actions"><button class="btn" onclick="App.closeModal()">Fechar</button></div>`, { wide: true });
    },
    edit(id) {
      const s = id ? suppliers.find(x => x.id === id) : {};
      App.form(id ? 'Editar fornecedor' : 'Novo fornecedor', [
        { name: 'nome', label: 'Nome', value: s.nome, required: true, full: true },
        { name: 'cnpj', label: 'CNPJ', value: s.cnpj, mask: 'cpfcnpj', placeholder: 'só números' },
        { name: 'telefone', label: 'Telefone', value: s.telefone },
        { name: 'email', label: 'E-mail', value: s.email },
        { name: 'fechamentoMensal', label: 'Fechamento mensal (gastos acumulados pagos por fatura)', type: 'checkbox', value: s.fechamentoMensal, full: true },
        { name: 'observacoes', label: 'Observações', type: 'textarea', value: s.observacoes, full: true }
      ], async d => {
        if (id) await App.put('/suppliers/' + id, d);
        else await App.post('/suppliers', d);
        App.closeModal(); App.toast('Fornecedor salvo', 'ok'); App.route();
      });
    },
    addExpense() {
      App.form('Registrar gasto do dia (fechamento mensal)', [
        { name: 'fornecedorId', label: 'Fornecedor', type: 'select', required: true, full: true,
          options: [{ value: '', label: '— selecione —' }].concat(
            App.ativos(suppliers).filter(s => s.fechamentoMensal).map(s => ({ value: s.id, label: s.nome }))) },
        { name: 'data', label: 'Data', type: 'date', value: App.today(), required: true },
        { name: 'descricao', label: 'Descrição (peça, item…)', required: true },
        { name: 'valor', label: 'Valor (R$)', type: 'number', step: '0.01', required: true },
        { name: 'clienteId', label: 'Vincular a cliente (opcional)', type: 'select', value: '',
          options: [{ value: '', label: '— nenhum —' }].concat(clients.map(c => ({ value: c.id, label: c.nome }))) },
        { name: 'osRef', label: 'OS / pedido (opcional)' }
      ], async d => {
        await App.post('/supplierExpenses', {
          fornecedorId: Number(d.fornecedorId), data: d.data, descricao: d.descricao,
          valor: Number(d.valor), clienteId: d.clienteId ? Number(d.clienteId) : null,
          osRef: d.osRef || '', status: 'aberto'
        });
        App.closeModal(); App.toast('Gasto registrado no acumulado do fornecedor', 'ok'); App.route();
      });
    },
    async detail(id) {
      const s = suppliers.find(x => x.id === id);
      const list = openBySupplier(id);
      const total = list.reduce((sum, e) => sum + e.valor, 0);
      App.modal(`
        <h2>${App.esc(s.nome)} — despesas em aberto</h2>
        ${App.table(list, [
          { h: 'Data', cell: e => App.date(e.data) },
          { h: 'Descrição', cell: e => App.esc(e.descricao) },
          { h: 'Cliente', cell: e => e.clienteId ? App.clientCell(e.clienteId, clients) : '—' },
          { h: 'OS/Pedido', cell: e => App.esc(e.osRef || '—') },
          { h: 'Valor', class: 'num', cell: e => 'R$ ' + App.money(e.valor) }
        ], { emptyMsg: 'Nada em aberto' })}
        <p style="text-align:right;margin-top:10px">Total em aberto: <b>R$ ${App.money(total)}</b></p>
        <div class="actions"><button class="btn" onclick="App.closeModal()">Fechar</button></div>`, { wide: true });
    },
    close(id) {
      const s = suppliers.find(x => x.id === id);
      const total = emAberto(id);
      App.form(`Fechar fatura — ${s.nome}`, [
        { name: 'mes', label: 'Mês de referência', value: App.today().slice(0, 7), required: true },
        { name: 'valorCobrado', label: `Valor cobrado pelo fornecedor (registrado: R$ ${App.money(total)})`, type: 'number', step: '0.01', required: true },
        { name: 'vencimento', label: 'Vencimento da fatura', type: 'date', required: true },
        { name: 'observacoes', label: 'Observações', type: 'textarea', full: true }
      ], async d => {
        const inv = await App.post('/supplierInvoices', {
          fornecedorId: id, mes: d.mes, valorCobrado: Number(d.valorCobrado),
          vencimento: d.vencimento, observacoes: d.observacoes
        });
        App.closeModal();
        if (inv.status === 'divergente') {
          App.modal(`
            <h2>⚠️ Divergência encontrada</h2>
            <div class="divergent">
              Registros internos: <b>R$ ${App.money(inv.valorRegistrado)}</b><br>
              Fatura do fornecedor: <b>R$ ${App.money(inv.valorCobrado)}</b><br>
              Diferença: <b>R$ ${App.money(inv.diferenca)}</b>
            </div>
            <p class="small muted">Confira os lançamentos antes de confirmar o pagamento. A fatura ficou marcada
            como divergente e pode ser confirmada na lista de faturas após a conferência.</p>
            <div class="actions"><button class="btn primary" onclick="App.closeModal();App.route()">Entendi</button></div>`);
        } else {
          App.toast('Fatura conferida — valores batem com os registros internos', 'ok');
          App.route();
        }
      });
    },
    confirm(id) {
      const inv = invoices.find(x => x.id === id);
      App.form(`Confirmar fatura ${inv.fornecedorNome} — ${inv.mes}`, [
        { name: 'valorFinal', label: 'Valor final a pagar (após conferência)', type: 'number', step: '0.01', value: inv.valorCobrado, required: true },
        { name: 'vencimento', label: 'Vencimento', type: 'date', value: inv.vencimento, required: true }
      ], async d => {
        await App.post(`/supplierInvoices/${id}/confirm`, { valorFinal: Number(d.valorFinal), vencimento: d.vencimento });
        App.closeModal();
        App.toast('Fatura confirmada — conta a pagar criada na agenda de sexta-feira', 'ok');
        App.route();
      });
    }
  };
});

/* ================= FRETES PAGOS PELA EMPRESA ================= */
App.registerView('freights', async (view) => {
  App.setTitle('Fretes', 'Envios pagos pela empresa — cada frete vinculado à venda entra no lucro real dela');
  const [freights, sales, clients] = await Promise.all([
    App.get('/freights'), App.get('/sales'), App.get('/clients')]);
  freights.sort((a, b) => b.id - a.id);

  const mes = App.today().slice(0, 7);
  const noMes = freights.filter(f => (f.dataEnvio || '').slice(0, 7) === mes && f.status !== 'cancelado');
  const abertos = freights.filter(f => f.status === 'aberto');

  view.innerHTML = `
    <div class="grid cols-3" style="margin-bottom:14px">
      <div class="card kpi"><div class="label">Fretes no mês</div>
        <div class="value">${noMes.length}</div>
        <div class="hint">enviados em ${mes.split('-').reverse().join('/')}</div></div>
      <div class="card kpi"><div class="label">Custo de frete no mês</div>
        <div class="value money">${App.money(noMes.reduce((s, f) => s + (f.valor || 0), 0))}</div>
        <div class="hint">reduz o lucro das vendas vinculadas</div></div>
      <div class="card kpi ${abertos.length ? 'k-warn' : 'k-ok'}"><div class="label">A pagar</div>
        <div class="value money">${App.money(abertos.reduce((s, f) => s + (f.valor || 0), 0))}</div>
        <div class="hint">${abertos.length ? abertos.length + ' frete(s) aguardando pagamento' : 'nenhum pendente'}</div></div>
    </div>
    <div class="toolbar">
      <button class="btn primary" onclick="Frete.novo()">+ Registrar frete</button>
      <div class="spacer"></div>
    </div>
    ${freights.length ? App.table(freights, [
      { h: 'Envio', cell: f => App.date(f.dataEnvio) },
      { h: 'Cliente', cell: f => `<b>${App.esc(App.clientName(f.clienteId, clients))}</b>` + (App.clientCode(f.clienteId, clients) ? `<div class="small muted mono">${App.esc(App.clientCode(f.clienteId, clients))}</div>` : '') },
      { h: 'Pedido', cell: f => {
        const v = sales.find(x => x.id === f.saleId);
        return v ? `nº ${v.numero}` : '<span class="muted">—</span>'; } },
      { h: 'Transportadora', cell: f => `${App.esc(f.transportadora || '—')}${f.conhecimento ? `<div class="small muted">${App.esc(f.conhecimento)}</div>` : ''}` },
      { h: 'Trajeto', cell: f => `<span class="small">${App.esc(f.origem || '—')} → ${App.esc(f.destino || '—')}</span>` },
      { h: 'Valor', class: 'num', cell: f => App.moneyHtml(f.valor) },
      { h: 'Status', cell: f => App.badge(f.status) },
      { h: '', class: 'num', cell: f => f.status === 'pago'
          ? `<button class="btn sm ghost" onclick="Frete.desfazer(${f.id})" title="Estorna a saída do caixa">↩ Desfazer</button>`
          : `<button class="btn sm primary" onclick="Frete.pagar(${f.id})">✓ Pagar</button>
             <button class="btn sm ghost" onclick="Frete.editar(${f.id})" title="Editar">✎</button>
             <button class="btn sm ghost" onclick="Frete.excluir(${f.id})" title="Excluir">🗑</button>` }
    ]) : App.emptyState('🚚', 'Nenhum frete registrado',
      'Quando a empresa paga o envio de um cabeçote, registre aqui e vincule à venda: o custo entra no lucro real daquela venda e na DRE como Frete de venda / Logística.',
      '<button class="btn primary" onclick="Frete.novo()">+ Registrar o primeiro frete</button>')}`;

  const formFrete = (f, editId) => {
    f = f || {};
    const m = App.form(editId ? 'Editar frete' : 'Registrar frete', [
      { name: 'saleId', label: 'Pedido / venda (recomendado — liga o custo ao lucro da venda)', type: 'select',
        value: f.saleId || '', full: true,
        options: [{ value: '', label: '— sem pedido específico —' }].concat(
          sales.slice().sort((a, b) => b.numero - a.numero)
            .map(v => ({ value: v.id, label: `Pedido nº ${v.numero} — ${App.clientName(v.clienteId, clients)}` }))) },
      { name: 'clienteId', label: 'Cliente', type: 'select', value: f.clienteId || '',
        options: App.clientOptions(clients, f.clienteId) },
      { name: 'produto', label: 'Produto / cabeçote enviado', value: f.produto || '' },
      { name: 'dataEnvio', label: 'Data do envio', type: 'date', value: f.dataEnvio || App.today(), required: true },
      { name: 'transportadora', label: 'Transportadora', value: f.transportadora || '' },
      { name: 'conhecimento', label: 'Conhecimento / etiqueta (nº)', value: f.conhecimento || '' },
      { name: 'origem', label: 'Origem', value: f.origem || ((App.meta.settings.empresa || {}).cidade || '') },
      { name: 'destino', label: 'Destino', value: f.destino || '' },
      { name: 'valor', label: 'Valor do frete (R$)', type: 'number', step: '0.01', value: f.valor, required: true },
      { name: 'formaPagamento', label: 'Forma de pagamento', type: 'select', value: f.formaPagamento || 'pix',
        options: ['pix', 'boleto', 'cartao', 'dinheiro'].map(v => ({ value: v, label: v })) },
      ...(editId ? [] : [{ name: 'pagoAgora', label: 'Já foi pago (lança a saída no caixa agora)', type: 'checkbox', value: false, full: true }]),
      { name: 'observacoes', label: 'Observações / comprovante', type: 'textarea', value: f.observacoes || '', full: true }
    ], async d => {
      const corpo = {
        saleId: d.saleId ? Number(d.saleId) : null,
        clienteId: d.clienteId ? Number(d.clienteId) : null,
        produto: d.produto, dataEnvio: d.dataEnvio, transportadora: d.transportadora,
        conhecimento: d.conhecimento, origem: d.origem, destino: d.destino,
        valor: Number(d.valor), formaPagamento: d.formaPagamento,
        observacoes: d.observacoes, pagoAgora: !!d.pagoAgora
      };
      if (editId) await App.put('/freights/' + editId, corpo);
      else await App.post('/freights', corpo);
      App.closeModal();
      App.toast(editId ? 'Frete atualizado' : 'Frete registrado — o lucro da venda vinculada já considera este custo', 'ok');
      App.route();
    }, { wide: true });

    // Escolheu o pedido? Cliente e destino vêm sozinhos do cadastro.
    const selVenda = m.querySelector('[name=saleId]');
    selVenda.addEventListener('change', () => {
      const v = sales.find(x => x.id === Number(selVenda.value));
      if (!v) return;
      m.querySelector('[name=clienteId]').value = v.clienteId;
      const c = clients.find(x => x.id === v.clienteId);
      if (c && !m.querySelector('[name=destino]').value) {
        m.querySelector('[name=destino]').value = [c.cidade, c.estado].filter(Boolean).join('/');
      }
      if (!m.querySelector('[name=produto]').value) {
        m.querySelector('[name=produto]').value = (v.itens || []).map(i => i.produto).join(', ');
      }
    });
  };

  window.Frete = {
    novo() { formFrete(null, null); },
    editar(id) { formFrete(freights.find(x => x.id === id), id); },
    async pagar(id) {
      const f = freights.find(x => x.id === id);
      if (!await App.confirm(`Pagar o frete de R$ ${App.money(f.valor)} (${f.transportadora || 'envio'})? A saída entra no caixa como Frete de venda / Logística.`)) return;
      await App.post(`/freights/${id}/pay`, {});
      App.toast('Frete pago — saída lançada no caixa', 'ok');
      App.route();
    },
    async desfazer(id) {
      if (!await App.confirm('Desfazer o pagamento deste frete? A saída correspondente sai do caixa e ele volta para "aberto".')) return;
      await App.post(`/freights/${id}/unpay`, {});
      App.toast('Pagamento desfeito — caixa estornado', 'ok');
      App.route();
    },
    async excluir(id) {
      if (!await App.confirm('Excluir este frete? O lucro da venda vinculada volta a subir. Isto não pode ser desfeito.')) return;
      await App.del('/freights/' + id);
      App.toast('Frete excluído', 'ok');
      App.route();
    }
  };
});
