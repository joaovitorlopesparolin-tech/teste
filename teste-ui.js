/* Teste de interface do painel (rode com: npm test).
   Abre o controlepedidos.html num Chromium headless com o Supabase simulado
   e valida: layout full-screen, cabeçalho fixo, select-badge de situação,
   desfazer, ação em lote, filtro por situação no rodapé, alerta de entrega
   atrasada, detecção de conflito de edição e o layout mobile em cartões.
   O caminho do Chromium pode ser sobrescrito com a variável CHROMIUM_PATH. */
"use strict";
const path = require("path");
const { chromium } = require("playwright-core");

const EXEC = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium";
const URL_APP = "file://" + path.join(__dirname, "controlepedidos.html");
const T0 = "2026-01-01T00:00:00.000Z"; // "versão" inicial de todos os itens no servidor simulado
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*" };

const dataRel = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const CATS = ["Estrutura", "Elétrica", "Hidráulica", "Acabamento"];
const SITS = ["A Pedir", "Pedido Enviado", "Entregue"];
// 70 itens; os "Pedido Enviado" de índice ímpar têm pedido de 10 dias atrás (atrasados)
const rows = Array.from({ length: 70 }, (_, i) => ({
  id: "i" + i,
  codigo: CATS[i % 4].slice(0, 3).toUpperCase() + "-" + String(i + 1).padStart(3, "0"),
  categoria: CATS[i % 4],
  descricao: "Material de teste nº " + (i + 1),
  unidade: "Un",
  qtd: (i + 1) * 3,
  criado_em: dataRel(30),
  data_pedido: i % 3 === 0 ? null : dataRel(i % 2 ? 10 : 2),
  data_entrega: i % 3 === 2 ? dataRel(1) : null,
  situacao: SITS[i % 3],
  link: i % 5 === 0 ? "https://fornecedor.exemplo.com/produto/" + (i + 1) : null,
  atualizado_em: T0,
}));
const conf = [{ chave: "obra", valor: "Obra Teste — Sede" }, { chave: "proxFolha", valor: "4" }];

let falhas = 0;
function ok(cond, msg){
  if(cond) console.log("  ok —", msg);
  else { console.error("  FALHOU —", msg); falhas++; }
}

(async () => {
  const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
  const estado = { conflito: false, posts: [] };

  async function prepararPagina(context){
    const page = await context.newPage();
    page.on("pageerror", e => { console.error("  ERRO JS na página:", e.message); falhas++; });
    await page.route("**/rest/v1/**", route => {
      const url = decodeURIComponent(route.request().url());
      const metodo = route.request().method();
      if(url.includes("/itens")){
        if(metodo === "POST"){
          estado.posts.push(JSON.parse(route.request().postData()));
          return route.fulfill({ status: 201, headers: CORS, body: "[]" });
        }
        const m = url.match(/id=in\.\(([^)]*)\)/);
        if(m){
          const ids = m[1].split(",");
          const versao = estado.conflito ? "2099-01-01T00:00:00.000Z" : T0;
          return route.fulfill({ status: 200, headers: CORS, body: JSON.stringify(ids.map(id => ({ id, atualizado_em: versao }))) });
        }
        return route.fulfill({ status: 200, headers: CORS, body: JSON.stringify(rows) });
      }
      if(url.includes("/config")) return route.fulfill({ status: 200, headers: CORS, body: JSON.stringify(conf) });
      return route.fulfill({ status: 200, headers: CORS, body: "[]" });
    });
    await page.goto(URL_APP);
    await page.waitForSelector(".sel-sit", { timeout: 8000 });
    return page;
  }

  // espera uma condição assíncrona virar verdadeira (polling curto)
  async function ate(page, fn, msg){
    for(let i = 0; i < 30; i++){
      if(await fn()) { ok(true, msg); return true; }
      await page.waitForTimeout(150);
    }
    ok(false, msg + " (timeout)");
    return false;
  }

  const desktop = await browser.newContext({ viewport: { width: 1920, height: 1000 } });
  const page = await prepararPagina(desktop);

  console.log("— layout —");
  const layout = await page.evaluate(() => ({
    largura: document.querySelector(".sheet").getBoundingClientRect().width,
    altura: document.querySelector(".sheet").getBoundingClientRect().height,
    bodyRola: document.body.scrollHeight > window.innerHeight + 1,
  }));
  ok(layout.largura === 1920 && layout.altura === 1000, "app ocupa a viewport inteira");
  ok(!layout.bodyRola, "body não tem scroll próprio");
  await page.screenshot({ path: "screenshot-desktop.png" });

  console.log("— sticky header —");
  const sticky = await page.evaluate(() => {
    const wrap = document.querySelector(".table-wrap");
    wrap.scrollTop = wrap.scrollHeight;
    const th = document.querySelector("thead th").getBoundingClientRect();
    const w = wrap.getBoundingClientRect();
    return wrap.scrollTop > 0 && Math.abs(th.top - w.top) < 2;
  });
  ok(sticky, "cabeçalho das colunas segue visível com a tabela rolada");
  await page.evaluate(() => { document.querySelector(".table-wrap").scrollTop = 0; });

  console.log("— alerta de atraso —");
  ok(await page.locator("td.data.atraso").count() > 0, "pedidos enviados há mais de 7 dias aparecem destacados");

  console.log("— link do insumo —");
  ok(await page.locator("#corpo a.lnk").count() > 0, "itens com link mostram o ícone ao lado da descrição");
  ok((await page.getAttribute('tr[data-id="i0"] a.lnk', "href")) === "https://fornecedor.exemplo.com/produto/1", "ícone aponta para o link cadastrado");
  await page.click('[data-editar="i0"]');
  await page.waitForSelector("#dlgForm[open]");
  ok((await page.inputValue("#fLink")) === "https://fornecedor.exemplo.com/produto/1", "formulário carrega o link existente");
  await page.fill("#fLink", "fornecedor.com/novo-produto");
  await page.click("#btnSalvar");
  await ate(page, async () => {
    const p = estado.posts.flat().filter(r => r.id === "i0").pop();
    return p && p.link === "https://fornecedor.com/novo-produto";
  }, "salvou o link normalizado com https://");
  await page.waitForFunction(() => !document.querySelector("#dlgForm").open);

  console.log("— troca de situação + desfazer —");
  const id1 = await page.evaluate(() => document.querySelector("select.sel-sit.pedir").dataset.sit);
  await page.selectOption(`select[data-sit="${id1}"]`, "Entregue");
  await ate(page, async () => {
    const p = estado.posts.flat().filter(r => r.id === id1 && r.situacao !== undefined).pop();
    return p && p.situacao === "Entregue" && p.data_entrega;
  }, "gravou Entregue com data de entrega de hoje");
  await page.waitForSelector(".toast button");
  await page.click(".toast button"); // Desfazer
  await ate(page, async () => (await page.inputValue(`select[data-sit="${id1}"]`)) === "A Pedir", "desfazer restaurou a situação anterior");
  const desfeito = estado.posts.flat().filter(r => r.id === id1).pop();
  ok(desfeito.situacao === "A Pedir" && !desfeito.data_entrega, "desfazer gravou o estado antigo no servidor");
  await page.waitForSelector(".toast", { state: "detached", timeout: 10000 }).catch(() => page.evaluate(() => document.querySelectorAll(".toast").forEach(t => t.remove())));

  console.log("— ação em lote —");
  const ids2 = await page.evaluate(() => [...document.querySelectorAll("select.sel-sit.pedir")].slice(0, 3).map(s => s.dataset.sit));
  for(const id of ids2) await page.check(`input[data-sel="${id}"]`);
  ok(!(await page.locator("#loteSit").isDisabled()), "botão de lote habilita com itens selecionados");
  await page.selectOption("#loteSit", "Pedido Enviado");
  await ate(page, async () => {
    const cls = await Promise.all(ids2.map(id => page.getAttribute(`select[data-sit="${id}"]`, "class")));
    return cls.every(c => c.includes("enviado"));
  }, "3 itens marcados como Pedido Enviado de uma vez");
  const lote = estado.posts.at(-1);
  ok(Array.isArray(lote) && lote.length === 3 && lote.every(r => r.situacao === "Pedido Enviado" && r.data_pedido), "gravação em lote única com as datas corretas");
  await page.evaluate(() => document.querySelectorAll(".toast").forEach(t => t.remove()));

  console.log("— filtro por situação no rodapé —");
  await page.click('[data-fsit="A Pedir"]');
  const soAPedir = await page.evaluate(() => {
    const sels = [...document.querySelectorAll("#corpo select.sel-sit")];
    return sels.length > 0 && sels.every(s => s.value === "A Pedir");
  });
  ok(soAPedir, "clicar no contador filtra só os itens A Pedir");
  const nFiltrado = await page.locator("#corpo tr").count();
  await page.click('[data-fsit="A Pedir"]');
  ok(await page.locator("#corpo tr").count() > nFiltrado, "clicar de novo remove o filtro");
  await page.screenshot({ path: "screenshot-final.png" });

  console.log("— conflito de edição —");
  estado.conflito = true;
  const id3 = await page.evaluate(() => document.querySelector("select.sel-sit.pedir").dataset.sit);
  const postsAntes = estado.posts.flat().filter(r => r.id === id3).length;
  await page.selectOption(`select[data-sit="${id3}"]`, "Entregue");
  await ate(page, () => page.locator(".toast.erro").count().then(n => n > 0), "toast de conflito apareceu");
  const txtConflito = await page.locator(".toast.erro span").first().textContent();
  ok(/outra pessoa/.test(txtConflito), "aviso explica que outra pessoa alterou o item");
  ok(estado.posts.flat().filter(r => r.id === id3).length === postsAntes, "nada foi sobrescrito no servidor");
  await ate(page, async () => (await page.inputValue(`select[data-sit="${id3}"]`)) === "A Pedir", "tabela recarregada com o estado do servidor");
  estado.conflito = false;

  console.log("— mobile —");
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pageM = await prepararPagina(mobile);
  const cartoes = await pageM.evaluate(() => ({
    theadOculto: getComputedStyle(document.querySelector("#tabela thead")).display === "none",
    linhaEmGrid: getComputedStyle(document.querySelector("#corpo tr")).display === "grid",
    semScrollLateral: document.querySelector(".table-wrap").scrollWidth <= document.querySelector(".table-wrap").clientWidth + 1,
  }));
  ok(cartoes.theadOculto && cartoes.linhaEmGrid, "em telas estreitas a tabela vira cartões");
  ok(cartoes.semScrollLateral, "sem scroll horizontal no celular");
  await pageM.screenshot({ path: "screenshot-mobile.png" });

  await browser.close();
  console.log(falhas ? `\n${falhas} teste(s) FALHARAM` : "\nTodos os testes passaram.");
  process.exit(falhas ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });
