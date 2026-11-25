// GERADO por financas-casal/scripts/sync-webhook.mjs — não edite aqui.
// A fonte e os testes ficam no projeto privado financas-casal.
// Cliente mínimo da API da Pluggy (Open Finance).
//
// Credenciais SÓ por variável de ambiente: PLUGGY_CLIENT_ID e
// PLUGGY_CLIENT_SECRET. Nunca em código — este arquivo é sincronizado
// para um repositório público.
//
// Fluxo: client_id + secret -> apiKey (vale ~2h) -> connect token (vale
// ~30 min, é o que o widget no navegador recebe). O apiKey nunca sai do
// servidor: quem tem o apiKey lê todas as contas conectadas.
const BASE = 'https://api.pluggy.ai';

let cache = { apiKey: null, expira: 0 };

export function configurado() {
  return Boolean(process.env.PLUGGY_CLIENT_ID && process.env.PLUGGY_CLIENT_SECRET);
}

async function chamar(caminho, { metodo = 'GET', corpo, apiKey } = {}) {
  const r = await fetch(BASE + caminho, {
    method: metodo,
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      ...(apiKey ? { 'X-API-KEY': apiKey } : {}),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) {
    // Sem ecoar o corpo enviado: no /auth ele tem o secret.
    const e = new Error(`pluggy ${metodo} ${caminho} -> ${r.status}: ${json.message ?? 'erro'}`);
    e.status = r.status;
    throw e;
  }
  return json;
}

export async function apiKey(agora = Date.now()) {
  if (cache.apiKey && agora < cache.expira) return cache.apiKey;
  if (!configurado()) throw new Error('PLUGGY_CLIENT_ID / PLUGGY_CLIENT_SECRET ausentes');
  const { apiKey: k } = await chamar('/auth', {
    metodo: 'POST',
    corpo: { clientId: process.env.PLUGGY_CLIENT_ID, clientSecret: process.env.PLUGGY_CLIENT_SECRET },
  });
  // renova com folga: 1h30 em vez das 2h de validade
  cache = { apiKey: k, expira: agora + 90 * 60 * 1000 };
  return k;
}

export function limparCache() { cache = { apiKey: null, expira: 0 }; }

// Token de curta duração para o widget. Com itemId, reabre uma conexão
// existente (renovar consentimento) em vez de criar outra.
export async function connectToken(itemId) {
  const k = await apiKey();
  const { accessToken } = await chamar('/connect_token', {
    metodo: 'POST',
    apiKey: k,
    corpo: itemId ? { itemId } : {},
  });
  return accessToken;
}

// Lê o item do lado do servidor. O id vem do navegador; buscá-lo com o
// NOSSO apiKey é o que prova que ele pertence a esta conta Pluggy.
export async function item(itemId) {
  return chamar(`/items/${encodeURIComponent(itemId)}`, { apiKey: await apiKey() });
}

// Faturas FECHADAS de um cartão. A aberta não aparece aqui: as compras
// dela vêm sem billId e com creditCardMetadata.billForecastDate.
export async function faturas(accountId) {
  const r = await chamar(`/bills?accountId=${encodeURIComponent(accountId)}`, { apiKey: await apiKey() });
  return r.results ?? [];
}

export async function contas(itemId) {
  const r = await chamar(`/accounts?itemId=${encodeURIComponent(itemId)}`, { apiKey: await apiKey() });
  return r.results ?? [];
}

// Todas as transações de uma conta, seguindo o cursor da v2.
//
// A v1 (/transactions com page/from/to) responde 410 desde 2026. A v2 não
// aceita from/to/pageSize — devolve o histórico e um `next` para a
// próxima página. O filtro de data é feito aqui, depois.
export async function transacoes(accountId, { from, to } = {}) {
  const k = await apiKey();
  const todas = [];
  // `next` vem como query pronta: "?accountId=...&after=<cursor>".
  // Reaproveita-se a query inteira; só o accountId é conferido, para um
  // `next` estranho nunca trocar a conta lida.
  let query = new URLSearchParams({ accountId });
  for (let i = 0; i < 200; i++) {
    const r = await chamar(`/v2/transactions?${query}`, { apiKey: k });
    todas.push(...(r.results ?? []));
    if (!r.next) break;
    const prox = new URLSearchParams(String(r.next).replace(/^[^?]*\?/, ''));
    if (prox.get('accountId') !== accountId || !prox.get('after')) break;
    query = prox;
  }
  const dia = (x) => String(x.date).slice(0, 10);
  return todas.filter((x) => (!from || dia(x) >= from) && (!to || dia(x) <= to));
}
