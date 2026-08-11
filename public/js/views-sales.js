/* Vendas de cabeçotes, produtos/custos e produção sob encomenda */
'use strict';

/* ================= PRODUTOS E CUSTOS ================= */
App.registerView('products', async (view) => {
  App.setTitle('Produtos e custos', 'Seis configurações comerciais — preços e custo-base gerencial editáveis');
  const products = await App.get('/products');
  const fin = App.can('finance_sensitive');

  const group = tipo => products.filter(p => p.tipo === tipo).sort((a, b) => a.stage - b.stage);
  const cols = [
    { h: 'Configuração', cell: p => `<b>${App.esc(p.nome)}</b>` },
    { h: 'Stage', cell: p => `<span class="badge accent">Stage ${p.stage}</span>` },
    { h: 'Comandos válidos', cell: p => App.meta.stageComandos[p.stage].join(' · ') },
    { h: 'Tuchos', cell: p => p.stage === 3 ? '37 mm (300x308: 35 ou 37)' : '35 mm' },
    { h: 'Preço de venda', class: 'num', cell: p => App.moneyHtml(p.preco) },
    ...(fin ? [{ h: 'Custo-base', class: 'num', cell: p => App.moneyHtml(p.custoBase || 0) },
    { h: 'Margem téorica', class: 'num', cell: p => {
      if (!p.preco) return '—';
      const m = ((p.preco - (p.custoBase || 0)) / p.preco * 100);
      return `<span class="${m >= 0 ? 'pos' : 'neg'}">${m.toFixed(1)}%</span>`; } }] : []),
    { h: '', class: 'num', cell: p => fin ? `<button class="btn sm" onclick="Prod.edit(${p.id})">✎ Editar</button>` : '' }
  ];

  view.innerHTML = `
    <div class="section-title">Unilateral</div>${App.table(group('unilateral'), cols)}
    <div class="section-title">Fluxo cruzado / Crossflow</div>${App.table(group('crossflow'), cols)}
    <div class="card" style="margin-top:16px">
      <h3>SOBRE O CUSTO-BASE</h3>
      <p class="muted small">O custo-base é uma estimativa gerencial da empresa: peças, componentes, embalagem, brinde,
      horas de usinagem e média de mão de obra. Custos variáveis por venda (frete grátis, brindes adicionais)
      são adicionados na própria venda: <b>custo-base + custos adicionais = custo real estimado</b> e
      <b>valor líquido recebido − custo real = resultado da venda</b>.</p>
    </div>`;

  window.Prod = {
    edit(id) {
      const p = products.find(x => x.id === id);
      App.form('Editar ' + p.nome, [
        { name: 'preco', label: 'Preço de venda (R$)', type: 'number', step: '0.01', value: p.preco },
        { name: 'custoBase', label: 'Custo-base gerencial (R$)', type: 'number', step: '0.01', value: p.custoBase },
        { name: 'composicaoObs', label: 'Composição / observações', type: 'textarea', value: p.composicaoObs, full: true }
      ], async d => {
        await App.put('/products/' + id, d);
        App.closeModal(); App.toast('Produto atualizado', 'ok'); App.route();
      });
    }
  };
});

/* ================= VENDAS ================= */
App.registerView('sales', async (view, args) => {
  if (args[0] === 'nova') return saleEditor(view);

  App.setTitle('Vendas / Pedidos', 'Cabeçotes vendidos — pipeline até a entrega');
  const [sales, clients] = await Promise.all([App.get('/sales'), App.get('/clients')]);
  sales.sort((a, b) => b.id - a.id);
  const fin = App.can('finance_sensitive');
  const ST = ['nao_produzido', 'preparacao', 'usinagem', 'montagem', 'pronto', 'enviado', 'entregue', 'cancelado'];

  view.innerHTML = `
    <div class="toolbar">
      <button class="btn primary" onclick="location.hash='#/sales/nova'">+ Nova venda</button>
      <select id="sf" style="max-width:200px"><option value="">Todos os status</option>
        ${ST.map(s => `<option value="${s}">${(App.STATUS[s] || [s])[0]}</option>`).join('')}</select>
      <div class="spacer"></div>
      <button class="btn" onclick="Sales.print()">🖨️ Imprimir</button>
    </div>
    <div id="s-table"></div>`;

  const render = () => {
    const f = document.getElementById('sf').value;
    const list = sales.filter(s => !f || s.status === f);
    document.getElementById('s-table').innerHTML = App.table(list, [
      { h: 'Pedido', cell: s => `<b>nº ${s.numero}</b><div class="small muted">${App.date(s.dataPedido)}</div>` },
      { h: 'Cliente', cell: s => `${App.esc(App.clientName(s.clienteId, clients))}<div class="small muted">${App.esc(s.cidade || '')}/${App.esc(s.estado || '')}</div>` },
      { h: 'Itens', cell: s => s.itens.map(i =>
          `${i.qtd}× ${App.esc(i.produto)}<div class="small muted">comando ${i.comando} · tucho ${i.tucho} mm</div>`).join('') },
      { h: 'Total', class: 'num', cell: s => App.moneyHtml(s.valorTotal) },
      { h: 'Pagamento', cell: s => `${App.esc((s.pagamento && s.pagamento.forma) || '—')}${s.pagamento && s.pagamento.parcelas > 1 ? ` ${s.pagamento.parcelas}x` : ''}` },
      { h: 'Previsão', cell: s => App.date(s.previsaoEntrega) },
      { h: 'Status', cell: s => App.badge(s.status) },
      { h: '', class: 'num', cell: s => `
        <button class="btn sm ghost" onclick="Sales.status(${s.id})">Status</button>
        ${fin ? `<button class="btn sm ghost" onclick="Sales.result(${s.id})">Resultado</button>` : ''}` }
    ]);
  };
  render();
  document.getElementById('sf').addEventListener('change', render);

  window.Sales = {
    status(id) {
      const s = sales.find(x => x.id === id);
      App.form(`Status do pedido nº ${s.numero}`, [
        { name: 'status', label: 'Novo status', type: 'select', value: s.status, full: true,
          options: ST.map(x => ({ value: x, label: (App.STATUS[x] || [x])[0] })) },
        { name: 'data', label: 'Data (para envio)', type: 'date', value: App.today() }
      ], async d => {
        await App.post(`/sales/${id}/status`, d);
        App.closeModal(); App.route();
      });
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
          <tr><td><b>Resultado</b></td><td class="num"><b class="${r.resultado >= 0 ? 'pos' : 'neg'}">R$ ${App.money(r.resultado)}</b></td></tr>
          <tr><td>Margem</td><td class="num ${r.margem >= 0 ? 'pos' : 'neg'}"><b>${r.margem.toFixed(1)}%</b></td></tr>
        </table>
        <div class="actions"><button class="btn" onclick="App.closeModal()">Fechar</button></div>`);
    },
    print() {
      const f = document.getElementById('sf').value;
      const list = sales.filter(s => !f || s.status === f);
      App.print('Pedidos' + (f ? ' — ' + (App.STATUS[f] || [f])[0] : ''),
        `<table><tr><th>Nº</th><th>Data</th><th>Cliente</th><th>Itens</th><th class="num">Total</th><th>Previsão</th><th>Status</th></tr>
        ${list.map(s => `<tr><td>${s.numero}</td><td>${App.date(s.dataPedido)}</td>
        <td>${App.esc(App.clientName(s.clienteId, clients))}</td>
        <td>${s.itens.map(i => `${i.qtd}× ${App.esc(i.produto)} (${i.comando}, tucho ${i.tucho})`).join('; ')}</td>
        <td class="num">R$ ${App.money(s.valorTotal)}</td><td>${App.date(s.previsaoEntrega)}</td>
        <td>${(App.STATUS[s.status] || [s.status])[0]}</td></tr>`).join('')}</table>`,
        list.length + ' pedido(s)');
    }
  };
});

/* ---- Editor de nova venda ---- */
async function saleEditor(view) {
  const [clients, products] = await Promise.all([App.get('/clients'), App.get('/products')]);
  App.setTitle('Nova venda', 'O sistema valida comando e tucho conforme o Stage e cria as ordens de produção automaticamente');

  let itens = []; // {productId, qtd, comando, tucho, valorUnit}
  let adicionais = []; // {desc, valor}

  const total = () => itens.reduce((s, i) => s + i.qtd * i.valorUnit, 0);

  const renderItems = () => {
    document.getElementById('v-items').innerHTML = App.table(itens.map((i, idx) => {
      const p = products.find(x => x.id === i.productId);
      return { _idx: idx, nome: p.nome, stage: p.stage, ...i };
    }), [
      { h: 'Produto', cell: i => `${App.esc(i.nome)}` },
      { h: 'Comando', cell: i => i.comando },
      { h: 'Tucho', cell: i => i.tucho + ' mm' },
      { h: 'Qtd', class: 'num', cell: i => i.qtd },
      { h: 'Valor unit.', class: 'num', cell: i => 'R$ ' + App.money(i.valorUnit) },
      { h: 'Total', class: 'num', cell: i => '<b>R$ ' + App.money(i.qtd * i.valorUnit) + '</b>' },
      { h: '', class: 'num', cell: i => `<button class="btn sm ghost" onclick="VE.rm(${i._idx})">✕</button>` }
    ], { emptyMsg: 'Adicione os cabeçotes do pedido' }) +
    (adicionais.length ? `<div class="small muted" style="margin-top:8px">Custos adicionais: ${adicionais.map(a =>
      `${App.esc(a.desc)} (R$ ${App.money(a.valor)})`).join(' · ')}</div>` : '') +
    `<div style="text-align:right;padding:10px 4px;font-size:15px">TOTAL: <b style="color:var(--accent-strong)">R$ ${App.money(total())}</b></div>`;
    updatePayment();
  };

  const updatePayment = () => {
    const forma = document.getElementById('v-forma').value;
    const isCard = forma === 'cartao' || forma === 'link';
    document.getElementById('v-card-fields').style.display = isCard ? '' : 'none';
    const taxa = isCard ? Number(document.getElementById('v-taxa').value) || 0 : 0;
    document.getElementById('v-liquido').textContent = 'R$ ' + App.money(total() - taxa);
  };

  view.innerHTML = `
    <div class="toolbar"><a class="btn sm ghost" href="#/sales">← Voltar</a></div>
    <div class="grid cols-2">
      <div class="card">
        <h3>PEDIDO</h3>
        <div class="formgrid">
          <label class="field full"><span>Cliente *</span>
            <select id="v-cliente">${App.clientOptions(clients).map(o =>
              `<option value="${o.value}">${App.esc(o.label)}</option>`).join('')}</select></label>
          <label class="field"><span>Data do pedido</span><input type="date" id="v-data" value="${App.today()}"></label>
          <label class="field"><span>Previsão de entrega</span><input type="date" id="v-previsao"></label>
          <label class="field full"><span>Observações</span><textarea id="v-obs"></textarea></label>
        </div>
        <h3 style="margin-top:6px">ADICIONAR CABEÇOTE</h3>
        <div class="formgrid">
          <label class="field full"><span>Produto</span>
            <select id="v-produto">${products.map(p => `<option value="${p.id}">${App.esc(p.nome)}</option>`).join('')}</select></label>
          <label class="field"><span>Comando</span><select id="v-comando"></select></label>
          <label class="field"><span>Tucho</span><select id="v-tucho"></select></label>
          <label class="field"><span>Quantidade</span><input type="number" id="v-qtd" value="1" min="1"></label>
          <label class="field"><span>Valor unitário (R$)</span><input type="number" step="0.01" id="v-valor"></label>
        </div>
        <div id="v-hint" class="small muted" style="margin-bottom:10px"></div>
        <button class="btn primary" onclick="VE.add()">+ Adicionar ao pedido</button>
        <button class="btn ghost" onclick="VE.addExtra()">+ Custo adicional (frete grátis, brinde…)</button>
      </div>
      <div class="card">
        <h3>ITENS E PAGAMENTO</h3>
        <div id="v-items"></div>
        <hr class="sep">
        <div class="formgrid">
          <label class="field"><span>Forma de pagamento</span>
            <select id="v-forma">
              ${['pix', 'dinheiro', 'cartao', 'link', 'boleto', 'cheque'].map(f => `<option value="${f}">${f}</option>`).join('')}
            </select></label>
          <label class="field"><span>Condição</span>
            <select id="v-cond"><option value="avista">À vista</option><option value="parcelado">Parcelado</option></select></label>
          <label class="field"><span>Nº de parcelas</span><input type="number" id="v-parcelas" value="1" min="1"></label>
          <label class="field"><span>Intervalo entre parcelas (dias)</span><input type="number" id="v-intervalo" value="30"></label>
        </div>
        <div id="v-card-fields" style="display:none">
          <div class="formgrid">
            <label class="field"><span>Taxa da operadora (R$)</span><input type="number" step="0.01" id="v-taxa" value="0"></label>
            <label class="field"><span>Data prevista de recebimento</span><input type="date" id="v-recebimento"></label>
          </div>
        </div>
        <p style="margin:8px 0">Valor líquido estimado: <b id="v-liquido">R$ 0,00</b></p>
        <label class="field"><span>Observações de pagamento</span><input id="v-pgobs"></label>
        <div class="actions" style="border:none">
          <button class="btn primary" onclick="VE.save()">Registrar venda</button>
        </div>
      </div>
    </div>`;

  const refreshCombos = () => {
    const p = products.find(x => x.id === Number(document.getElementById('v-produto').value));
    const comandos = App.meta.stageComandos[p.stage] || [];
    const selC = document.getElementById('v-comando');
    selC.innerHTML = comandos.map(c => `<option value="${c}">${c}</option>`).join('');
    refreshTuchos();
    document.getElementById('v-valor').value = p.preco || '';
  };
  const refreshTuchos = () => {
    const p = products.find(x => x.id === Number(document.getElementById('v-produto').value));
    const comando = document.getElementById('v-comando').value;
    const opts = p.stage === 3 ? (comando === '300x308' ? ['35', '37'] : ['37']) : ['35'];
    document.getElementById('v-tucho').innerHTML = opts.map(t => `<option value="${t}">${t} mm</option>`).join('');
    const hints = [];
    if (p.stage === 3) hints.push('Stage 3: retrabalho manual dos dutos de escape entra automaticamente na ordem de produção.');
    if (opts.includes('37')) hints.push('Tucho 37 mm inclui a abertura do alojamento dos tuchos para 37 mm.');
    if (comando === '300x308') hints.push('Exceção permitida: comando 300x308 aceita tucho 35 ou 37 mm.');
    document.getElementById('v-hint').textContent = hints.join(' ');
  };
  document.getElementById('v-produto').addEventListener('change', refreshCombos);
  document.getElementById('v-comando').addEventListener('change', refreshTuchos);
  document.getElementById('v-forma').addEventListener('change', updatePayment);
  document.getElementById('v-taxa').addEventListener('input', updatePayment);
  refreshCombos();
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
    rm(i) { itens.splice(i, 1); renderItems(); },
    async save() {
      const clienteId = Number(document.getElementById('v-cliente').value);
      if (!clienteId) return App.toast('Selecione o cliente', 'err');
      if (!itens.length) return App.toast('Adicione ao menos um cabeçote', 'err');
      const forma = document.getElementById('v-forma').value;
      const body = {
        clienteId,
        dataPedido: document.getElementById('v-data').value,
        previsaoEntrega: document.getElementById('v-previsao').value,
        observacoes: document.getElementById('v-obs').value,
        itens,
        custosAdicionais: adicionais,
        pagamento: {
          forma,
          condicao: document.getElementById('v-cond').value,
          parcelas: Number(document.getElementById('v-parcelas').value) || 1,
          intervaloDias: Number(document.getElementById('v-intervalo').value) || 30,
          taxa: Number(document.getElementById('v-taxa').value) || 0,
          dataPrevRecebimento: document.getElementById('v-recebimento').value,
          obs: document.getElementById('v-pgobs').value
        }
      };
      try {
        const sale = await App.post('/sales', body);
        App.toast(`Pedido nº ${sale.numero} registrado — ordens de produção e financeiro gerados automaticamente`, 'ok');
        location.hash = '#/production';
      } catch (e) { App.toast(e.message, 'err'); }
    }
  };
}

/* ================= PRODUÇÃO ================= */
App.registerView('production', async (view) => {
  App.setTitle('Produção sob encomenda', 'Ordens de produção com checklist de separação, operações e montagem');
  const pos = await App.get('/productionOrders');
  pos.sort((a, b) => b.id - a.id);
  const ST = ['nao_produzido', 'preparacao', 'usinagem', 'montagem', 'pronto'];
  const users = App.meta.users.filter(u => u.active);

  view.innerHTML = `
    <div class="toolbar">
      <select id="pf" style="max-width:210px"><option value="">Todas</option>
        ${ST.map(s => `<option value="${s}">${(App.STATUS[s] || [s])[0]}</option>`).join('')}</select>
      <div class="spacer"></div>
      <button class="btn" onclick="PO.print()">🖨️ Imprimir ordens</button>
    </div>
    <div id="po-list"></div>`;

  const render = () => {
    const f = document.getElementById('pf').value;
    const list = pos.filter(p => (!f || p.status === f) && p.status !== 'cancelado');
    document.getElementById('po-list').innerHTML = list.length ? list.map(p => {
      const done = p.checklist.filter(c => c.done).length;
      return `<div class="card" style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;align-items:center">
          <div>
            <b>OP #${p.id}</b> — ${App.esc(p.produto)} · comando <b>${p.comando}</b> · tucho <b>${p.tucho} mm</b>
            <div class="small muted">Pedido nº ${p.pedidoNumero} · ${App.esc(p.clienteNome)} · previsão ${App.date(p.previsaoEntrega)}
             · resp.: ${App.esc(App.userName(p.responsavelId))}</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <span class="small muted">${done}/${p.checklist.length}</span>
            ${App.badge(p.status)}
            <select onchange="PO.setStatus(${p.id}, this.value)" style="width:auto">
              ${ST.map(s => `<option value="${s}" ${p.status === s ? 'selected' : ''}>${(App.STATUS[s] || [s])[0]}</option>`).join('')}
            </select>
            <select onchange="PO.setResp(${p.id}, this.value)" style="width:auto">
              <option value="">— responsável —</option>
              ${users.map(u => `<option value="${u.id}" ${p.responsavelId === u.id ? 'selected' : ''}>${App.esc(u.name)}</option>`).join('')}
            </select>
            <button class="btn sm" onclick="PO.printOne(${p.id})">🖨️</button>
          </div>
        </div>
        <ul class="checklist" style="margin-top:10px;columns:2;column-gap:24px">
          ${p.checklist.map((c, i) => `<li class="${c.done ? 'done' : ''}" style="break-inside:avoid">
            <input type="checkbox" ${c.done ? 'checked' : ''} onchange="PO.check(${p.id}, ${i}, this.checked)">
            <span>${App.esc(c.item)}</span>
            ${c.done && c.por ? `<span class="small muted">(${App.esc(c.por)})</span>` : ''}
          </li>`).join('')}
        </ul>
      </div>`;
    }).join('') : '<div class="card"><div class="empty">Nenhuma ordem de produção nesta situação</div></div>';
  };
  render();
  document.getElementById('pf').addEventListener('change', render);

  window.PO = {
    async check(id, i, done) {
      await App.post(`/productionOrders/${id}/check`, { index: i, done });
      const p = pos.find(x => x.id === id);
      p.checklist[i].done = done; p.checklist[i].por = App.user.name;
      render();
    },
    async setStatus(id, status) {
      await App.post(`/productionOrders/${id}/status`, { status });
      const p = pos.find(x => x.id === id); p.status = status;
      if (status === 'pronto') App.toast('Produção concluída — componentes baixados do estoque próprio', 'ok');
      render();
    },
    async setResp(id, v) {
      await App.post(`/productionOrders/${id}/status`, { status: pos.find(x => x.id === id).status, responsavelId: v ? Number(v) : null });
      pos.find(x => x.id === id).responsavelId = v ? Number(v) : null;
      render();
    },
    printOne(id) {
      const p = pos.find(x => x.id === id);
      App.print(`Ordem de Produção #${p.id}`, `
        <table><tr><th>Produto</th><th>Comando</th><th>Tucho</th><th>Pedido</th><th>Cliente</th><th>Previsão</th></tr>
        <tr><td>${App.esc(p.produto)}</td><td>${p.comando}</td><td>${p.tucho} mm</td>
        <td>nº ${p.pedidoNumero}</td><td>${App.esc(p.clienteNome)}</td><td>${App.date(p.previsaoEntrega)}</td></tr></table>
        <h3>Checklist de produção</h3>
        <ul class="check">${p.checklist.map(c => `<li>${App.esc(c.item)}</li>`).join('')}</ul>
        <div class="sig"><div>Produzido por</div><div>Controle de qualidade</div></div>`,
        `Responsável: ${App.userName(p.responsavelId)}`);
    },
    print() {
      const f = document.getElementById('pf').value;
      const list = pos.filter(p => (!f || p.status === f) && p.status !== 'cancelado');
      App.print('Ordens de produção' + (f ? ' — ' + (App.STATUS[f] || [f])[0] : ''),
        list.map(p => `<h3>OP #${p.id} — ${App.esc(p.produto)} · comando ${p.comando} · tucho ${p.tucho} mm
          <span class="badge">${(App.STATUS[p.status] || [p.status])[0]}</span></h3>
          <p style="font-size:11px;color:#555">Pedido nº ${p.pedidoNumero} — ${App.esc(p.clienteNome)} — previsão ${App.date(p.previsaoEntrega)}</p>
          <ul class="check">${p.checklist.filter(c => !c.done).map(c => `<li>${App.esc(c.item)}</li>`).join('') || '<li style="list-style:none">— tudo concluído —</li>'}</ul>`).join(''),
        list.length + ' ordem(ns) — somente itens pendentes listados');
    }
  };
});
