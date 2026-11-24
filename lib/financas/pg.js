// GERADO por financas-casal/scripts/sync-webhook.mjs — não edite aqui.
// A fonte e os testes ficam no projeto privado financas-casal.
// Pool para ambiente serverless.
//
// Pool no escopo do módulo, não por invocação: o Fluid Compute reusa a
// instância entre requisições, então a conexão sobrevive e o cold start
// não paga handshake de novo. max:1 porque cada instância atende uma
// requisição por vez e o pooler do Supabase tem limite de conexões.
//
// Use a string do TRANSACTION pooler (porta 6543) em serverless — é a que
// aguenta muitas conexões curtas. A de sessão (5432) é para scripts.
import pg from 'pg';

let pool;

export function db() {
  if (!pool) {
    // FINANCAS_DATABASE_URL primeiro: no projeto do site, DATABASE_URL já
    // está ocupada pelo Postgres do tabnews. Aceitar as duas deixa este
    // arquivo idêntico nos dois lugares — e arquivo idêntico é o que
    // permite testar aqui e publicar lá sem divergir.
    const connectionString = process.env.FINANCAS_DATABASE_URL ?? process.env.DATABASE_URL;
    if (!connectionString) throw new Error('FINANCAS_DATABASE_URL ausente');
    pool = new pg.Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 1,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 8_000,
      statement_timeout: 8_000,
    });
  }
  return pool;
}

// Costura de teste: o teste de integração injeta o PGlite aqui e o webhook
// roda inteiro sem rede e sem tocar em produção. Em produção fica null e o
// caminho é o pool normal.
let executor = null;
export function setExecutor(fn) { executor = fn; }

export const q = (sql, params) => (executor ? executor(sql, params) : db().query(sql, params));

// "hoje" no fuso de São Paulo. A função roda em UTC na Vercel: sem isso,
// uma compra às 22h vira o dia seguinte.
export function hojeSP() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

export function mesRefSP(somaMeses = 0) {
  const [a, m] = hojeSP().split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1 + somaMeses, 1));
  return d.toISOString().slice(0, 10);
}

export const brl = (v) =>
  Number(v ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
