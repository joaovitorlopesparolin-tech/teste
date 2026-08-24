/* Vendas de cabeçotes, produtos/custos e produção sob encomenda */
'use strict';

/* ================= PRODUTOS E CUSTOS ================= */
App.registerView('products', async (view) => {
  App.setTitle('Produtos e custos', 'Seis configurações comerciais — preços e custo-base gerencial editáveis');
  const [products, models] = await Promise.all([App.get('/products'), App.get('/models3d')]);
  const fin = App.can('finance_sensitive');
  const modelOf = pid => models.find(m => m.produtoId === pid);

  const group = tipo => products.filter(p => p.tipo === tipo && p.ativo !== false)
    .sort((a, b) => (a.stage - b.stage) || (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
  const inativos = products.filter(p => p.ativo === false)
    .sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
  const cols = [
    { h: 'Configuração', cell: p => `<b>${App.esc(p.nome)}</b>${App.seloInativo(p)}` },
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
      ${fin ? `<button class="btn sm" onclick="Prod.edit(${p.id})">✏️ Editar</button>` : ''}
      ${fin ? (p.ativo === false
        ? `<button class="btn sm ghost" onclick="Prod.reativar(${p.id})" title="Reativar cadastro">↩️</button>`
        : `<button class="btn sm ghost" onclick="Prod.excluir(${p.id})" title="Excluir cadastro">🗑️</button>`) : ''}` }
  ];

  view.innerHTML = `
    <div class="section-title">Unilateral</div>${App.table(group('unilateral'), cols)}
    <div class="section-title">Fluxo cruzado / Crossflow</div>${App.table(group('crossflow'), cols)}
    ${inativos.length ? `<div class="section-title">Inativos <span class="small muted">— não aparecem em novas vendas; o histórico continua intacto</span></div>${App.table(inativos, cols)}` : ''}

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
          ${App.ativos(products, m.produtoId).map(p => `<option value="${p.id}" ${m.produtoId === p.id ? 'selected' : ''}>${App.esc(p.nome)}${p.ativo === false ? ' (inativo)' : ''}</option>`).join('')}
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
    excluir(id) {
      const p = products.find(x => x.id === id);
      App.excluirCadastro('products', id, p && p.nome);
    },
    reativar(id) {
      const p = products.find(x => x.id === id);
      App.reativar('products', id, p && p.nome);
    },
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

  /* Nome curto da configuração, do jeito que a equipe fala: "Unilateral
     Stage 1", "Fluxo cruzado Stage 2". Comando e tucho não entram aqui —
     são detalhe do pedido, não identificação do produto. */
  const configLabel = (i) => `${i.tipo === 'crossflow' ? 'Fluxo cruzado' : 'Unilateral'} Stage ${i.stage}`;

  const cabecotes = (s) => (s.itens || []).filter(i => i.kind !== 'peca');
  const pecas = (s) => (s.itens || []).filter(i => i.kind === 'peca');
  const qtdCabecotes = (s) => cabecotes(s).reduce((a, i) => a + (Number(i.qtd) || 1), 0);

  /* Resumo do pedido em poucas linhas — "2× Unilateral Stage 1" — somando as
     configurações iguais. É o que permite enxergar vários pedidos de uma vez;
     o detalhe completo abre no botão Detalhes. */
  const resumoConfigs = (s) => {
    const grupos = [];
    const idx = new Map();
    for (const i of cabecotes(s)) {
      const nome = configLabel(i);
      if (idx.has(nome)) grupos[idx.get(nome)].qtd += (Number(i.qtd) || 1);
      else { idx.set(nome, grupos.length); grupos.push({ nome, qtd: Number(i.qtd) || 1 }); }
    }
    /* Uma configuração por linha, sem quebrar no meio do nome — é o que
       mantém a altura da linha proporcional ao que o pedido realmente tem. */
    const linhas = grupos.map(g => `${g.qtd}× ${App.esc(g.nome)}`);
    const np = pecas(s).reduce((a, i) => a + (Number(i.qtd) || 1), 0);
    if (np) linhas.push(`<span class="muted">${np}× peça(s) do estoque</span>`);
    return linhas.length
      ? linhas.map(l => `<div style="white-space:nowrap">${l}</div>`).join('')
      : '<span class="muted">—</span>';
  };

  const render = () => {
    const f = document.getElementById('sf').value;
    const list = sales.filter(s => !f || s.status === f);
    document.getElementById('s-table').innerHTML = App.table(list, [
      { h: 'Pedido', cell: s => `<b>nº ${s.numero}</b><div class="small muted">${App.date(s.dataPedido)}</div>` },
      { h: 'Cliente', cell: s => App.clientCell(s.clienteId, clients) },
      { h: 'Qtd', class: 'num', cell: s => `<b>${qtdCabecotes(s)}</b>` },
      { h: 'Configurações', cell: s => resumoConfigs(s) },
      { h: 'Previsão', cell: s => App.date(s.previsaoEntrega) },
      { h: 'Status', cell: s => App.badge(s.status) },
      { h: '', class: 'num', cell: s => `
        <button class="btn sm" onclick="Sales.detalhes(${s.id})" title="Ver comando, tucho, pagamento e demais dados">Detalhes</button>
        <button class="btn sm ghost" onclick="Sales.status(${s.id})">Status</button>
        ${verValores ? `<button class="btn sm ghost" onclick="Sales.receber(${s.id})" title="Registrar recebimento (entrada / saldo)">💵</button>` : ''}
        <button class="btn sm ghost wa" onclick="Sales.wa(${s.id})" title="Avisar o cliente no WhatsApp">✆</button>
        <button class="btn sm ghost" onclick="Sales.etiqueta(${s.id})" title="Gerar etiqueta de envio">📦</button>
        ${fin ? `<button class="btn sm ghost" onclick="Sales.result(${s.id})">Resultado</button>` : ''}
        <button class="btn sm ghost" onclick="location.hash='#/sales/nova/${s.id}'" title="Editar venda">✏️</button>
        <button class="btn sm ghost" onclick="Sales.duplicar(${s.id})" title="Duplicar venda">📋</button>
        <button class="btn sm ghost" onclick="Sales.excluir(${s.id})" title="Excluir venda">🗑</button>` }
    ], { onRow: s => Sales.detalhes(s.id) });
  };
  render();
  document.getElementById('sf').addEventListener('change', render);

  window.Sales = {
    /* Tudo que saiu da listagem para ela caber na tela: comando, tucho,
       valores, pagamento e recebimentos de um pedido só. Quem não enxerga
       financeiro continua sem ver valor nenhum aqui. */
    detalhes(id) {
      const s = sales.find(x => x.id === id);
      if (!s) return;
      const rec = (s.recebimentos || []).reduce((a, r) => a + r.valor, 0);
      const saldo = Math.round((s.valorTotal - rec) * 100) / 100;
      const pg = s.pagamento || {};
      App.modal(`
        <h2>Pedido nº ${s.numero} — ${App.esc(App.clientName(s.clienteId, clients))}</h2>
        <p class="small muted">${App.esc(s.cidade || '—')}${s.estado ? '/' + App.esc(s.estado) : ''}
          · pedido em ${App.date(s.dataPedido)}
          · previsão ${App.date(s.previsaoEntrega)}
          ${s.dataEnvio ? '· enviado em ' + App.date(s.dataEnvio) : ''}
          · ${App.badge(s.status)}</p>

        <h3 class="section-title">Itens</h3>
        ${App.table(s.itens || [], [
          { h: 'Qtd', class: 'num', cell: i => i.qtd },
          { h: 'Produto', cell: i => `<b>${App.esc(i.produto)}</b>` },
          { h: 'Configuração', cell: i => i.kind === 'peca'
              ? '<span class="muted">peça do estoque</span>'
              : `${App.esc(configLabel(i))}<div class="small muted">comando ${App.esc(i.comando || '—')} · tucho ${App.esc(String(i.tucho || '—'))} mm</div>` },
          ...(verValores ? [
            { h: 'Unitário', class: 'num', cell: i => App.moneyHtml(i.valorUnit) },
            { h: 'Total', class: 'num', cell: i => App.moneyHtml(i.total) }] : [])
        ], { emptyMsg: 'Sem itens' })}

        ${verValores ? `
          <h3 class="section-title">Valores e pagamento</h3>
          <table style="font-size:13.5px">
            <tr><td>Valor total</td><td class="num"><b>R$ ${App.money(s.valorTotal)}</b></td></tr>
            ${(s.custosAdicionais || []).map(c => `<tr><td class="muted">Custo adicional — ${App.esc(c.desc || '')}</td>
              <td class="num muted">R$ ${App.money(c.valor)}</td></tr>`).join('')}
            <tr><td>Forma</td><td class="num">${App.esc(pg.forma || '—')}${pg.parcelas > 1 ? ` · ${pg.parcelas}x` : ''}${pg.condicao ? ` · ${App.esc(pg.condicao)}` : ''}</td></tr>
            ${pg.taxa ? `<tr><td>Taxa da operadora</td><td class="num neg">R$ ${App.money(pg.taxa)}</td></tr>
              <tr><td>Valor líquido</td><td class="num">R$ ${App.money(pg.valorLiquido)}</td></tr>` : ''}
            <tr><td>Já recebido</td><td class="num pos">R$ ${App.money(rec)}</td></tr>
            <tr><td><b>Saldo em aberto</b></td><td class="num"><b class="${saldo > 0.005 ? 'neg' : 'pos'}">R$ ${App.money(saldo)}</b></td></tr>
          </table>` : ''}

        ${s.observacoes ? `<h3 class="section-title">Observações</h3><p>${App.esc(s.observacoes)}</p>` : ''}

        <div class="actions">
          <button class="btn" onclick="App.closeModal()">Fechar</button>
          <button class="btn primary" onclick="App.closeModal();location.hash='#/sales/nova/${s.id}'">✏️ Editar pedido</button>
        </div>`, { wide: true });
    },

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
          value: s.clienteId, options: App.clientOptions(clients, s.clienteId) },
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
        <td>${s.itens.map(i => i.kind === 'peca'
          ? `${i.qtd}× ${App.esc(i.produto)}`
          : `${i.qtd}× ${App.esc(i.produto)} (${App.esc(i.comando || '—')}, tucho ${App.esc(String(i.tucho || '—'))} mm)`).join('; ')}</td>
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
            <select id="v-produto">${App.ativos(products).map(p => `<option value="${p.id}">${App.esc(p.nome)}</option>`).join('')}</select></label>
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
            <select id="v-peca">${App.ativos(estoque).map(it =>
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
  App.setTitle('Produção', 'A lista de trabalho da equipe: cabeçotes vendidos e serviços de clientes, com checklist por etapa');
  const dados = await App.get('/producao');
  const pos = dados.ordens || [];
  const ETAPAS = dados.etapas || [];
  const ST = ['nao_produzido', 'preparacao', 'usinagem', 'montagem', 'pronto'];
  const users = App.meta.users.filter(u => u.active);

  let filtroStatus = '', filtroTipo = '', filtroEtapa = '';

  const pendentes = pos.filter(p => p.status !== 'pronto' && p.status !== 'cancelado');
  const deVenda = pos.filter(p => p.origem !== 'servico' && p.status !== 'cancelado');
  const deServico = pos.filter(p => p.origem === 'servico' && p.status !== 'cancelado');

  view.innerHTML = `
    <div class="grid cols-4">
      <div class="card kpi"><div class="label">Em produção</div><div class="value">${pendentes.length}</div></div>
      <div class="card kpi"><div class="label">Cabeçotes vendidos</div><div class="value">${deVenda.filter(p => p.status !== 'pronto').length}</div></div>
      <div class="card kpi"><div class="label">Serviços de clientes</div><div class="value">${deServico.filter(p => p.status !== 'pronto').length}</div></div>
      <div class="card kpi k-ok"><div class="label">Prontos p/ envio</div><div class="value">${pos.filter(p => p.status === 'pronto').length}</div></div>
    </div>
    <div class="toolbar" style="margin-top:14px">
      <select id="pf-tipo" style="max-width:210px">
        <option value="">Vendas e serviços</option>
        <option value="venda">Só cabeçotes vendidos</option>
        <option value="servico">Só serviços de clientes</option>
      </select>
      <select id="pf" style="max-width:200px"><option value="">Todos os status</option>
        ${ST.map(s => `<option value="${s}">${(App.STATUS[s] || [s])[0]}</option>`).join('')}</select>
      <select id="pf-etapa" style="max-width:210px"><option value="">Todas as etapas</option>
        ${ETAPAS.map(e => `<option value="${e.chave}">${App.esc(e.nome)}</option>`).join('')}</select>
      <div class="spacer"></div>
      <span class="muted small" id="pf-contagem"></span>
      <button class="btn" onclick="PO.print()">🖨️ Imprimir ordens</button>
    </div>
    <div id="po-list"></div>`;

  /* Barra de etapas: mostra de relance onde a ordem está e deixa concluir
     a etapa inteira de uma vez, que é como a equipe realmente trabalha. */
  const barraEtapas = (p) => `
    <div class="etapas">
      ${(p.etapas || []).filter(e => e.total).map(e => `
        <button class="etapa ${e.situacao}${e.chave === p.etapaAtual ? ' atual' : ''}"
          title="${e.feitos}/${e.total} item(ns) — clique para ${e.situacao === 'concluida' ? 'reabrir' : 'concluir'} a etapa"
          onclick="PO.etapa(${p.id}, '${e.chave}', ${e.situacao !== 'concluida'})">
          <span class="etapa-nome">${App.esc(e.nome)}</span>
          <span class="etapa-qtd">${e.feitos}/${e.total}</span>
        </button>`).join('<span class="etapa-seta">›</span>')}
    </div>`;

  const cabecalhoVenda = (p) => `
    <b>OP #${p.id}</b> <span class="badge accent">Cabeçote vendido</span>
    <div style="margin-top:3px">${App.esc(p.produto)} · <b>Stage ${p.stage}</b> ·
      ${p.tipo === 'crossflow' ? 'fluxo cruzado' : 'unilateral'} ·
      comando <b>${App.esc(p.comando || '—')}</b> · tucho <b>${App.esc(String(p.tucho || '—'))} mm</b></div>
    <div class="small muted">Pedido nº ${p.pedidoNumero} · ${App.esc(p.clienteNome || '—')}
      ${p.qtdPedido > 1 ? ` · 1 de ${p.qtdPedido} do pedido` : ''}
      · previsão ${App.date(p.previsaoEntrega)} · resp.: ${App.esc(App.userName(p.responsavelId))}</div>
    ${p.observacoes ? `<div class="small" style="margin-top:4px"><b>Obs.:</b> ${App.esc(p.observacoes)}</div>` : ''}`;

  const cabecalhoServico = (p) => `
    <b>OP #${p.id}</b> <span class="badge info">Serviço de cliente</span>
    ${p.osStatus ? App.badge(p.osStatus) : ''}
    <div style="margin-top:3px">${App.esc(p.produto || 'Cabeçote de cliente')}${p.identificacao ? ` · <span class="mono">${App.esc(p.identificacao)}</span>` : ''}</div>
    <div class="small muted">OS nº ${p.osNumero} · ${App.esc(p.clienteNome || '—')}
      · prazo ${App.date(p.previsaoEntrega)} · resp.: ${App.esc(App.userName(p.responsavelId))}</div>
    ${p.problema ? `<div class="small" style="margin-top:4px"><b>Problema:</b> ${App.esc(p.problema)}</div>` : ''}
    ${p.descricaoServico ? `<div class="small"><b>Serviço:</b> ${App.esc(p.descricaoServico)}</div>` : ''}
    ${(p.operacoes || []).length ? `<div class="small" style="margin-top:4px"><b>Operações:</b> ${
      p.operacoes.map(o => App.esc((o.qtd > 1 ? o.qtd + '× ' : '') + o.nome)).join(' · ')}</div>` : ''}
    ${(p.pecas || []).length ? `<div class="small"><b>Peças necessárias:</b> ${p.pecas.map(x => App.esc(x)).join(' · ')}</div>` : ''}
    ${p.observacoes ? `<div class="small" style="margin-top:4px"><b>Obs.:</b> ${App.esc(p.observacoes)}</div>` : ''}`;

  /* A etapa atual já vem aberta; as que o usuário abrir à mão continuam
     abertas quando a tela se redesenha. */
  const abertas = new Set();

  const render = () => {
    const list = pos.filter(p =>
      p.status !== 'cancelado' &&
      (!filtroStatus || p.status === filtroStatus) &&
      (!filtroTipo || (filtroTipo === 'servico' ? p.origem === 'servico' : p.origem !== 'servico')) &&
      (!filtroEtapa || p.etapaAtual === filtroEtapa));
    document.getElementById('pf-contagem').textContent = `${list.length} ordem(ns)`;
    document.getElementById('po-list').innerHTML = list.length ? list.map(p => `
      <div class="card" style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;align-items:flex-start">
          <div>${p.origem === 'servico' ? cabecalhoServico(p) : cabecalhoVenda(p)}</div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <span class="small muted" title="Itens concluídos no checklist">${p.feitos}/${p.totalItens}</span>
            <span title="O status acompanha o checklist — marque as etapas abaixo">${App.badge(p.status)}</span>
            <select onchange="PO.setResp(${p.id}, this.value)" style="width:auto" title="Responsável">
              <option value="">— responsável —</option>
              ${users.map(u => `<option value="${u.id}" ${p.responsavelId === u.id ? 'selected' : ''}>${App.esc(u.name)}</option>`).join('')}
            </select>
            ${p.origem === 'servico'
              ? `<button class="btn sm ghost" onclick="location.hash='#/os'" title="Abrir a ordem de serviço">Ver OS</button>`
              : `<button class="btn sm ghost" onclick="location.hash='#/sales'" title="Abrir o pedido">Ver pedido</button>`}
            <button class="btn sm" onclick="PO.printOne(${p.id})" title="Imprimir esta ordem">🖨️</button>
            <button class="btn sm ghost" onclick="PO.cancelar(${p.id})" title="Cancelar a ordem de produção">🚫</button>
          </div>
        </div>
        ${barraEtapas(p)}
        ${(p.etapas || []).filter(e => e.total).map(e => `
          <details class="etapa-bloco" ${e.chave === p.etapaAtual || abertas.has(p.id + ':' + e.chave) ? 'open' : ''}
            data-op="${p.id}" data-etapa="${e.chave}">
            <summary class="etapa-titulo">
              <span>${App.esc(e.nome)} <span class="muted">${e.feitos}/${e.total}</span></span>
              <span class="btn sm ghost" onclick="event.preventDefault();event.stopPropagation();PO.etapa(${p.id}, '${e.chave}', ${e.situacao !== 'concluida'})">
                ${e.situacao === 'concluida' ? 'Reabrir etapa' : 'Concluir etapa'}</span>
            </summary>
            <ul class="checklist">
              ${p.checklist.map((c, i) => [c, i]).filter(([c]) => c.etapa === e.chave).map(([c, i]) => `
                <li class="${c.done ? 'done' : ''}">
                  <input type="checkbox" ${c.done ? 'checked' : ''} onchange="PO.check(${p.id}, ${i}, this.checked)">
                  <span>${App.esc(c.item)}</span>
                  ${c.done && c.por ? `<span class="small muted">(${App.esc(c.por)})</span>` : ''}
                </li>`).join('')}
            </ul>
          </details>`).join('')}
      </div>`).join('')
      : `<div class="card"><div class="empty">Nenhuma ordem de produção nesta situação.
         ${pos.length ? 'Experimente limpar os filtros acima.' :
           'Vendas de cabeçote e orçamentos aprovados entram aqui automaticamente. Se faltar algo antigo, use <b>Reconciliar</b> em Administração.'}</div></div>`;
  };
  render();
  document.getElementById('po-list').addEventListener('toggle', e => {
    const d = e.target;
    if (!d.matches || !d.matches('details.etapa-bloco')) return;
    const chave = d.dataset.op + ':' + d.dataset.etapa;
    if (d.open) abertas.add(chave); else abertas.delete(chave);
  }, true);
  document.getElementById('pf').addEventListener('change', e => { filtroStatus = e.target.value; render(); });
  document.getElementById('pf-tipo').addEventListener('change', e => { filtroTipo = e.target.value; render(); });
  document.getElementById('pf-etapa').addEventListener('change', e => { filtroEtapa = e.target.value; render(); });

  /* Atualiza a ordem na tela com o que o servidor devolveu (etapas e status
     vêm calculados de lá, então a tela nunca inventa andamento). */
  const aplicar = (novo) => {
    const i = pos.findIndex(x => x.id === novo.id);
    if (i >= 0) pos[i] = Object.assign({}, pos[i], novo);
    render();
  };

  window.PO = {
    async check(id, i, done) {
      const antes = (pos.find(x => x.id === id) || {}).status;
      try {
        const novo = await App.post(`/productionOrders/${id}/check`, { index: i, done });
        aplicar(novo);
        if (novo.status === 'pronto' && antes !== 'pronto') {
          App.toast(novo.origem === 'servico'
            ? 'Serviço concluído — pronto para devolver ao cliente'
            : 'Produção concluída — componentes baixados do estoque próprio', 'ok');
        }
      } catch (e) { App.toast(e.message, 'err'); }
    },
    async etapa(id, etapa, done) {
      const antes = (pos.find(x => x.id === id) || {}).status;
      try {
        const novo = await App.post(`/productionOrders/${id}/etapa`, { etapa, done });
        aplicar(novo);
        if (novo.status === 'pronto' && antes !== 'pronto') {
          App.toast(novo.origem === 'servico'
            ? 'Serviço concluído — pronto para devolver ao cliente'
            : 'Produção concluída — componentes baixados do estoque próprio', 'ok');
        }
      } catch (e) { App.toast(e.message, 'err'); }
    },
    async cancelar(id) {
      const p = pos.find(x => x.id === id);
      if (!await App.confirm(`Cancelar a ordem de produção #${id}?<br><br>
        <span class="small">Ela sai da lista de trabalho da equipe. O ${p.origem === 'servico' ? 'serviço' : 'pedido'} continua como está.</span>`,
        { html: true })) return;
      try {
        await App.post(`/productionOrders/${id}/status`, { status: 'cancelado' });
        App.toast('Ordem cancelada', 'ok');
        App.route();
      } catch (e) { App.toast(e.message, 'err'); }
    },
    async setResp(id, v) {
      try { aplicar(await App.post(`/productionOrders/${id}/status`, { responsavelId: v ? Number(v) : null })); }
      catch (e) { App.toast(e.message, 'err'); }
    },
    printOne(id) {
      const p = pos.find(x => x.id === id);
      const ficha = p.origem === 'servico'
        ? `<table><tr><th>OS</th><th>Cliente</th><th>Cabeçote</th><th>Identificação</th><th>Prazo</th></tr>
           <tr><td>nº ${p.osNumero}</td><td>${App.esc(p.clienteNome || '')}</td><td>${App.esc(p.produto || '')}</td>
           <td>${App.esc(p.identificacao || '—')}</td><td>${App.date(p.previsaoEntrega)}</td></tr></table>
           ${p.problema ? `<p><b>Problema:</b> ${App.esc(p.problema)}</p>` : ''}
           ${(p.operacoes || []).length ? `<p><b>Operações:</b> ${p.operacoes.map(o => App.esc((o.qtd > 1 ? o.qtd + '× ' : '') + o.nome)).join(' · ')}</p>` : ''}
           ${(p.pecas || []).length ? `<p><b>Peças:</b> ${p.pecas.map(x => App.esc(x)).join(' · ')}</p>` : ''}`
        : `<table><tr><th>Produto</th><th>Stage</th><th>Comando</th><th>Tucho</th><th>Pedido</th><th>Cliente</th><th>Previsão</th></tr>
           <tr><td>${App.esc(p.produto)}</td><td>${p.stage}</td><td>${App.esc(p.comando || '')}</td><td>${App.esc(String(p.tucho || ''))} mm</td>
           <td>nº ${p.pedidoNumero}</td><td>${App.esc(p.clienteNome || '')}</td><td>${App.date(p.previsaoEntrega)}</td></tr></table>`;
      App.print(`Ordem de Produção #${p.id}`,
        ficha +
        (p.observacoes ? `<p><b>Observações:</b> ${App.esc(p.observacoes)}</p>` : '') +
        (p.etapas || []).filter(e => e.total).map(e => `
          <h3>${App.esc(e.nome)}</h3>
          <ul class="check">${p.checklist.filter(c => c.etapa === e.chave).map(c => `<li>${App.esc(c.item)}</li>`).join('')}</ul>`).join('') +
        '<div class="sig"><div>Executado por</div><div>Controle de qualidade</div></div>',
        `Responsável: ${App.userName(p.responsavelId)}`);
    },
    /* Impressão para a equipe: uma tabela compacta de "o que precisa ser
       feito", nos moldes da impressão da Ordem de Serviço. O checklist por
       etapa fica só na tela — no papel ele ocupava páginas e atrapalhava.
       Nada de dinheiro aqui: a produção não vê preço, custo nem pagamento. */
    print() {
      const list = pos.filter(p =>
        p.status !== 'cancelado' &&
        (!filtroStatus || p.status === filtroStatus) &&
        (!filtroTipo || (filtroTipo === 'servico' ? p.origem === 'servico' : p.origem !== 'servico')) &&
        (!filtroEtapa || p.etapaAtual === filtroEtapa));

      /* Cada cabeçote vendido gera uma ordem por unidade. Juntar as
         idênticas é o que faz a coluna "Qtd" dizer alguma coisa: em vez de
         três linhas iguais de 1, uma linha de 3. */
      const grupos = [];
      const porChave = new Map();
      for (const p of list) {
        const chave = [p.origem, p.pedidoNumero, p.osNumero, p.produto, p.tipo, p.stage,
          p.comando, p.tucho, p.identificacao, p.status, p.previsaoEntrega,
          (p.operacoes || []).map(o => o.qtd + '×' + o.nome).join('|')].join('§');
        const achado = porChave.get(chave);
        if (achado) { achado.qtd++; achado.ids.push(p.id); }
        else { const g = { p, qtd: 1, ids: [p.id] }; porChave.set(chave, g); grupos.push(g); }
      }

      const linha = (g) => {
        const p = g.p;
        const servico = p.origem === 'servico';
        const origem = servico ? `OS nº ${App.esc(String(p.osNumero || '—'))}`
                               : `Pedido nº ${App.esc(String(p.pedidoNumero || '—'))}`;
        /* Nas vendas o nome do produto do catálogo é sempre "Cabeçote
           Unilateral — Stage 1" e afins, ou seja, repetiria tipo e stage.
           Só entra como segunda linha se disser algo diferente. */
        const tipoStage = `${p.tipo === 'crossflow' ? 'Fluxo cruzado' : 'Unilateral'} · Stage ${p.stage || '—'}`;
        const normaliza = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const cabecote = servico
          ? App.esc(p.produto || 'Cabeçote de cliente') +
            (p.identificacao ? `<div class="sub">${App.esc(p.identificacao)}</div>` : '')
          : App.esc(tipoStage) +
            (p.produto && !normaliza(p.produto).includes(normaliza(tipoStage))
              ? `<div class="sub">${App.esc(p.produto)}</div>` : '');
        /* O "o que fazer" resumido: a configuração no caso do cabeçote
           vendido, as operações no caso do serviço de cliente. */
        const fazer = servico
          ? ((p.operacoes || []).length
              ? p.operacoes.map(o => App.esc((o.qtd > 1 ? o.qtd + '× ' : '') + o.nome)).join(' · ')
              : App.esc(p.descricaoServico || p.problema || '—')) +
            ((p.pecas || []).length ? `<div class="sub">Peças: ${p.pecas.map(x => App.esc(x)).join(' · ')}</div>` : '')
          : `Comando <b>${App.esc(p.comando || '—')}</b> · tucho <b>${App.esc(String(p.tucho || '—'))} mm</b>`;
        return `<tr>
          <td>${origem}<div class="sub">${g.ids.map(i => 'OP #' + i).join(', ')}</div></td>
          <td>${App.esc(p.clienteNome || '—')}</td>
          <td>${cabecote}</td>
          <td>${fazer}</td>
          <td class="num">${g.qtd}</td>
          <td>${App.date(p.previsaoEntrega)}</td>
          <td>${(App.STATUS[p.status] || [p.status])[0]}</td>
        </tr>`;
      };

      const totalCabecotes = grupos.reduce((s, g) => s + g.qtd, 0);
      App.print('Produção — lista de trabalho' + (filtroStatus ? ' — ' + (App.STATUS[filtroStatus] || [filtroStatus])[0] : ''),
        (grupos.length
          ? `<table>
              <tr><th>Origem</th><th>Cliente</th><th>Cabeçote</th><th>O que fazer</th>
                  <th class="num">Qtd</th><th>Previsão</th><th>Status</th></tr>
              ${grupos.map(linha).join('')}
             </table>`
          : '<p>Nenhuma ordem de produção nesta situação.</p>') +
        '<div class="sig"><div>Executado por</div><div>Conferido por</div></div>',
        `${totalCabecotes} cabeçote(s) em ${grupos.length} linha(s)`);
    }
  };
});
