/* Compras (com leitura de NF-e), fornecedores e fechamento mensal com divergência */
'use strict';

/* ================= COMPRAS ================= */
App.registerView('purchases', async (view) => {
  App.setTitle('Compras', 'Com ou sem nota fiscal — sempre no controle gerencial');
  const [purchases, suppliers, clients] = await Promise.all([
    App.get('/purchases'), App.get('/suppliers'), App.get('/clients')]);
  purchases.sort((a, b) => b.id - a.id);

  const DOCS = { nf: 'NF', recibo: 'Recibo', comprovante: 'Comprovante', sem_documento: 'Sem documento', outro: 'Outro' };
  const VINC = { cliente: 'Cliente', orcamento: 'Orçamento', os: 'OS', pedido: 'Pedido', producao: 'Produção', uso_interno: 'Uso interno' };

  view.innerHTML = `
    <div class="toolbar">
      <button class="btn primary" onclick="Purch.create()">+ Nova compra</button>
      <button class="btn" onclick="Purch.importNfe()">📎 Importar NF-e (XML)</button>
      <div class="spacer"></div>
      <button class="btn" onclick="Purch.print()">🖨️ Imprimir</button>
    </div>
    ${App.table(purchases, [
      { h: 'Data', cell: p => App.date(p.data) },
      { h: 'Fornecedor', cell: p => `<b>${App.esc(p.fornecedorNome || '—')}</b>` },
      { h: 'Itens', cell: p => `<span class="small">${(p.itens || []).slice(0, 3).map(i => App.esc(i.descricao)).join(', ') || '—'}</span>` },
      { h: 'Valor', class: 'num', cell: p => App.moneyHtml(p.valor) },
      { h: 'Documento', cell: p => p.documentoTipo === 'sem_documento'
          ? '<span class="badge warn">sem documento</span>'
          : `${DOCS[p.documentoTipo] || p.documentoTipo} ${App.esc(p.documentoNumero || '')}` },
      { h: 'Vínculo', cell: p => `<span class="small muted">${VINC[(p.vinculo || {}).tipo] || 'Uso interno'}${p.vinculo && p.vinculo.refNome ? ': ' + App.esc(p.vinculo.refNome) : ''}</span>` },
      { h: 'Pagamento', cell: p => `${App.esc(p.formaPagamento || '—')}${p.parcelas > 1 ? ` ${p.parcelas}x` : ''}` },
      { h: 'Status', cell: p => App.badge(p.status) }
    ], { emptyMsg: 'Nenhuma compra registrada' })}`;

  window.Purch = {
    create(prefill) {
      const pf = prefill || {};
      App.form('Nova compra', [
        { name: 'fornecedorId', label: 'Fornecedor', type: 'select', value: pf.fornecedorId || '',
          options: [{ value: '', label: '— avulso / outro —' }].concat(suppliers.map(s => ({ value: s.id, label: s.nome }))) },
        { name: 'fornecedorNome', label: 'Fornecedor avulso (se não cadastrado)', value: pf.fornecedorNome || '' },
        { name: 'data', label: 'Data', type: 'date', value: pf.data || App.today(), required: true },
        { name: 'valor', label: 'Valor total (R$)', type: 'number', step: '0.01', value: pf.valor, required: true },
        { name: 'documentoTipo', label: 'Documento', type: 'select', value: pf.documentoTipo || 'nf',
          options: Object.entries(DOCS).map(([v, l]) => ({ value: v, label: l })) },
        { name: 'documentoNumero', label: 'Número do documento', value: pf.documentoNumero || '' },
        { name: 'categoria', label: 'Categoria (para DRE)', type: 'select', value: pf.categoria || 'componentes', options: [
          { value: 'componentes', label: 'Componentes' }, { value: 'materiais', label: 'Materiais' },
          { value: 'custo_direto', label: 'Custo direto' }, { value: 'terceirizacao', label: 'Terceirização' },
          { value: 'custo_producao', label: 'Custo de produção' }, { value: 'despesa_operacional', label: 'Despesa operacional' },
          { value: 'manutencao', label: 'Manutenção' }] },
        { name: 'formaPagamento', label: 'Forma de pagamento', type: 'select', value: 'boleto',
          options: ['boleto', 'pix', 'cartao', 'dinheiro', 'cheque'].map(v => ({ value: v, label: v })) },
        { name: 'vencimento', label: 'Vencimento', type: 'date', value: pf.vencimento || '' },
        { name: 'parcelas', label: 'Parcelas', type: 'number', value: pf.parcelas || 1 },
        { name: 'tipoPagamento', label: 'Agendamento', type: 'select', value: 'programado', options: [
          { value: 'programado', label: 'Programado (sexta-feira anterior ao vencimento)' },
          { value: 'imediato', label: 'Imediato (pago na data da compra)' }] },
        { name: 'vinculoTipo', label: 'Vincular a', type: 'select', value: 'uso_interno',
          options: Object.entries(VINC).map(([v, l]) => ({ value: v, label: l })) },
        { name: 'vinculoRef', label: 'Referência do vínculo (nº OS / pedido / cliente)' },
        { name: 'itensTexto', label: 'Itens (um por linha: descrição ; qtd ; valor)', type: 'textarea',
          value: (pf.itens || []).map(i => `${i.descricao} ; ${i.qtd} ; ${i.valorUnit}`).join('\n'), full: true },
        { name: 'observacoes', label: 'Observações', type: 'textarea', full: true }
      ], async d => {
        const itens = (d.itensTexto || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => {
          const [descricao, qtd, valorUnit] = l.split(';').map(x => x.trim());
          const q = Number(qtd) || 1, v = Number(valorUnit) || 0;
          return { descricao, qtd: q, valorUnit: v, total: q * v };
        });
        await App.post('/purchases', {
          fornecedorId: d.fornecedorId ? Number(d.fornecedorId) : null,
          fornecedorNome: d.fornecedorNome,
          data: d.data, valor: Number(d.valor), itens,
          documentoTipo: d.documentoTipo, documentoNumero: d.documentoNumero,
          categoria: d.categoria, formaPagamento: d.formaPagamento,
          vencimento: d.vencimento, parcelas: Number(d.parcelas) || 1,
          tipoPagamento: d.tipoPagamento,
          vinculo: { tipo: d.vinculoTipo, refNome: d.vinculoRef || null },
          observacoes: d.observacoes
        });
        App.closeModal();
        App.toast('Compra registrada — contas a pagar geradas na agenda', 'ok');
        App.route();
      }, { wide: true });
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
      App.print('Compras registradas',
        `<table><tr><th>Data</th><th>Fornecedor</th><th class="num">Valor</th><th>Documento</th><th>Pagamento</th></tr>
        ${purchases.map(p => `<tr><td>${App.date(p.data)}</td><td>${App.esc(p.fornecedorNome || '')}</td>
        <td class="num">R$ ${App.money(p.valor)}</td><td>${p.documentoTipo === 'sem_documento' ? 'SEM DOCUMENTO' : App.esc(p.documentoNumero || p.documentoTipo)}</td>
        <td>${App.esc(p.formaPagamento || '')}</td></tr>`).join('')}</table>`,
        purchases.length + ' compra(s)');
    }
  };
});

/* ================= FORNECEDORES + FECHAMENTO MENSAL ================= */
App.registerView('suppliers', async (view) => {
  App.setTitle('Fornecedores', 'Cadastro, despesas diárias e fechamento mensal com conferência de divergências');
  const [suppliers, expenses, invoices, clients] = await Promise.all([
    App.get('/suppliers'), App.get('/supplierExpenses'), App.get('/supplierInvoices'), App.get('/clients')]);

  const openBySupplier = id => expenses.filter(e => e.fornecedorId === id && e.status === 'aberto');

  view.innerHTML = `
    <div class="toolbar">
      <button class="btn primary" onclick="Supp.edit()">+ Novo fornecedor</button>
      <button class="btn" onclick="Supp.addExpense()">+ Registrar gasto do dia</button>
    </div>
    ${App.table(suppliers, [
      { h: 'Fornecedor', cell: s => `<b>${App.esc(s.nome)}</b>${s.fechamentoMensal ? ' <span class="badge info">fechamento mensal</span>' : ''}` },
      { h: 'CNPJ', cell: s => `<span class="mono">${App.esc(s.cnpj ? App.fmtCpfCnpj(s.cnpj) : '—')}</span>` },
      { h: 'Contato', cell: s => App.esc(s.telefone || s.email || '—') },
      { h: 'Em aberto no mês', class: 'num', cell: s => {
        const t = openBySupplier(s.id).reduce((sum, e) => sum + e.valor, 0);
        return t ? `<b class="neg">R$ ${App.money(t)}</b>` : '<span class="muted">R$ 0,00</span>'; } },
      { h: '', class: 'num', cell: s => `
        <button class="btn sm" onclick="Supp.detail(${s.id})">Despesas</button>
        ${s.fechamentoMensal ? `<button class="btn sm primary" onclick="Supp.close(${s.id})">Fechar fatura</button>` : ''}
        <button class="btn sm ghost" onclick="Supp.edit(${s.id})">✎</button>` }
    ])}
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

  window.Supp = {
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
            suppliers.filter(s => s.fechamentoMensal).map(s => ({ value: s.id, label: s.nome }))) },
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
          { h: 'Cliente', cell: e => e.clienteId ? App.esc(App.clientName(e.clienteId, clients)) : '—' },
          { h: 'OS/Pedido', cell: e => App.esc(e.osRef || '—') },
          { h: 'Valor', class: 'num', cell: e => 'R$ ' + App.money(e.valor) }
        ], { emptyMsg: 'Nada em aberto' })}
        <p style="text-align:right;margin-top:10px">Total em aberto: <b>R$ ${App.money(total)}</b></p>
        <div class="actions"><button class="btn" onclick="App.closeModal()">Fechar</button></div>`, { wide: true });
    },
    close(id) {
      const s = suppliers.find(x => x.id === id);
      const total = openBySupplier(id).reduce((sum, e) => sum + e.valor, 0);
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
