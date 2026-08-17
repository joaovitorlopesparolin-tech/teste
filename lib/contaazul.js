/**
 * Conta Azul — conexão com a API oficial (v2).
 *
 * Endereços oficiais, conferidos na documentação pública da Conta Azul:
 *   autorização : https://auth.contaazul.com/oauth2/authorize
 *   token       : https://auth.contaazul.com/oauth2/token
 *   dados da API: https://api-v2.contaazul.com
 *
 * O fluxo é o OAuth 2.0 Authorization Code. O endereço de retorno pode ser
 * localhost, e é isso que permite conectar direto do computador da oficina,
 * sem precisar do sistema publicado na internet.
 *
 * O client_secret e os tokens ficam gravados SÓ no servidor (data/db.json) e
 * nunca são enviados ao navegador — mesmo padrão da chave do assistente.
 */
'use strict';

const crypto = require('crypto');
const db = require('./db');
const http = require('./http');

const AUTORIZAR = 'https://auth.contaazul.com/oauth2/authorize';
const TOKEN = 'https://auth.contaazul.com/oauth2/token';
const USERINFO = 'https://auth.contaazul.com/oauth2/userInfo';
const API = 'https://api-v2.contaazul.com';

/* Escopo padrão da Conta Azul (a autenticação deles roda sobre Cognito). */
const ESCOPO = 'openid profile aws.cognito.signin.user.admin';

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
  const q = new URLSearchParams({
    client_id: c.clientId,
    redirect_uri: c.redirectUri,
    response_type: 'code',
    scope: ESCOPO,
    state: novoState()
  });
  return `${AUTORIZAR}?${q.toString()}`;
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

/** Troca o código que voltou na autorização pelos tokens de acesso. */
async function trocarCodigo(code) {
  const c = config();
  const r = await http.request(TOKEN, {
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
  const r = await http.request(TOKEN, {
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

/** Devolve um token válido, renovando sozinho quando está perto de vencer. */
async function tokenValido() {
  const c = config();
  if (!c.refreshToken) throw new Error('A Conta Azul não está conectada. Conecte em Administração → Configurações.');
  if (c.accessToken && c.expiraEm && Date.now() < c.expiraEm - FOLGA_MS) return c.accessToken;
  return renovar();
}

function desconectar() {
  const c = config();
  c.accessToken = '';
  c.refreshToken = '';
  c.expiraEm = 0;
  c.conectadoEm = '';
  c.conta = null;
  c.ultimoErro = '';
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
async function chamar(caminho, { method = 'GET', json, base = API } = {}) {
  const url = base + (caminho.startsWith('/') ? caminho : '/' + caminho);

  const uma = async (token) => http.request(url, {
    method, json,
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
    contexto: 'a Conta Azul'
  });

  let r = await uma(await tokenValido());
  if (r.status === 401) r = await uma(await renovar());

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
  const r = await chamar('', { base: USERINFO });
  if (r.status !== 200) {
    throw new Error(`A Conta Azul respondeu ${r.status} ao identificar a conta. ${String(r.text || '').slice(0, 200)}`);
  }
  return r.json || {};
}

/** Resumo seguro para a tela: nunca inclui secret nem tokens. */
function status() {
  const c = config();
  return {
    configurado: configurado(),
    conectado: conectado(),
    clientIdMascarado: c.clientId ? '••••' + String(c.clientId).slice(-4) : '',
    temSecret: !!c.clientSecret,
    redirectUri: c.redirectUri || '',
    conectadoEm: c.conectadoEm || null,
    conta: c.conta || null,
    ultimoErro: c.ultimoErro || ''
  };
}

module.exports = {
  API, ESCOPO,
  config, configurado, conectado, status,
  urlAutorizacao, consumirState, trocarCodigo, renovar, tokenValido,
  chamar, quemSou, desconectar
};
