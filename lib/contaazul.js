/**
 * Conta Azul — conexão com a API oficial (v2).
 *
 * Endereços, conforme a documentação do portal de desenvolvedores:
 *   autorização : https://login.contaazul.com/#/oauth/authorize
 *   token       : https://auth.contaazul.com/oauth2/token
 *   dados da API: https://api-v2.contaazul.com
 *
 * Repare que a tela de autorização fica num servidor diferente do de token.
 *
 * O fluxo é o OAuth 2.0 Authorization Code. Há dois jeitos de concluí-lo:
 * se o endereço de retorno cadastrado apontar para este sistema, o retorno
 * é automático; se apontar para o site da Conta Azul (como no app de
 * desenvolvimento), o usuário copia o endereço da barra do navegador e cola
 * na tela — o código sai dali. Nos dois casos nada precisa estar publicado
 * na internet, porque as chamadas seguintes são todas de saída.
 *
 * O client_secret e os tokens ficam gravados SÓ no servidor (data/db.json) e
 * nunca são enviados ao navegador — mesmo padrão da chave do assistente.
 */
'use strict';

const crypto = require('crypto');
const db = require('./db');
const http = require('./http');

/* Endereços padrão. Todos podem ser trocados em Administração, porque a
   Conta Azul tem ambiente de desenvolvimento além do de produção, e porque
   o escopo aceito varia conforme o que a aplicação pediu no portal. */
const PADRAO = {
  /* A tela de autorização fica num servidor diferente do de token, e o
     caminho vem depois do "#" (a página deles é um aplicativo de uma página
     só). Por isso o endereço é guardado inteiro, e não montado por pedaços. */
  autorizarUrl: 'https://login.contaazul.com/#/oauth/authorize',
  authBase: 'https://auth.contaazul.com',
  apiBase: 'https://api-v2.contaazul.com',
  escopo: 'openid profile aws.cognito.signin.user.admin'
};

function enderecos() {
  const c = config();
  const authBase = (c.authBase || PADRAO.authBase).replace(/\/+$/, '');
  return {
    autorizar: c.autorizarUrl || PADRAO.autorizarUrl,
    token: `${authBase}/oauth2/token`,
    userinfo: `${authBase}/oauth2/userInfo`,
    api: (c.apiBase || PADRAO.apiBase).replace(/\/+$/, ''),
    escopo: c.escopo || PADRAO.escopo
  };
}

/* Renova o token um pouco antes de vencer, para nenhuma chamada pegar a virada. */
const FOLGA_MS = 60 * 1000;

function config() {
  const s = db.settings;
  if (!s.contaazul) { s.contaazul = {}; db.save(); }
  return s.contaazul;
}

function configurado() {
  const c = config();
  return !!(c.clientId && c.clientSecret && c.redirectUri);
}

function conectado() {
  return !!config().refreshToken;
}

/* ------------------------------------------------------------------ */
/* Autorização                                                         */
/* ------------------------------------------------------------------ */

/** Guarda um "state" de uso único: é ele que prova que o retorno é o nosso. */
const statesPendentes = new Map();
const STATE_VALIDADE_MS = 10 * 60 * 1000;

function novoState() {
  const s = crypto.randomBytes(16).toString('hex');
  statesPendentes.set(s, Date.now());
  for (const [k, t] of statesPendentes) {
    if (Date.now() - t > STATE_VALIDADE_MS) statesPendentes.delete(k);
  }
  return s;
}

function consumirState(s) {
  if (!s || !statesPendentes.has(s)) return false;
  const nascido = statesPendentes.get(s);
  statesPendentes.delete(s);
  return Date.now() - nascido <= STATE_VALIDADE_MS;
}

function urlAutorizacao() {
  const c = config();
  const e = enderecos();
  const q = new URLSearchParams({
    client_id: c.clientId,
    redirect_uri: c.redirectUri,
    response_type: 'code',
    scope: e.escopo,
    state: novoState()
  });
  return `${e.autorizar}?${q.toString()}`;
}

/**
 * O caminho do endereço de retorno cadastrado, para o servidor atender ali.
 * Assim o retorno funciona no endereço que estiver no portal da Conta Azul,
 * e não só no caminho padrão do sistema.
 */
function caminhoRetorno() {
  const uri = config().redirectUri;
  if (!uri) return '';
  try { return new URL(uri).pathname || ''; } catch (e) { return ''; }
}

/** Cabeçalho Basic exigido pelo endpoint de token. */
function basic() {
  const c = config();
  return 'Basic ' + Buffer.from(`${c.clientId}:${c.clientSecret}`).toString('base64');
}

function guardarTokens(resp) {
  const c = config();
  c.accessToken = resp.access_token;
  if (resp.refresh_token) c.refreshToken = resp.refresh_token;   // o refresh nem sempre volta na renovação
  c.expiraEm = Date.now() + (Number(resp.expires_in || 3600) * 1000);
  c.conectadoEm = c.conectadoEm || new Date().toISOString();
  c.ultimoErro = '';
  db.save();
}

function erroToken(r) {
  const d = (r.json && (r.json.error_description || r.json.error)) || r.text || '';
  if (r.status === 400 && /invalid_grant/i.test(d)) {
    return new Error('A Conta Azul recusou a autorização (invalid_grant). Isso costuma ser o endereço de retorno diferente do que está cadastrado no portal de desenvolvedores, ou um código já usado. Tente conectar de novo.');
  }
  if (r.status === 401) {
    return new Error('A Conta Azul recusou o Client ID / Client Secret. Confira os dois em portaldevs.contaazul.com.');
  }
  return new Error(`A Conta Azul respondeu ${r.status} ao gerar o token. ${String(d).slice(0, 300)}`);
}

/**
 * Extrai o código de autorização de um endereço colado inteiro.
 * Quando o app está cadastrado para voltar no site da Conta Azul (e não
 * aqui), o usuário cai numa página deles com "?code=…" na barra do
 * navegador — copiar o endereço todo é mais simples do que caçar o código.
 */
function codigoDe(texto) {
  const t = String(texto || '').trim();
  if (!t) return '';
  const m = t.match(/[?&#]code=([^&\s]+)/);
  if (m) return decodeURIComponent(m[1]);
  // Já veio só o código. São curtos — os da Conta Azul têm ~8 caracteres.
  return /^[\w-]{6,}$/.test(t) ? t : '';
}

/** Troca o código que voltou na autorização pelos tokens de acesso. */
async function trocarCodigo(code) {
  const c = config();
  const r = await http.request(enderecos().token, {
    method: 'POST',
    headers: { Authorization: basic() },
    form: {
      grant_type: 'authorization_code',
      code,
      client_id: c.clientId,
      redirect_uri: c.redirectUri
    },
    contexto: 'a Conta Azul'
  });
  if (r.status !== 200 || !r.json || !r.json.access_token) throw erroToken(r);
  guardarTokens(r.json);
  return true;
}

async function renovar() {
  const c = config();
  if (!c.refreshToken) throw new Error('A Conta Azul não está conectada.');
  const r = await http.request(enderecos().token, {
    method: 'POST',
    headers: { Authorization: basic() },
    form: {
      grant_type: 'refresh_token',
      refresh_token: c.refreshToken,
      client_id: c.clientId
    },
    contexto: 'a Conta Azul'
  });
  if (r.status !== 200 || !r.json || !r.json.access_token) {
    // Refresh recusado: a autorização caiu de vez, é preciso reconectar.
    c.ultimoErro = 'A autorização expirou. Conecte a Conta Azul novamente.';
    c.accessToken = '';
    c.refreshToken = '';
    db.save();
    throw erroToken(r);
  }
  guardarTokens(r.json);
  return c.accessToken;
}

/**
 * Guarda um token colado à mão — o que o portal da Conta Azul entrega uma
 * única vez ao criar o app de desenvolvimento. Serve para explorar a API da
 * conta de teste antes de a autorização completa estar funcionando.
 * Não vem com refresh: quando expira, é preciso gerar outro ou conectar.
 */
function tokenManual(token, minutos) {
  const c = config();
  c.accessToken = String(token || '').trim();
  c.expiraEm = Date.now() + (Number(minutos) || 55) * 60 * 1000;
  c.tokenManual = true;
  c.ultimoErro = '';
  db.save();
}

/** Devolve um token válido, renovando sozinho quando está perto de vencer. */
async function tokenValido() {
  const c = config();
  if (c.accessToken && c.expiraEm && Date.now() < c.expiraEm - FOLGA_MS) return c.accessToken;
  if (c.refreshToken) return renovar();
  if (c.tokenManual) {
    throw new Error('O token de teste colado à mão expirou. Gere outro no portal da Conta Azul, ou conclua a conexão pelo botão Conectar (aí a renovação passa a ser automática).');
  }
  throw new Error('A Conta Azul não está conectada. Conecte em Administração → Conta Azul.');
}

function desconectar() {
  const c = config();
  c.accessToken = '';
  c.refreshToken = '';
  c.expiraEm = 0;
  c.conectadoEm = '';
  c.conta = null;
  c.ultimoErro = '';
  c.tokenManual = false;
  db.save();
}

/* ------------------------------------------------------------------ */
/* Chamadas à API                                                      */
/* ------------------------------------------------------------------ */

/**
 * Uma chamada autenticada à API da Conta Azul.
 * Se o token for recusado, renova uma vez e repete — só uma, para um token
 * realmente inválido não virar laço infinito.
 */
async function chamar(caminho, { method = 'GET', json, base } = {}) {
  const raiz = base || enderecos().api;
  const url = raiz + (caminho.startsWith('/') ? caminho : '/' + caminho);

  const uma = async (token) => http.request(url, {
    method, json,
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
    contexto: 'a Conta Azul'
  });

  let r = await uma(await tokenValido());
  if (r.status === 401) {
    if (!config().refreshToken) {
      throw new Error('A Conta Azul recusou o token (401). Se é o token de teste colado à mão, ele expirou — gere outro no portal ou conclua a conexão pelo botão Conectar.');
    }
    r = await uma(await renovar());
  }

  if (r.status === 403) {
    throw new Error('A Conta Azul recusou o acesso (403). Normalmente é o plano da assinatura, que não libera este recurso da API, ou um escopo que a aplicação não pediu.');
  }
  if (r.status === 429) {
    throw new Error('A Conta Azul informou limite de chamadas atingido (429). Tente de novo em alguns minutos.');
  }
  return r;
}

/** Quem é a conta conectada — usa o userInfo padrão do OpenID. */
async function quemSou() {
  const r = await chamar('', { base: enderecos().userinfo });
  if (r.status !== 200) {
    throw new Error(`A Conta Azul respondeu ${r.status} ao identificar a conta. ${String(r.text || '').slice(0, 200)}`);
  }
  return r.json || {};
}

/** Resumo seguro para a tela: nunca inclui secret nem tokens. */
function status() {
  const c = config();
  const e = enderecos();
  return {
    configurado: configurado(),
    conectado: conectado(),
    clientIdMascarado: c.clientId ? '••••' + String(c.clientId).slice(-4) : '',
    temSecret: !!c.clientSecret,
    redirectUri: c.redirectUri || '',
    conectadoEm: c.conectadoEm || null,
    conta: c.conta || null,
    ultimoErro: c.ultimoErro || '',
    tokenManual: !!c.tokenManual,
    tokenExpiraEm: c.expiraEm || 0,
    temToken: !!c.accessToken,
    autorizarUrl: c.autorizarUrl || PADRAO.autorizarUrl,
    authBase: c.authBase || PADRAO.authBase,
    apiBase: c.apiBase || PADRAO.apiBase,
    escopo: e.escopo,
    padrao: PADRAO
  };
}

module.exports = {
  PADRAO, enderecos,
  config, configurado, conectado, status,
  urlAutorizacao, consumirState, trocarCodigo, codigoDe, renovar, tokenValido, caminhoRetorno, tokenManual,
  chamar, quemSou, desconectar
};
