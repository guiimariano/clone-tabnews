// GERADO por financas-casal/scripts/sync-webhook.mjs — não edite aqui.
// A fonte e os testes ficam no projeto privado financas-casal.
// Sincroniza as contas Pluggy para public.lancamentos.
//
// Regras de cada modo em supabase/migrations/0022_pluggy_sync.sql. Resumo:
//   cartao   -> compras, competência = mês anterior ao vencimento; pendentes
//               são atualizadas e as que somem da Pluggy são removidas
//   corrente -> extrato a partir de importar_desde; postado não muda
//   saldo    -> saldo do cartão vira previsão de fatura (sem uso desde a
//               0028: o Santander também é `cartao`)
//
// Idempotente: origem 'pluggy' + origem_ref 'pluggy:<id da transação>',
// com unique (origem, origem_ref). Rodar duas vezes não duplica.
//
// `api` é injetável (testes): { item, contas, transacoes, faturas }.
import { q as qPadrao } from './pg.js';
import * as pluggyPadrao from './pluggy.js';

// Pluggy escreve "PIX ENVIADO   guilherme mariano da silv"; as regras
// foram feitas sobre o CSV ("Pix enviado Guilherme Mariano Da"). Sem
// colapsar espaços, 'pix enviado guilherme' nunca casa e a separação por
// valor (fatura x apartamento x trocado) quebra em silêncio.
export const normalizar = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

// Compra em dólar vem com amount = 10 (USD) e amountInAccountCurrency =
// 54,97 (o que a fatura cobra). Sem isto a Midjourney entrava por R$ 10.
const emReais = (t) => Math.abs(Number(t.amountInAccountCurrency ?? t.amount));

const mesIso = (ym) => `${ym.slice(0, 7)}-01`;
function mesAnterior(ym) {
  const [a, m] = ym.slice(0, 7).split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 2, 1));
  return d.toISOString().slice(0, 10);
}
function mesSeguinte(ym) {
  const [a, m] = ym.slice(0, 7).split('-').map(Number);
  return new Date(Date.UTC(a, m, 1)).toISOString().slice(0, 10);
}
// Coluna `date` volta do driver como Date (meia-noite LOCAL), e String()
// dela dá "Tue Dec 01 ..." — comparar isso com "2026-12-01" falha calado.
const dia = (x) => {
  if (x instanceof Date) {
    const p = (n) => String(n).padStart(2, '0');
    return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
  }
  return String(x).slice(0, 10);
};

// Descobre contas novas dos itens ativos e propõe um modo pelo tipo e
// banco. Só insere: o modo de uma conta já cadastrada nunca é trocado.
async function descobrir({ q, api }) {
  const itens = (await q(`select item_id from public.pluggy_items where ativo`)).rows;
  const novas = [];
  for (const { item_id } of itens) {
    const cs = await api.contas(item_id);
    // O banco sai da conexão, não de cada conta: o cartão Bradesco se
    // chama só "VISA INFINITE". Cada conexão MeuPluggy é de um banco só.
    const nomes = cs.map((c) => c.name).join(' ');
    const banco = /bradesco/i.test(nomes) ? 'bradesco' : /santander/i.test(nomes) ? 'santander' : null;
    for (const c of cs) {
      let slug = null, modo = 'ignorar', desde = null, padrao = null;
      if (c.type === 'CREDIT' && banco === 'bradesco') { slug = 'bradesco_cartao'; modo = 'cartao'; desde = '2026-12-01'; }
      if (c.type === 'CREDIT' && banco === 'santander') { slug = 'santander_cartao'; modo = 'cartao'; padrao = 'lazer'; }
      if (c.subtype === 'CHECKING_ACCOUNT' && banco === 'santander') { slug = 'santander_cc'; modo = 'corrente'; desde = '2026-11-25'; }
      if (c.subtype === 'CHECKING_ACCOUNT' && banco === 'bradesco') { slug = 'outra_conta'; }
      const r = await q(
        `insert into public.pluggy_contas (account_id, item_id, conta_id, modo, importar_desde, nome, tipo, subtipo,
                                           categoria_padrao)
         select $1, $2, (select id from public.contas where slug = $3), $4, $5, $6, $7, $8,
                (select id from public.categorias where slug = $9)
         on conflict (account_id) do nothing`,
        [c.id, item_id, slug, modo, desde, normalizar(c.name), c.type, c.subtype, padrao]);
      if (r.rowCount) novas.push({ nome: normalizar(c.name), modo });
      // retrato da conta, para o dashboard (0025)
      const cd = c.creditData ?? {};
      await q(
        `update public.pluggy_contas
            set saldo = $2, limite = $3, limite_livre = $4, vencimento = $5, saldo_em = now(),
                nome = $6
          where account_id = $1`,
        [c.id, c.balance ?? null, cd.creditLimit ?? null, cd.availableCreditLimit ?? null,
         cd.balanceDueDate ? dia(cd.balanceDueDate) : null, normalizar(c.name)]);
    }
  }
  return novas;
}

// Classifica em LOTE: uma ida ao banco por conta. Uma por transação são
// ~1.500 idas num ano de histórico, e o pooler derruba a conexão no meio.
async function classificarLote(q, itens) {
  if (!itens.length) return [];
  const r = await q(
    `select x.ord, c.categoria_id, c.ignorar, c.tipo_lancamento, c.chave
       from unnest($1::text[], $2::numeric[]) with ordinality as x(descr, valor, ord)
       left join lateral public.classificar(x.descr, x.valor) c on true
      order by x.ord`,
    [itens.map((i) => i.desc), itens.map((i) => i.valor)]);
  const porOrd = new Map(r.rows.map((row) => [Number(row.ord), row]));
  return itens.map((_, i) => porOrd.get(i + 1) ?? {});
}

// Grava linhas em lotes via jsonb_to_recordset. `conflito` é o trecho
// "on conflict ..." de cada modo.
async function gravarLote(q, linhas, conflito) {
  let novas = 0, atualizadas = 0;
  for (let i = 0; i < linhas.length; i += 300) {
    const bloco = linhas.slice(i, i + 300);
    const r = await q(
      `insert into public.lancamentos (data_compra, mes_ref, fatura_mes, valor, tipo, categoria_id,
                                       descricao, conta_id, origem, origem_ref, texto_original,
                                       parcela_num, parcela_total, conciliado)
       select x.data, coalesce(x.mes_ref, date_trunc('month', x.data::timestamp)::date), x.fatura_mes,
              x.valor, x.tipo, x.categoria_id, x.descricao, x.conta_id, 'pluggy', x.ref, x.texto,
              coalesce(x.parcela_num, 1), coalesce(x.parcela_total, 1), x.conciliado
         from jsonb_to_recordset($1::jsonb) as x(
              data date, mes_ref date, fatura_mes date, valor numeric, tipo text, categoria_id smallint,
              descricao text, conta_id smallint, ref text, texto text, parcela_num smallint,
              parcela_total smallint, conciliado boolean)
       ${conflito}
       returning (xmax = 0) as nova`,
      [JSON.stringify(bloco)]);
    for (const row of r.rows) if (row.nova) novas++; else atualizadas++;
  }
  return { novas, atualizadas };
}

// ------------------------------------------------------------- cartão
async function syncCartao({ q, api, conta, gravar }) {
  const faturas = await api.faturas(conta.account_id);
  const vencePor = Object.fromEntries(faturas.map((f) => [f.id, dia(f.dueDate)]));
  const corte = conta.importar_desde ? dia(conta.importar_desde) : '0000-01-01';
  // Fatura aberta vence depois da última fechada. O Santander manda o
  // billForecastDate um mês atrás (compra de 11/11 com "2026-11", fatura
  // que vence em 10/12): sem isto ela cairia na fatura já paga.
  const ultimaFechada = faturas.map((f) => mesIso(dia(f.dueDate))).sort().at(-1);
  const aberta = (previsto) => {
    const m = mesIso(previsto);
    return ultimaFechada && m <= ultimaFechada ? mesSeguinte(ultimaFechada) : m;
  };

  const brutas = [];
  for (const t of await api.transacoes(conta.account_id)) {
    if (t.type !== 'DEBIT') continue; // crédito = pagamento ou estorno; o CSV também ignora
    const md = t.creditCardMetadata ?? {};
    const vence = md.billId ? vencePor[md.billId] : md.billForecastDate && aberta(md.billForecastDate);
    if (!vence) continue;
    const venceMes = mesIso(vence);
    if (venceMes < corte) continue;
    brutas.push({ t, md, venceMes, desc: normalizar(t.description), valor: emReais(t) });
  }
  const cls = await classificarLote(q, brutas);

  const linhas = [];
  brutas.forEach(({ t, md, venceMes, desc, valor }, i) => {
    const c = cls[i];
    if (c.ignorar) return;
    linhas.push({
      ref: `pluggy:${t.id}`,
      data: dia(md.purchaseDate ?? t.date),
      mes_ref: mesAnterior(venceMes),
      fatura_mes: venceMes,
      valor,
      tipo: c.tipo_lancamento ?? 'saida',
      // sem regra: categoria padrão da conta (Santander = Lazer, 0029)
      categoria_id: c.tipo_lancamento === 'transferencia' ? null : c.categoria_id ?? conta.categoria_padrao ?? null,
      descricao: desc,
      conta_id: conta.conta_id,
      texto: `${md.cardNumber ?? ''} ${desc}${c.chave ? ` [regra: ${c.chave}]` : ''}`.trim(),
      parcela_num: md.installmentNumber ?? 1,
      parcela_total: md.totalInstallments ?? 1,
      conciliado: t.status !== 'PENDING',
    });
  });

  const meses = [...new Set(linhas.map((l) => l.fatura_mes))];
  const res = { lidas: linhas.length, novas: 0, atualizadas: 0, removidas: 0,
                total: linhas.reduce((a, l) => a + l.valor, 0), meses };
  if (!gravar) return { ...res, linhas };

  // Pendente muda (valor, descrição, até o id) até a fatura fechar.
  // Categoria só é preenchida se ainda estiver vazia: uma correção feita
  // no painel ou no bot não é desfeita pela próxima sync.
  Object.assign(res, await gravarLote(q, linhas, `on conflict (origem, origem_ref) do update set
         data_compra = excluded.data_compra, mes_ref = excluded.mes_ref,
         fatura_mes = excluded.fatura_mes, valor = excluded.valor,
         descricao = excluded.descricao, texto_original = excluded.texto_original,
         parcela_num = excluded.parcela_num, parcela_total = excluded.parcela_total,
         conciliado = excluded.conciliado,
         categoria_id = coalesce(public.lancamentos.categoria_id, excluded.categoria_id)`));

  // O que sumiu da Pluggy nessas faturas (pendente que trocou de id ou
  // foi cancelada) sai daqui também — senão a fatura conta em dobro.
  if (meses.length) {
    const del = await q(
      `delete from public.lancamentos
        where origem = 'pluggy' and conta_id = $1 and fatura_mes = any($2::date[])
          and not (origem_ref = any($3::text[]))`,
      [conta.conta_id, meses, linhas.map((l) => l.ref)]);
    res.removidas = del.rowCount ?? 0;
  }
  return res;
}

// ------------------------------------------------------------ corrente
async function syncCorrente({ q, api, conta, gravar }) {
  const desde = conta.importar_desde ? dia(conta.importar_desde) : null;
  const brutas = [];
  for (const t of await api.transacoes(conta.account_id, { from: desde })) {
    if (t.status === 'PENDING') continue; // só o que o banco já postou
    const bruto = Number(t.amount);
    if (!bruto) continue;
    brutas.push({ t, bruto, desc: normalizar(t.description), valor: Math.abs(bruto) });
  }
  const cls = await classificarLote(q, brutas);

  const linhas = [];
  brutas.forEach(({ t, bruto, desc, valor }, i) => {
    const c = cls[i];
    if (c.ignorar) return;
    const tipo = c.tipo_lancamento ?? (bruto < 0 ? 'saida' : 'entrada');
    linhas.push({
      ref: `pluggy:${t.id}`, data: dia(t.date), valor, tipo, descricao: desc, conta_id: conta.conta_id,
      categoria_id: tipo === 'transferencia' ? null : c.categoria_id ?? null,
      texto: `${desc}${c.chave ? ` [regra: ${c.chave}]` : ''}`, conciliado: true,
    });
  });
  const res = { lidas: linhas.length, novas: 0, atualizadas: 0, removidas: 0,
                total: linhas.filter((l) => l.tipo === 'saida').reduce((a, l) => a + l.valor, 0) };
  if (!gravar) return { ...res, linhas };

  // do nothing no conflito: extrato postado não muda, e o pagamento do
  // cartão Santander é dividido por trigger (0019/0023) — atualizar por
  // cima desfaria a divisão.
  const g = await gravarLote(q, linhas, 'on conflict (origem, origem_ref) do nothing');
  res.novas = g.novas;
  return res;
}

// --------------------------------------------------------------- saldo
async function syncSaldo({ q, api, conta, gravar, hoje }) {
  const c = (await api.contas(conta.item_id)).find((x) => x.id === conta.account_id);
  const saldo = Number(c?.balance ?? 0);
  let vence = c?.creditData?.balanceDueDate ? dia(c.creditData.balanceDueDate) : null;
  // balanceDueDate é o vencimento da última fatura; já passou -> a aberta vence no mês seguinte
  if (vence && vence < hoje) {
    const [a, m, d] = vence.split('-').map(Number);
    vence = new Date(Date.UTC(a, m, d)).toISOString().slice(0, 10);
  }
  const res = { saldo, vence };
  if (gravar && vence && saldo > 0) {
    res.previsao = (await q(`select public.registrar_previsao_santander($1, $2) n`,
                            [mesIso(vence), saldo])).rows[0].n;
  }
  return res;
}

export async function sincronizar({ q = qPadrao, api, gravar = false, hoje, semCorte = false } = {}) {
  api = api ?? {
    contas: pluggyPadrao.contas,
    transacoes: pluggyPadrao.transacoes,
    faturas: pluggyPadrao.faturas,
  };
  hoje = hoje ?? new Date().toISOString().slice(0, 10);

  const descobertas = await descobrir({ q, api });
  const contas = (await q(
    `select pc.*, k.slug from public.pluggy_contas pc
       join public.pluggy_items pi on pi.item_id = pc.item_id and pi.ativo
       left join public.contas k on k.id = pc.conta_id
      where pc.modo <> 'ignorar' and pc.conta_id is not null
      order by pc.modo`)).rows;

  const resultado = [];
  for (const conta of contas) {
    const fn = { cartao: syncCartao, corrente: syncCorrente, saldo: syncSaldo }[conta.modo];
    const r = await fn({ q, api, conta: semCorte ? { ...conta, importar_desde: null } : conta, gravar, hoje });
    if (gravar) await q(`update public.pluggy_contas set ultima_sync = now() where account_id = $1`, [conta.account_id]);
    resultado.push({ conta: conta.slug, modo: conta.modo, ...r });
  }
  if (gravar) {
    await q(`select public.parear_pix_no_cartao()`); // 0029
    await q(`select public.atribuir_pagador()`);
    await q(`update public.pluggy_items set ultima_sync = now() where ativo`);
  }
  return { descobertas, contas: resultado };
}
