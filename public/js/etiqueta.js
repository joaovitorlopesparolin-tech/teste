/* Etiqueta de envio — gerada a partir de um pedido (venda) ou de uma OS.
   Remetente: dados da empresa (cadastrados uma vez em Administração).
   Destinatário: dados do cadastro do cliente, sem redigitar nada.
   Layout: ~1/3 de uma folha A4 vertical, para recortar e colar na caixa.
   "Salvar como PDF" na janela de impressão gera o PDF. */
'use strict';

const Etiqueta = {
  /** origem: 'sales' | 'serviceOrders' — doc: o pedido/OS; cliente: cadastro */
  dados(origem, doc, cliente) {
    const e = (App.meta && App.meta.settings && App.meta.settings.empresa) || {};
    const ref = origem === 'sales' ? `PEDIDO Nº ${doc.numero}` : `OS Nº ${doc.numero}`;
    const itens = origem === 'sales'
      ? (doc.itens || []).map(i => `${i.qtd}× ${i.produto}`).join(' + ')
      : (doc.modelo || 'Cabeçote');
    return { empresa: e, cliente: cliente || {}, ref, itens, doc, origem };
  },

  /** Falta algo essencial no cadastro? Devolve a lista de pendências. */
  faltando(d) {
    const f = [];
    if (!d.cliente.nome) f.push('nome do cliente');
    if (!d.cliente.endereco) f.push('endereço');
    if (!d.cliente.cidade) f.push('cidade');
    if (!App.digits(d.cliente.cep)) f.push('CEP');
    return f;
  },

  bloco(titulo, p, destaque) {
    const linhaEnd = [p.endereco, p.numero].filter(Boolean).join(', ');
    const doc = App.digits(p.cnpj || p.cpfCnpj) ? App.fmtCpfCnpj(p.cnpj || p.cpfCnpj) : '';
    return `
      <div class="bloco ${destaque ? 'destaque' : ''}">
        <div class="rot">${titulo}</div>
        <div class="nome">${App.esc(p.razaoSocial || p.nome || '—')}</div>
        ${doc ? `<div class="doc">${doc.length > 14 ? 'CNPJ' : 'CPF'}: ${doc}</div>` : ''}
        <div class="end">${App.esc(linhaEnd || '—')}</div>
        ${p.complemento ? `<div class="end">${App.esc(p.complemento)}</div>` : ''}
        ${p.bairro ? `<div class="end">${App.esc(p.bairro)}</div>` : ''}
        <div class="cidade">${App.esc(p.cidade || '—')} / ${App.esc(p.estado || '--')}</div>
        <div class="cep">CEP ${App.esc(App.fmtCep(p.cep) || '—')}</div>
        ${p.telefone ? `<div class="end">Tel.: ${App.esc(p.telefone)}</div>` : ''}
      </div>`;
  },

  html(d) {
    const hoje = new Date().toLocaleDateString('pt-BR');
    return `
      <div class="etiqueta">
        <div class="topo">
          <img class="marca" src="${location.origin}${App.IMG_LOGO}" alt="Jaques Motorsport">
          <div class="ref">
            <div class="ref-num">${App.esc(d.ref)}</div>
            <div class="ref-item">${App.esc(d.itens || '')}</div>
            <div class="ref-data">Emitida em ${hoje}</div>
          </div>
        </div>
        ${this.bloco('DESTINATÁRIO', d.cliente, true)}
        ${this.bloco('REMETENTE', d.empresa, false)}
        <div class="rodape">Conteúdo: peça automotiva — manuseie com cuidado</div>
      </div>`;
  },

  css() {
    return `
      @page { size: A4 portrait; margin: 10mm; }
      body { font: 12px/1.35 Arial, Helvetica, sans-serif; color: #000; margin: 0; }
      .etiqueta {
        width: 190mm; min-height: 70mm; box-sizing: border-box;
        border: 2px solid #000; border-radius: 3mm; padding: 2.5mm 5mm;
        display: flex; flex-direction: column; gap: 1.2mm;
      }
      .topo { display: flex; justify-content: space-between; align-items: flex-start;
              border-bottom: 1px solid #000; padding-bottom: 1.2mm; }
      .marca { height: 7mm; width: auto; display: block; }
      .ref { text-align: right; }
      .ref-num { font-size: 11pt; font-weight: bold; }
      .ref-item { font-size: 8pt; }
      .ref-data { font-size: 7.5pt; color: #444; }

      .bloco { border: 1px solid #000; border-radius: 2mm; padding: 1.2mm 3mm; }
      .bloco.destaque { border-width: 2px; background: #f4f4f4; }
      .rot { font-size: 7pt; font-weight: bold; letter-spacing: 2px; margin-bottom: 0.5mm;
             background: #000; color: #fff; display: inline-block; padding: 0.6mm 2.5mm; border-radius: 1mm; }
      .bloco.destaque .nome { font-size: 12.5pt; font-weight: bold; line-height: 1.1; }
      .nome { font-size: 9.5pt; font-weight: bold; }
      .doc { font-size: 7.5pt; }
      .bloco.destaque .end { font-size: 9.5pt; line-height: 1.15; }
      .end { font-size: 7.5pt; line-height: 1.12; }
      .bloco.destaque .cidade { font-size: 11.5pt; font-weight: bold; }
      .cidade { font-size: 8.5pt; font-weight: bold; }
      .bloco.destaque .cep { font-size: 12.5pt; font-weight: bold; letter-spacing: 1px; }
      .cep { font-size: 8.5pt; font-weight: bold; }

      .rodape { margin-top: 0.3mm; text-align: center; font-size: 7pt;
                border-top: 1px dashed #666; padding-top: 1mm; color: #333; }
      @media print { .noprint { display: none !important; } }
      .noprint { text-align: center; margin: 6mm 0; }
      .noprint button { font-size: 12pt; padding: 8px 22px; cursor: pointer; }`;
  },

  /** Abre a etiqueta pronta: pré-visualização + botão imprimir (ou salvar em PDF). */
  abrir(origem, doc, cliente, { imprimirDireto } = {}) {
    const d = this.dados(origem, doc, cliente);
    const falta = this.faltando(d);
    const gerar = () => {
      const w = window.open('', '_blank');
      w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
        <title>Etiqueta — ${App.esc(d.ref)}</title><style>${this.css()}</style></head><body>
        ${this.html(d)}
        <div class="noprint">
          <button onclick="window.print()">🖨️ Imprimir / Salvar em PDF</button>
          <p style="font-size:10pt;color:#555">Na janela de impressão, escolha <b>“Salvar como PDF”</b> no destino
          para gerar o arquivo. Recorte na borda e cole na embalagem.</p>
        </div>
        ${imprimirDireto ? '<script>window.onload = () => setTimeout(() => window.print(), 250);<\/script>' : ''}
        </body></html>`);
      w.document.close();
      // registra no histórico do pedido/OS que a etiqueta foi gerada
      App.post('/labels', { origem, refId: doc.id, ref: d.ref, clienteId: d.cliente.id || null }).catch(() => {});
    };

    if (!falta.length) return gerar();

    App.modal(`
      <h2>📦 Etiqueta de envio</h2>
      <p>Faltam dados no cadastro de <b>${App.esc(d.cliente.nome || 'cliente')}</b> para a etiqueta ficar completa:</p>
      <p style="margin-top:6px"><b>${falta.map(x => App.esc(x)).join(' · ')}</b></p>
      <p class="small muted" style="margin-top:10px">Complete o cadastro do cliente (basta digitar o CEP — o endereço
      vem sozinho) ou gere assim mesmo e escreva à mão o que faltar.</p>
      <div class="actions">
        <button class="btn" onclick="App.closeModal()">Cancelar</button>
        ${d.cliente.id ? `<button class="btn" onclick="App.closeModal();location.hash='#/clients/${d.cliente.id}'">Abrir cadastro do cliente</button>` : ''}
        <button class="btn primary" id="et-mesmo">Gerar assim mesmo</button>
      </div>`);
    document.getElementById('et-mesmo').onclick = () => { App.closeModal(); gerar(); };
  }
};

window.Etiqueta = Etiqueta;
