/* Vendas de cabeçotes, produtos/custos e produção sob encomenda */
'use strict';

/* ================= PRODUTOS E CUSTOS ================= */
App.registerView('products', async (view) => {
  App.setTitle('Produtos e custos', 'Seis configurações comerciais — preços e custo-base gerencial editáveis');
  const [products, models] = await Promise.all([App.get('/products'), App.get('/models3d')]);
  const fin = App.can('finance_sensitive');
  const modelOf = pid => models.find(m => m.produtoId === pid);

  const group = tipo => products.filter(p => p.tipo === tipo)
    .sort((a, b) => (a.stage - b.stage) || (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
  const cols = [
    { h: 'Configuração', cell: p => `<b>${App.esc(p.nome)}</b>` },
    { h: 'Stage', cell: p => `<span class="badge accent">Stage ${p.stage}</span>` },
    { h: 'Comandos válidos', cell: p => App.meta.stageComandos[p.stage].join(' · ') },
    { h: 'Tuchos', cell: p => p.stage === 3 ? '37 mm (300x308: 35 ou 37)' : '35 mm' },
    ...(App.can('cashflow') || App.can('receivables') || App.can('payables') || fin
      ? [{ h: 'Preço de venda', class: 'num', cell: p => App.moneyHtml(p.preco) }] : []),
    ...(fin ? [{ h: 'Custo-base', class: 'num', cell: p => App.moneyHtml(p.custoBase || 0) },
    { h: 'Margem téorica', class: 'num', cell: p => {
      if (!p.preco) return '—';
      const m = ((p.preco - (p.custoBase || 0)) / p.preco * 100);
      return `<span class="${m >= 0 ? 'pos' : 'neg'}">${m.toFixed(1)}%</span>`; } }] : []),
    { h: '', class: 'num', cell: p => `
      ${modelOf(p.id) ? `<button class="btn sm ghost" onclick="Prod.view3d(${modelOf(p.id).id})" title="Ver modelo 3D">🧊 3D</button>` : ''}
      ${fin ? `<button class="btn sm" onclick="Prod.edit(${p.id})">✎ Editar</button>` : ''}` }
  ];

  view.innerHTML = `
    <div class="section-title">Unilateral</div>${App.table(group('unilateral'), cols)}
    <div class="section-title">Fluxo cruzado / Crossflow</div>${App.table(group('crossflow'), cols)}

    <div class="card" style="margin-top:16px">
      <h3>🧊 MODELOS 3D DOS CABEÇOTES</h3>
      <p class="small muted" style="margin-bottom:10px">Envie o escaneamento ou o CAD exportado como
      <b>STL</b>, <b>OBJ</b> ou <b>PLY</b> (no SolidWorks: <i>Salvar como → STL</i>, qualidade Fina).
      Depois é só clicar em <b>Ver em 3D</b> — gira com o mouse ou com o dedo no celular, ótimo para
      mostrar ao cliente. Limite: 200 MB por arquivo.</p>
      <div class="toolbar">
        <label class="btn primary" style="cursor:pointer">⬆ Enviar modelo 3D
          <input type="file" id="m3d-file" accept=".stl,.obj,.ply" hidden></label>
        <span id="m3d-progress" class="small muted"></span>
      </div>
      <div id="m3d-list"></div>
    </div>

    <div class="card" style="margin-top:16px">
      <h3>SOBRE O CUSTO-BASE</h3>
      <p class="muted small">O custo-base é uma estimativa gerencial da empresa: peças, componentes, embalagem, brinde,
      horas de usinagem e média de mão de obra. Custos variáveis por venda (frete grátis, brindes adicionais)
      são adicionados na própria venda: <b>custo-base + custos adicionais = custo real estimado</b> e
      <b>valor líquido recebido − custo real = resultado da venda</b>.</p>
    </div>`;

  const renderModels = () => {
    document.getElementById('m3d-list').innerHTML = App.table(models, [
      { h: 'Modelo', cell: m => `<b>${App.esc(m.nome)}</b>` },
      { h: 'Tamanho', class: 'num', cell: m => (m.size / 1048576).toFixed(1) + ' MB' },
      { h: 'Produto vinculado', cell: m => `
        <select onchange="Prod.linkModel(${m.id}, this.value)" style="width:auto;max-width:230px">
          <option value="">— nenhum —</option>
          ${products.map(p => `<option value="${p.id}" ${m.produtoId === p.id ? 'selected' : ''}>${App.esc(p.nome)}</option>`).join('')}
        </select>` },
      { h: '', class: 'num', cell: m => `
        <button class="btn sm primary" onclick="Prod.view3d(${m.id})">🧊 Ver em 3D</button>
        <button class="btn sm ghost" onclick="Prod.delModel(${m.id})" title="Excluir">🗑</button>` }
    ], { emptyMsg: 'Nenhum modelo 3D enviado ainda' });
  };
  renderModels();

  document.getElementById('m3d-file').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const mb = f.size / 1048576;
    if (mb > 200) {
      e.target.value = '';
      App.modal(`
        <h2>Arquivo grande demais (${mb.toFixed(0)} MB)</h2>
        <p>O limite é <b>200 MB</b> — e para visualização nem precisa de tanto.</p>
        <p style="margin-top:8px">Exporte de novo com resolução mais leve:</p>
        <ul style="margin:8px 0 0 20px;line-height:1.7">
          <li><b>Onshape:</b> Export → Resolution = <b>Medium</b></li>
          <li><b>SolidWorks:</b> Salvar como STL → Opções → qualidade <b>Grossa</b> ou personalizada</li>
        </ul>
        <p class="small muted" style="margin-top:10px">A diferença visual é imperceptível — e o modelo ainda abre mais rápido.</p>
        <div class="actions"><button class="btn primary" onclick="App.closeModal()">Entendi</button></div>`);
      return;
    }
    if (mb > 80) App.toast(`Arquivo de ${mb.toFixed(0)} MB — o envio e a abertura do 3D podem demorar um pouco`, 'ok');
    const prog = document.getElementById('m3d-progress');
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/models3d/upload?nome=' + encodeURIComponent(f.name));
    xhr.setRequestHeader('Authorization', 'Bearer ' + App.token());
    xhr.upload.onprogress = ev => {
      if (ev.lengthComputable) prog.textContent = `Enviando… ${Math.round(ev.loaded / ev.total * 100)}%`;
    };
    xhr.onload = () => {
      e.target.value = '';
      prog.textContent = '';
      if (xhr.status === 200) {
        models.push(JSON.parse(xhr.responseText));
        renderModels();
        App.toast('Modelo 3D enviado — clique em “Ver em 3D”', 'ok');
      } else {
        let msg = 'Falha no envio';
        try { msg = JSON.parse(xhr.responseText).error || msg; } catch (err) {}
        App.toast(msg, 'err');
      }
    };
    xhr.onerror = () => {
      prog.textContent = '';
      App.toast('O envio caiu no meio do caminho. Confira se o sistema está aberto (ABRIR O SISTEMA.bat) e tente de novo; se o arquivo for muito grande, exporte com resolução Média.', 'err');
    };
    prog.textContent = `Enviando… 0% (${mb.toFixed(1)} MB)`;
    xhr.send(f);
  });

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
    },
    view3d(modelId) {
      const m = models.find(x => x.id === modelId);
      if (!m) return;
      if (!window.Viewer3D) return App.toast('O visualizador 3D ainda está carregando — tente de novo', 'err');
      Viewer3D.open(m);
    },
    async linkModel(modelId, produtoId) {
      await App.put('/models3d/' + modelId, { produtoId: produtoId || null });
      const m = models.find(x => x.id === modelId);
      m.produtoId = produtoId ? Number(produtoId) : null;
      App.toast('Vínculo atualizado', 'ok');
      App.route();
    },
    async delModel(modelId) {
      const m = models.find(x => x.id === modelId);
      if (!await App.confirm(`Excluir o modelo 3D "${m.nome}"?`)) return;
      await App.del('/models3d/' + modelId);
      models.splice(models.indexOf(m), 1);
      renderModels();
      App.toast('Modelo excluído', 'ok');
    }
  };
});

/* ================= VENDAS ================= */
App.registerView('sales', async (view, args) => {
  if (args[0] === 'nova') return saleEditor(view, args[1] ? Number(args[1]) : null);

  App.setTitle('Vendas / Pedidos', 'Cabeçotes vendidos — pipeline até a entrega');
  const [sales, clients] = await Promise.all([App.get('/sales'), App.get('/clients')]);
  sales.sort((a, b) => b.id - a.id);
  const fin = App.can('finance_sensitive');
  const verValores = App.can('cashflow') || App.can('receivables') || App.can('payables') || fin;
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
      { h: 'Itens', cell: s => s.itens.map(i => i.kind === 'peca'
          ? `${i.qtd}× ${App.esc(i.produto)}<div class="small muted">peça do estoque</div>`
          : `${i.qtd}× ${App.esc(i.produto)}<div class="small muted">comando ${i.comando} · tucho ${i.tucho} mm</div>`).join('') },
      ...(verValores ? [
        { h: 'Total', class: 'num', cell: s => App.moneyHtml(s.valorTotal) },
        { h: 'Pagamento', cell: s => `${App.esc((s.pagamento && s.pagamento.forma) || '—')}${s.pagamento && s.pagamento.parcelas > 1 ? ` ${s.pagamento.parcelas}x` : ''}` }] : []),
      ...(verValores ? [{ h: 'Recebido', class: 'num', cell: s => {
        const rec = (s.recebimentos || []).reduce((a, r) => a + r.valor, 0);
        const saldo = Math.round((s.valorTotal - rec) * 100) / 100;
        if (!rec) return '<span class="muted small">—</span>';
        return `<span class="pos">R$ ${App.money(rec)}</span>` +
          (saldo > 0.005 ? `<div class="small neg">falta R$ ${App.money(saldo)}</div>` : '<div class="small pos">quitado</div>');
      } }] : []),
      { h: 'Previsão', cell: s => App.date(s.previsaoEntrega) },
      { h: 'Status', cell: s => App.badge(s.status) },
      { h: '', class: 'num', cell: s => `
        <button class="btn sm ghost" onclick="Sales.status(${s.id})">Status</button>
        ${verValores ? `<button class="btn sm ghost" onclick="Sales.receber(${s.id})" title="Registrar recebimento (entrada / saldo)">💵</button>` : ''}
        <button class="btn sm ghost wa" onclick="Sales.wa(${s.id})" title="Avisar o cliente no WhatsApp">✆</button>
        <button class="btn sm ghost" onclick="Sales.etiqueta(${s.id})" title="Gerar etiqueta de envio">📦</button>
        ${fin ? `<button class="btn sm ghost" onclick="Sales.result(${s.id})">Resultado</button>` : ''}
        <button class="btn sm ghost" onclick="location.hash='#/sales/nova/${s.id}'" title="Editar venda">✏️</button>
        <button class="btn sm ghost" onclick="Sales.duplicar(${s.id})" title="Duplicar venda">📋</button>
        <button class="btn sm ghost" onclick="Sales.excluir(${s.id})" title="Excluir venda">🗑</button>` }
    ]);
  };
  render();
  document.getElementById('sf').addEventListener('change', render);

  window.Sales = {
    /* Recebimento em etapas: entrada agora, saldo na entrega.
       O que falta continua em Contas a receber e na projeção. */
    receber(id) {
      const s = sales.find(x => x.id === id);
      const lista = s.recebimentos || [];
      const recebido = lista.reduce((a, r) => a + r.valor, 0);
      const saldo = Math.round((s.valorTotal - recebido) * 100) / 100;
      const m = App.modal(`
        <h2>Recebimentos — pedido nº ${s.numero}</h2>
        <table style="font-size:13.5px;margin-bottom:10px">
          <tr><td>Valor total da venda</td><td class="num"><b>R$ ${App.money(s.valorTotal)}</b></td></tr>
          <tr><td>Já recebido</td><td class="num pos">R$ ${App.money(recebido)}</td></tr>
          <tr><td><b>Saldo em aberto</b></td><td class="num"><b class="${saldo > 0.005 ? 'neg' : 'pos'}">R$ ${App.money(saldo)}</b></td></tr>
        </table>
        ${lista.length ? App.table(lista.map((r, i) => Object.assign({ _i: i }, r)), [
          { h: 'Data', cell: r => App.date(r.data) },
          { h: 'Forma', cell: r => App.esc(r.forma) },
          { h: 'Valor', class: 'num', cell: r => 'R$ ' + App.money(r.valor) },
          { h: '', class: 'num', cell: r => `<button class="btn sm ghost" onclick="Sales.desfazerRecebimento(${id}, ${r._i})" title="Estornar">↩</button>` }
        ]) : '<p class="small muted">Nenhum recebimento registrado ainda.</p>'}
        ${saldo > 0.005 ? `
        <hr class="sep">
        <div class="formgrid">
          <label class="field"><span>Valor recebido agora (R$)</span>
            <input type="number" step="0.01" id="rc-valor" value="${saldo.toFixed(2)}"></label>
          <label class="field"><span>Data</span><input type="date" id="rc-data" value="${App.today()}"></label>
          <label class="field"><span>Forma</span>
            <select id="rc-forma">${['pix', 'dinheiro', 'cartao', 'boleto', 'cheque', 'link'].map(f => `<option value="${f}">${f}</option>`).join('')}</select></label>
          <label class="field"><span>Vencimento do saldo restante</span>
            <input type="date" id="rc-venc" value="${s.previsaoEntrega || ''}"></label>
        </div>` : '<p class="small pos" style="margin-top:8px">✓ Venda totalmente recebida.</p>'}
        <div class="actions">
          <button class="btn" onclick="App.closeModal()">Fechar</button>
          ${saldo > 0.005 ? '<button class="btn primary" id="rc-ok">Registrar recebimento</button>' : ''}
        </div>`, { wide: true });
      const btn = m.querySelector('#rc-ok');
      if (btn) btn.onclick = async () => {
        try {
          const r = await App.post(`/sales/${id}/receive`, {
            valor: Number(m.querySelector('#rc-valor').value),
            data: m.querySelector('#rc-data').value,
            forma: m.querySelector('#rc-forma').value,
            vencimentoSaldo: m.querySelector('#rc-venc').value
          });
          App.closeModal();
          App.toast(r.saldo > 0.005
            ? `Recebido — falta R$ ${App.money(r.saldo)}, que segue em Contas a receber`
            : 'Venda quitada', 'ok');
          App.route();
        } catch (e) { App.toast(e.message, 'err'); }
      };
    },
    async desfazerRecebimento(id, index) {
      if (!await App.confirm('Estornar este recebimento? A entrada correspondente sai do caixa e o saldo volta para Contas a receber.')) return;
      try {
        await App.post(`/sales/${id}/unreceive`, { index });
        App.closeModal();
        App.toast('Recebimento estornado', 'ok');
        App.route();
      } catch (e) { App.toast(e.message, 'err'); }
    },
    duplicar(id) {
      const s = sales.find(x => x.id === id);
      App.form(`📋 Duplicar pedido nº ${s.numero}`, [
        { name: 'clienteId', label: 'Cliente do novo pedido', type: 'select', required: true, full: true,
          value: s.clienteId, options: App.clientOptions(clients) },
        { name: 'dataPedido', label: 'Data do novo pedido', type: 'date', value: App.today(), required: true }
      ], async d => {
        const novo = await App.post(`/sales/${id}/duplicate`, { clienteId: Number(d.clienteId), dataPedido: d.dataPedido });
        App.closeModal();
        App.toast(`Pedido nº ${novo.numero} criado a partir do nº ${s.numero} — revise antes de produzir`, 'ok');
        location.hash = '#/sales/nova/' + novo.id;
      }, { submitLabel: 'Duplicar' });
    },
    async excluir(id) {
      const s = sales.find(x => x.id === id);
      if (!await App.confirm(
        `Excluir o pedido nº ${s.numero} (R$ ${App.money(s.valorTotal)})?<br><br>` +
        'As ordens de produção que ainda não consumiram estoque, as parcelas em aberto e os lançamentos ' +
        'de caixa desta venda são desfeitos, e as peças voltam ao estoque. Isto não pode ser desfeito.',
        { html: true })) return;
      try {
        await App.del('/sales/' + id);
        App.toast('Pedido excluído — estoque e financeiro estornados', 'ok');
        App.route();
      } catch (e) { App.toast(e.message, 'err'); }
    },
    etiqueta(id) {
      const s = sales.find(x => x.id === id);
      const c = clients.find(x => x.id === s.clienteId) || {};
      Etiqueta.abrir('sales', s, c);
    },
    wa(id) {
      const s = sales.find(x => x.id === id);
      const c = clients.find(x => x.id === s.clienteId);
      App.waShare(`Pedido nº ${s.numero} — ${(c && c.nome) || 'cliente'}`, App.waPhoneOf(c), App.waMsg.sale(s, c));
    },
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
          ${r.frete ? `<tr><td>Frete pago pela empresa</td><td class="num neg">− R$ ${App.money(r.frete)}</td></tr>` : ''}
          <tr><td><b>Resultado</b></td><td class="num"><b class="${r.resultado >= 0 ? 'pos' : 'neg'}">R$ ${App.money(r.resultado)}</b></td></tr>
          <tr><td>Margem</td><td class="num ${r.margem >= 0 ? 'pos' : 'neg'}"><b>${r.margem.toFixed(1)}%</b></td></tr>
        </table>
        <div class="actions"><button class="btn" onclick="App.closeModal()">Fechar</button></div>`);
    },
    print() {
      const f = document.getElementById('sf').value;
      const list = sales.filter(s => !f || s.status === f);
      App.print('Pedidos' + (f ? ' — ' + (App.STATUS[f] || [f])[0] : ''),
        `<table><tr><th>Nº</th><th>Data</th><th>Cliente</th><th>Itens</th>${verValores ? '<th class="num">Total</th>' : ''}<th>Previsão</th><th>Status</th></tr>
        ${list.map(s => `<tr><td>${s.numero}</td><td>${App.date(s.dataPedido)}</td>
        <td>${App.esc(App.clientName(s.clienteId, clients))}</td>
        <td>${s.itens.map(i => `${i.qtd}× ${App.esc(i.produto)} (${i.comando}, tucho ${i.tucho})`).join('; ')}</td>
        ${verValores ? `<td class="num">R$ ${App.money(s.valorTotal)}</td>` : ''}<td>${App.date(s.previsaoEntrega)}</td>
        <td>${(App.STATUS[s.status] || [s.status])[0]}</td></tr>`).join('')}</table>`,
        list.length + ' pedido(s)');
    }
  };
});

/* ---- Editor de nova venda ---- */
async function saleEditor(view, editId) {
  const [clients, products, estoque] = await Promise.all([
    App.get('/clients'), App.get('/products'), App.get('/stockItems')]);
  estoque.sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
  const venda = editId ? await App.get('/sales/' + editId) : null;
  App.setTitle(venda ? `Editar pedido nº ${venda.numero}` : 'Nova venda',
    venda ? 'Alterar itens ou pagamento refaz produção, estoque e financeiro — sem duplicar'
          : 'O sistema valida comando e tucho conforme o Stage e cria as ordens de produção automaticamente');

  // itens: cabeçote {productId, comando, tucho, qtd, valorUnit}
  //        peça     {kind:'peca', stockItemId, nome, qtd, valorUnit}
  let itens = venda ? venda.itens.map(i => i.kind === 'peca'
    ? { kind: 'peca', stockItemId: i.stockItemId, nome: i.produto, qtd: i.qtd, valorUnit: i.valorUnit }
    : { productId: i.productId, comando: i.comando, tucho: i.tucho, qtd: i.qtd, valorUnit: i.valorUnit }) : [];
  let adicionais = venda ? (venda.custosAdicionais || []).slice() : [];

  const total = () => itens.reduce((s, i) => s + i.qtd * i.valorUnit, 0);

  const renderItems = () => {
    document.getElementById('v-items').innerHTML = App.table(itens.map((i, idx) => {
      if (i.kind === 'peca') return { _idx: idx, nome: i.nome, ...i };
      const p = products.find(x => x.id === i.productId);
      return { _idx: idx, nome: p.nome, stage: p.stage, ...i };
    }), [
      { h: 'Item', cell: i => `${App.esc(i.nome)}${i.kind === 'peca' ? '<div class="small muted">peça do estoque</div>' : ''}` },
      { h: 'Comando', cell: i => i.kind === 'peca' ? '—' : i.comando },
      { h: 'Tucho', cell: i => i.kind === 'peca' ? '—' : i.tucho + ' mm' },
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

        <h3 style="margin-top:16px">ADICIONAR PEÇA DO ESTOQUE</h3>
        <p class="small muted" style="margin-bottom:8px">Peças saem do estoque no momento da venda
        (cabeçotes consomem componentes quando a produção fica pronta).</p>
        <div class="formgrid">
          <label class="field full"><span>Peça</span>
            <select id="v-peca">${estoque.map(it =>
              `<option value="${it.id}" data-qtd="${it.qtd}">${App.esc(it.nome)} — ${it.qtd} em estoque</option>`).join('')}</select></label>
          <label class="field"><span>Quantidade</span><input type="number" id="v-peca-qtd" value="1" min="1"></label>
          <label class="field"><span>Valor unitário (R$)</span><input type="number" step="0.01" id="v-peca-valor"></label>
        </div>
        <div id="v-peca-hint" class="small muted" style="margin-bottom:10px"></div>
        <button class="btn" onclick="VE.addPeca()">+ Adicionar peça</button>
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
          <button class="btn primary" id="v-save" onclick="VE.save()">Registrar venda</button>
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
  const hintPeca = () => {
    const sel = document.getElementById('v-peca');
    const op = sel.selectedOptions[0];
    if (!op) return;
    const disp = Number(op.dataset.qtd) || 0;
    const q = Number(document.getElementById('v-peca-qtd').value) || 0;
    const el = document.getElementById('v-peca-hint');
    el.textContent = q > disp
      ? `Atenção: só há ${disp} em estoque — o saldo vai ficar negativo.`
      : `Disponível: ${disp}.`;
    el.style.color = q > disp ? 'var(--warn,#d29922)' : '';
  };
  document.getElementById('v-produto').addEventListener('change', refreshCombos);
  document.getElementById('v-comando').addEventListener('change', refreshTuchos);
  document.getElementById('v-forma').addEventListener('change', updatePayment);
  document.getElementById('v-taxa').addEventListener('input', updatePayment);
  document.getElementById('v-peca').addEventListener('change', hintPeca);
  document.getElementById('v-peca-qtd').addEventListener('input', hintPeca);
  refreshCombos();
  hintPeca();

  // Edição: traz os dados da venda para os campos.
  if (venda) {
    document.getElementById('v-cliente').value = venda.clienteId;
    document.getElementById('v-data').value = venda.dataPedido || App.today();
    document.getElementById('v-previsao').value = venda.previsaoEntrega || '';
    document.getElementById('v-obs').value = venda.observacoes || '';
    const pg = venda.pagamento || {};
    document.getElementById('v-forma').value = pg.forma || 'pix';
    document.getElementById('v-cond').value = pg.condicao || 'avista';
    document.getElementById('v-parcelas').value = pg.parcelas || 1;
    document.getElementById('v-intervalo').value = pg.intervaloDias || 30;
    document.getElementById('v-taxa').value = pg.taxa || 0;
    document.getElementById('v-recebimento').value = pg.dataPrevRecebimento || '';
    document.getElementById('v-pgobs').value = pg.obs || '';
    document.querySelector('#v-save').textContent = 'Salvar alterações';
  }
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
    addPeca() {
      const sel = document.getElementById('v-peca');
      const op = sel.selectedOptions[0];
      if (!op) return App.toast('Nenhuma peça cadastrada no estoque', 'err');
      itens.push({
        kind: 'peca',
        stockItemId: Number(sel.value),
        nome: op.textContent.split(' — ')[0],
        qtd: Math.max(1, Number(document.getElementById('v-peca-qtd').value) || 1),
        valorUnit: Number(document.getElementById('v-peca-valor').value) || 0
      });
      renderItems();
    },
    rm(i) { itens.splice(i, 1); renderItems(); },
    async save() {
      const clienteId = Number(document.getElementById('v-cliente').value);
      if (!clienteId) return App.toast('Selecione o cliente', 'err');
      if (!itens.length) return App.toast('Adicione ao menos um cabeçote ou peça', 'err');
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
        if (editId) {
          const sale = await App.put('/sales/' + editId, body);
          App.toast(`Pedido nº ${sale.numero} atualizado — produção, estoque e financeiro acompanharam`, 'ok');
          location.hash = '#/sales';
        } else {
          const sale = await App.post('/sales', body);
          App.toast(`Pedido nº ${sale.numero} registrado — ordens de produção e financeiro gerados automaticamente`, 'ok');
          location.hash = itens.some(i => i.kind !== 'peca') ? '#/production' : '#/sales';
        }
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
