/* Análises (BI): gráficos com filtro de período que escopa tudo abaixo dele */
'use strict';

App.registerView('analytics', async (view) => {
  App.setTitle('Análises', 'Indicadores visuais da operação — passe o mouse para detalhes, ⊞ para ver os dados');
  let meses = 12;

  const build = async () => {
    const grid = document.getElementById('an-grid');
    if (grid) grid.style.opacity = '.45'; // refetch mantém o quadro anterior esmaecido
    const d = await App.get('/analytics?meses=' + meses);
    const C = Charts.C;
    const cards = [];
    const fmt = v => 'R$ ' + App.money(v);

    /* Faturamento mensal — vendas × serviços (só chega para quem tem financeiro) */
    if (d.faturamento) {
      const cFat = Charts.card('Faturamento mensal', 'Vendas (data do pedido) e serviços (OS finalizadas)');
      cards.push({ card: cFat, render: () => {
        Charts.columns(document.getElementById(cFat.id), {
          labels: d.faturamento.map(x => x.mes),
          series: [
            { name: 'Vendas de cabeçotes', color: C.blue, values: d.faturamento.map(x => x.vendas) },
            { name: 'Serviços', color: C.orange, values: d.faturamento.map(x => x.servicos) }
          ]
        });
        Charts.attachTable(cFat.id, ['Mês', 'Vendas', 'Serviços', 'Total'],
          d.faturamento.map(x => [x.mes, fmt(x.vendas), fmt(x.servicos), fmt(x.vendas + x.servicos)]));
      }});
    }

    /* Fluxo de caixa — entradas × saídas */
    if (d.caixa) {
      const c = Charts.card('Fluxo de caixa mensal', 'Dinheiro que efetivamente entrou e saiu');
      cards.push({ card: c, render: () => {
        Charts.columns(document.getElementById(c.id), {
          labels: d.caixa.map(x => x.mes),
          series: [
            { name: 'Entradas', color: C.blue, values: d.caixa.map(x => x.entradas) },
            { name: 'Saídas', color: C.red, values: d.caixa.map(x => x.saidas) }
          ]
        });
        Charts.attachTable(c.id, ['Mês', 'Entradas', 'Saídas', 'Saldo do mês'],
          d.caixa.map(x => [x.mes, fmt(x.entradas), fmt(x.saidas), fmt(x.entradas - x.saidas)]));
      }});
    }

    /* Resultado mensal (restrito) */
    if (d.resultado) {
      const c = Charts.card('Resultado das vendas por mês', 'Valor líquido − custo real estimado (acesso restrito)');
      cards.push({ card: c, render: () => {
        Charts.line(document.getElementById(c.id), {
          labels: d.resultado.map(x => x.mes),
          series: [{ name: 'Resultado', color: C.blue, values: d.resultado.map(x => Math.round(x.resultado * 100) / 100) }]
        });
        Charts.attachTable(c.id, ['Mês', 'Resultado'], d.resultado.map(x => [x.mes, fmt(x.resultado)]));
      }});
    }

    /* Projeção semanal — a receber × a pagar */
    if (d.projecaoSemanal) {
      const venc = d.vencidos && (d.vencidos.aReceber || d.vencidos.aPagar)
        ? `Fora do gráfico, já vencidos: a receber R$ ${App.money(d.vencidos.aReceber)} · a pagar R$ ${App.money(d.vencidos.aPagar)}`
        : 'Próximas 8 semanas (semana iniciando em)';
      const c = Charts.card('Compromissos das próximas 8 semanas', venc);
      cards.push({ card: c, render: () => {
        Charts.columns(document.getElementById(c.id), {
          labels: d.projecaoSemanal.map(x => x.semana),
          series: [
            { name: 'A receber', color: C.blue, values: d.projecaoSemanal.map(x => x.aReceber) },
            { name: 'A pagar', color: C.red, values: d.projecaoSemanal.map(x => x.aPagar) }
          ]
        });
        Charts.attachTable(c.id, ['Semana de', 'A receber', 'A pagar'],
          d.projecaoSemanal.map(x => [x.semana, fmt(x.aReceber), fmt(x.aPagar)]));
      }});
    }

    /* Vendas por produto/estado — visão comercial (quem não vê valores usa o bloco operacional) */
    if (d.produtos && d.produtos.length && d.produtos[0].valor !== undefined) {
      const comValor = true;
      const c = Charts.card('Vendas por configuração', comValor
        ? 'Faturamento no período — unilateral × fluxo cruzado, Stage 1–3'
        : 'Quantidade vendida no período — unilateral × fluxo cruzado, Stage 1–3');
      cards.push({ card: c, render: () => {
        Charts.hbar(document.getElementById(c.id), {
          items: d.produtos.map(p => comValor
            ? { label: p.produto, value: p.valor, sub: p.qtd + ' un.' }
            : { label: p.produto, value: p.qtd }),
          color: Charts.C.blue, count: !comValor
        });
        Charts.attachTable(c.id, comValor ? ['Configuração', 'Qtd', 'Faturamento'] : ['Configuração', 'Qtd'],
          d.produtos.map(p => comValor ? [p.produto, String(p.qtd), fmt(p.valor)] : [p.produto, String(p.qtd)]));
      }});

      const c2 = Charts.card('Vendas por estado', comValor
        ? 'Faturamento no período por UF do pedido' : 'Cabeçotes vendidos no período por UF do pedido');
      cards.push({ card: c2, render: () => {
        Charts.hbar(document.getElementById(c2.id), {
          items: d.estados.map(e => comValor
            ? { label: e.uf, value: e.valor, sub: e.qtd + ' cabeçote(s)' }
            : { label: e.uf, value: e.qtd }),
          color: Charts.C.blue, count: !comValor
        });
        Charts.attachTable(c2.id, comValor ? ['UF', 'Cabeçotes', 'Faturamento'] : ['UF', 'Cabeçotes'],
          d.estados.map(e => comValor ? [e.uf, String(e.qtd), fmt(e.valor)] : [e.uf, String(e.qtd)]));
      }});
    }

    /* ---------- Operacional (sem valores) — base das Análises da Produção ---------- */
    const op = d.operacional || {};

    if (op.movimento) {
      const c = Charts.card('Movimento da oficina', 'Cabeçotes que chegaram × serviços finalizados, por mês');
      cards.push({ card: c, render: () => {
        Charts.columns(document.getElementById(c.id), {
          labels: op.movimento.map(x => x.mes),
          series: [
            { name: 'Cabeçotes recebidos', color: C.blue, values: op.movimento.map(x => x.entradas) },
            { name: 'Serviços finalizados', color: C.orange, values: op.movimento.map(x => x.finalizadas) }
          ]
        });
        Charts.attachTable(c.id, ['Mês', 'Recebidos', 'Finalizados'],
          op.movimento.map(x => [x.mes, String(x.entradas), String(x.finalizadas)]));
      }});
    }

    if (op.statusProducao && op.statusProducao.some(x => x.qtd)) {
      const c = Charts.card('Produção agora', 'Cabeçotes vendidos por etapa de produção');
      cards.push({ card: c, render: () => {
        Charts.hbar(document.getElementById(c.id), {
          items: op.statusProducao.map(x => ({ label: x.etapa, value: x.qtd })),
          colors: C.ramp, count: true
        });
        Charts.attachTable(c.id, ['Etapa', 'Quantidade'], op.statusProducao.map(x => [x.etapa, String(x.qtd)]));
      }});
    }

    if (op.servicosTop && op.servicosTop.length) {
      const c = Charts.card('Serviços mais executados', 'Volume por tipo de serviço nas OS do período');
      cards.push({ card: c, render: () => {
        Charts.hbar(document.getElementById(c.id), {
          items: op.servicosTop.map(x => ({ label: x.nome, value: x.qtd })),
          color: C.blue, count: true
        });
        Charts.attachTable(c.id, ['Serviço', 'Vezes executado'], op.servicosTop.map(x => [x.nome, String(x.qtd)]));
      }});
    }

    if (op.configuracoes && op.configuracoes.length) {
      const c = Charts.card('Cabeçotes por configuração', 'Quantidade produzida no período — unilateral × crossflow, por Stage');
      cards.push({ card: c, render: () => {
        Charts.hbar(document.getElementById(c.id), {
          items: op.configuracoes.map(x => ({ label: x.config, value: x.qtd })),
          color: C.blue, count: true
        });
        Charts.attachTable(c.id, ['Configuração', 'Quantidade'], op.configuracoes.map(x => [x.config, String(x.qtd)]));
      }});
    }

    if (op.pista && op.pista.length) {
      const c = Charts.card('🏁 Assistência de pista', 'Pessoas por etapa/evento de corrida');
      cards.push({ card: c, render: () => {
        Charts.hbar(document.getElementById(c.id), {
          items: op.pista.map(x => ({ label: x.evento, value: x.pessoas, sub: x.dias + ' dia(s)' })),
          color: C.orange, count: true
        });
        Charts.attachTable(c.id, ['Evento', 'Pessoas', 'Dias'],
          op.pista.map(x => [x.evento, String(x.pessoas), String(x.dias)]));
      }});
    }

    /* Funil da oficina — etapas ordenadas → ramp ordinal (claro→escuro) */
    if (d.funil) {
      const c = Charts.card('Funil da oficina', 'Cabeçotes de clientes por etapa — situação atual');
      cards.push({ card: c, render: () => {
        Charts.hbar(document.getElementById(c.id), {
          items: d.funil.map(f => ({ label: f.etapa, value: f.qtd })),
          colors: Charts.C.ramp, count: true
        });
        Charts.attachTable(c.id, ['Etapa', 'Quantidade'], d.funil.map(f => [f.etapa, String(f.qtd)]));
      }});
    }

    document.getElementById('an-grid').innerHTML = cards.map(x => x.card.html).join('');
    document.getElementById('an-grid').style.opacity = '1';
    cards.forEach(x => x.render());
  };

  view.innerHTML = `
    <div class="toolbar" id="an-filters">
      <span class="small muted" style="letter-spacing:1px">PERÍODO:</span>
      ${[3, 6, 12].map(m => `<button class="btn sm ${m === meses ? 'primary' : ''}" data-m="${m}">${m} meses</button>`).join('')}
      <div class="spacer"></div>
      <span class="small muted">O período filtra todos os gráficos abaixo</span>
    </div>
    <div class="grid cols-2" id="an-grid"></div>`;

  document.getElementById('an-filters').addEventListener('click', async e => {
    const b = e.target.closest('[data-m]');
    if (!b) return;
    meses = Number(b.dataset.m);
    document.querySelectorAll('#an-filters [data-m]').forEach(x =>
      x.classList.toggle('primary', Number(x.dataset.m) === meses));
    await build();
  });
  await build();
});
