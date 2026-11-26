// GERADO por financas-casal/scripts/sync-webhook.mjs — não edite aqui.
// A fonte e os testes ficam no projeto privado financas-casal.
// Consultas do painel: uma função por tela, cada uma em paralelo numa ida
// ao banco.
//
// Vive aqui (projeto privado) e é sincronizada para o site: testada aqui,
// executada lá.
//
// Convenções que atravessam tudo:
//   - mes_ref é COMPETÊNCIA. Cartão: mês anterior ao vencimento da fatura
//     (a que vence em 15/12 é "novembro"). Conta corrente: mês da data.
//   - "despesa" = tipo 'saida'; "receita" = 'entrada'. Transferência
//     (pagar a própria fatura, Pix entre contas do casal) não é nenhuma
//     das duas — contá-la dobraria o gasto do cartão.
import { q } from './pg.js';

// Link do painel no fim das mensagens do bot
export const PAINEL = 'https://guimariano.com.br/financas';
export const RODAPE = `🔗 Mais detalhes: ${PAINEL}`;

const num = (v) => (v === null || v === undefined ? null : Number(v));
const dia = (d) => {
  if (!d) return null;
  if (d instanceof Date) {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  return String(d).slice(0, 10);
};
const nums = (r, campos) => {
  const o = { ...r };
  for (const c of campos) o[c] = num(r[c]);
  return o;
};

export function mesValido(s) {
  return typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s) ? `${s}-01` : null;
}

async function mesAtual() {
  const r = await q(`select date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date as m,
                            extract(day from (now() at time zone 'America/Sao_Paulo'))::int as d,
                            extract(day from (date_trunc('month', (now() at time zone 'America/Sao_Paulo'))
                                    + interval '1 month - 1 day'))::int as dias`);
  return { mes: dia(r.rows[0].m), hoje: r.rows[0].d, diasMes: r.rows[0].dias };
}

// Categorias, contas e pessoas: o que filtros e selects precisam.
export async function cadastros() {
  const [cats, contas, pessoas, grupos] = await Promise.all([
    q(`select c.id, c.slug, c.nome, c.tipo, c.limite_padrao, g.slug as grupo, g.nome as grupo_nome
         from public.categorias c left join public.grupos g on g.id = c.grupo_id
        where c.ativo order by c.ordem, c.nome`),
    q(`select id, slug, nome, tipo from public.contas order by id`),
    q(`select id, apelido from public.usuarios order by apelido`),
    q(`select slug, nome, ordem, pct_ref from public.grupos order by ordem`),
  ]);
  return {
    categorias: cats.rows.map((r) => nums(r, ['limite_padrao'])),
    contas: contas.rows,
    pessoas: pessoas.rows,
    grupos: grupos.rows.map((r) => nums(r, ['pct_ref'])),
  };
}

// Dia do mês em que o gasto conta, para a curva acumulada. Compra de
// cartão de competência novembro pode ter data de outubro (parcela) ou de
// dezembro (até o fechamento): encosta no primeiro ou no último dia.
const DIA_NO_MES = `
  case when l.data_compra < l.mes_ref then 1
       when l.data_compra >= (l.mes_ref + interval '1 month')::date
         then extract(day from (l.mes_ref + interval '1 month - 1 day'))::int
       else extract(day from l.data_compra)::int end`;

/* ============================================================ dashboard */
export async function dashboard(mesPedido) {
  const atual = await mesAtual();
  const mes = mesPedido ?? atual.mes;

  const [totais, porCat, diario, plano, abertas, contas, recorr, ultimas, pend, ritmo] =
    await Promise.all([
      // 1. receita/despesa por mês, 13 meses até o escolhido
      q(`select mes_ref, tipo, sum(valor) as valor, count(*)::int as n
           from public.lancamentos
          where tipo in ('entrada', 'saida')
            and mes_ref between ($1::date - interval '12 months')::date and $1::date
          group by 1, 2 order by 1`, [mes]),

      // 2. despesa do mês por categoria
      q(`select coalesce(c.slug, '_sem') as slug, coalesce(c.nome, 'Sem categoria') as nome,
                g.slug as grupo, sum(l.valor) as valor, count(*)::int as n
           from public.lancamentos l
           left join public.categorias c on c.id = l.categoria_id
           left join public.grupos g on g.id = coalesce(l.grupo_id, c.grupo_id)
          where l.mes_ref = $1 and l.tipo = 'saida'
          group by 1, 2, 3 order by 4 desc`, [mes]),

      // 3. despesa por dia, do mês e dos 6 anteriores (para a mediana)
      q(`select l.mes_ref, ${DIA_NO_MES} as dia, sum(l.valor) as valor
           from public.lancamentos l
          where l.tipo = 'saida'
            and l.mes_ref between ($1::date - interval '6 months')::date and $1::date
          group by 1, 2 order by 1, 2`, [mes]),

      // 4. o plano do mês: renda - fixos - metas = disponível
      q(`select * from public.plano_mensal($1)`, [mes]),

      // 5. faturas que ainda não venceram + previsões
      q(`select case when l.origem_ref like 'previsao:santander%' then 'santander_cartao' else k.slug end as slug,
                case when l.origem_ref like 'previsao:santander%' then 'Cartão Santander' else k.nome end as nome,
                bool_or(l.origem_ref like 'previsao:%') as previsao,
                min(case when l.origem_ref like 'previsao:%' then l.data_compra
                         else (l.fatura_mes + (k.dia_vencimento - 1))::date end) as vence,
                count(*)::int as n, sum(l.valor) as valor
           from public.lancamentos l
           join public.contas k on k.id = l.conta_id
          where l.tipo = 'saida'
            and (l.origem_ref like 'previsao:%'
                 or (k.tipo = 'cartao_credito' and l.fatura_mes is not null and k.dia_vencimento is not null
                     and l.origem = 'pluggy'
                     and (l.fatura_mes + (k.dia_vencimento - 1))::date >= current_date))
          group by 1, 2 order by 4`),

      // 6. retrato das contas na Pluggy
      q(`select pc.nome, pc.tipo, pc.subtipo, pc.saldo, pc.limite, pc.limite_livre, pc.vencimento,
                pc.saldo_em, pc.modo, k.slug, k.nome as conta_nome
           from public.pluggy_contas pc left join public.contas k on k.id = pc.conta_id
          where not (pc.subtipo = 'SAVINGS_ACCOUNT' and coalesce(pc.saldo, 0) = 0)
          order by pc.tipo desc, pc.nome`),

      // 7. contas fixas do mês (recorrências) que ainda vencem
      q(`select r.nome, r.valor_previsto as valor, r.dia_vencimento as dia, c.nome as categoria
           from public.recorrencias r left join public.categorias c on c.id = r.categoria_id
          where r.ativo and r.tipo = 'saida'
          order by r.dia_vencimento`),

      // 8. últimas transações do mês
      q(`select l.id, l.data_compra, l.valor, l.tipo, l.descricao, c.nome as categoria,
                k.nome as conta, u.apelido as pessoa, l.conciliado
           from public.lancamentos l
           left join public.categorias c on c.id = l.categoria_id
           left join public.contas k on k.id = l.conta_id
           left join public.usuarios u on u.id = l.pagador_id
          where l.mes_ref = $1 and l.tipo <> 'transferencia'
          order by l.data_compra desc, l.created_at desc limit 8`, [mes]),

      // 9. sem categoria no mês
      q(`select count(*)::int as n, coalesce(sum(valor), 0) as valor
           from public.lancamentos where mes_ref = $1 and tipo = 'saida' and categoria_id is null`, [mes]),

      // 10. ritmo: só categorias com teto (as variáveis)
      q(`select coalesce(sum(o.gasto), 0) as gasto, coalesce(sum(o.limite), 0) as limite
           from public.orcamento($1) o where o.limite > 0`, [mes]),
    ]);

  // mediana por dia, acumulada, dos meses ANTERIORES ao escolhido
  const meses = [...new Set(diario.rows.map((r) => dia(r.mes_ref)))].sort();
  const anteriores = meses.filter((m) => m < mes);
  const acumulado = (m) => {
    const porDia = Array(32).fill(0);
    for (const r of diario.rows) if (dia(r.mes_ref) === m) porDia[r.dia] += Number(r.valor);
    let s = 0;
    return porDia.slice(1).map((v) => (s += v));
  };
  const curvaMes = acumulado(mes);
  const curvasAnt = anteriores.map(acumulado);
  const mediana = (xs) => {
    const o = [...xs].sort((a, b) => a - b);
    if (!o.length) return null;
    const m = Math.floor(o.length / 2);
    return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
  };
  const curva = curvaMes.map((v, i) => ({
    dia: i + 1,
    mes: v,
    mediana: mediana(curvasAnt.map((c) => c[i])),
    min: curvasAnt.length ? Math.min(...curvasAnt.map((c) => c[i])) : null,
    max: curvasAnt.length ? Math.max(...curvasAnt.map((c) => c[i])) : null,
  }));

  return {
    geradoEm: new Date().toISOString(),
    mes, mesAtual: atual.mes, hoje: atual.hoje, diasMes: atual.diasMes,
    totais: totais.rows.map((r) => ({ ...r, mes_ref: dia(r.mes_ref), valor: num(r.valor) })),
    porCategoria: porCat.rows.map((r) => nums(r, ['valor'])),
    curva, mesesBase: anteriores,
    plano: Object.fromEntries(Object.entries(plano.rows[0] ?? {})
      .map(([k, v]) => [k, k === 'mes_ref' ? dia(v) : num(v)])),
    abertas: abertas.rows.map((r) => ({ ...r, valor: num(r.valor), vence: dia(r.vence) })),
    contas: contas.rows.map((r) => ({ ...nums(r, ['saldo', 'limite', 'limite_livre']),
                                      vencimento: dia(r.vencimento),
                                      saldo_em: r.saldo_em ? new Date(r.saldo_em).toISOString() : null })),
    recorrencias: recorr.rows.map((r) => nums(r, ['valor'])),
    ultimas: ultimas.rows.map((r) => ({ ...nums(r, ['valor']), data_compra: dia(r.data_compra) })),
    pendentes: { n: pend.rows[0].n, valor: num(pend.rows[0].valor) },
    ritmo: nums(ritmo.rows[0], ['gasto', 'limite']),
    caixa: await previsaoCaixa(),
  };
}

/* ====================================================== saldo da Caixa */
// A Caixa só existe para pagar a parcela do apartamento: recebe Pix e
// debita a prestação (dia 23) e a cesta de serviços (dia 10). Sem saldo,
// entra no cheque especial e cobra juros + IOF (aconteceu em fev, mai e
// ago de 2026). Esta conta diz quanto falta ANTES do próximo débito.
//
// Débitos previstos = recorrências ativas da conta com `padrao` (0031).
// Já debitada no mês corrente -> a próxima é no mês seguinte. Valor =
// o maior entre o previsto e o último debitado (a prestação sobe ~R$ 2
// por mês). `hoje` é injetável para os testes.
export async function previsaoCaixa(hoje) {
  const [s, r] = await Promise.all([
    q(`select pc.saldo, pc.saldo_em from public.pluggy_contas pc
         join public.contas k on k.id = pc.conta_id where k.slug = 'caixa_cc' limit 1`),
    q(`select r.nome, r.dia_vencimento as dia,
              greatest(r.valor_previsto, coalesce((
                select l.valor from public.lancamentos l
                 where l.conta_id = r.conta_id and l.tipo = 'saida'
                   and lower(l.descricao) like '%' || r.padrao || '%'
                 order by l.data_compra desc limit 1), 0)) as valor,
              exists (select 1 from public.lancamentos l
                       where l.conta_id = r.conta_id and lower(l.descricao) like '%' || r.padrao || '%'
                         and date_trunc('month', l.data_compra) = date_trunc('month', $1::date)) as pago
         from public.recorrencias r join public.contas k on k.id = r.conta_id
        where k.slug = 'caixa_cc' and r.ativo and r.tipo = 'saida' and r.padrao is not null`,
      [hoje ?? new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })]),
  ]);
  if (!s.rows.length || s.rows[0].saldo === null) return null;
  const base = hoje ?? new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  const [a, m] = base.split('-').map(Number);
  const data = (mesDesloc, d) => {
    const ult = new Date(Date.UTC(a, m - 1 + mesDesloc + 1, 0)).getUTCDate();
    return new Date(Date.UTC(a, m - 1 + mesDesloc, Math.min(d, ult))).toISOString().slice(0, 10);
  };
  const saldo = num(s.rows[0].saldo);
  let corre = saldo, falta = 0, negativoEm = null;
  const proximos = r.rows
    .map((x) => ({ nome: x.nome, valor: num(x.valor), data: data(x.pago ? 1 : 0, x.dia) }))
    .sort((x, y) => x.data.localeCompare(y.data))
    .map((x) => {
      corre = Math.round((corre - x.valor) * 100) / 100;
      if (corre < 0 && !negativoEm) negativoEm = x.data;
      falta = Math.max(falta, -corre);
      return { ...x, saldoDepois: corre };
    });
  // Uma transferência por débito sem saldo, cada uma até a data dele:
  // R$ 20 até o dia 10 (tarifa) e o resto até o dia 23 (parcela), em vez
  // de tudo antes do primeiro. Valores redondos (múltiplos de 10).
  const etapas = [];
  let coberto = saldo;
  for (const x of proximos) {
    coberto = Math.round((coberto - x.valor) * 100) / 100;
    if (coberto < 0) {
      const v = Math.ceil(-coberto / 10) * 10;
      etapas.push({ ate: x.data, valor: v, nome: x.nome });
      coberto = Math.round((coberto + v) * 100) / 100;
    }
  }
  return {
    saldo, saldo_em: s.rows[0].saldo_em ? new Date(s.rows[0].saldo_em).toISOString() : null,
    proximos, negativoEm, etapas,
    falta: Math.round(falta * 100) / 100,
    transferir: etapas.reduce((t, e) => t + e.valor, 0),
  };
}

// Texto do bot e do aviso diário (HTML do Telegram).
const reais = (v) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ddmm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
export function textoCaixa(c) {
  if (!c) return 'A conta Caixa ainda não foi sincronizada.';
  const linhas = c.proximos.map((x) =>
    `${ddmm(x.data)} ${x.nome}: R$ ${reais(x.valor)} → fica R$ ${reais(x.saldoDepois)}${x.saldoDepois < 0 ? ' ⚠️' : ''}`);
  return `🏠 <b>Caixa (apartamento)</b>: saldo R$ ${reais(c.saldo)}\n\n${linhas.join('\n')}\n\n` +
    (c.etapas?.length
      ? `Para não entrar no cheque especial:\n${linhasEtapas(c)}`
      : '✅ O saldo cobre os próximos débitos.') + `\n\n${RODAPE}`;
}
const linhasEtapas = (c) => c.etapas.map((e) =>
  `• transfira <b>R$ ${reais(e.valor)}</b> até ${ddmm(e.ate)} (${e.nome.replace(/ Caixa$/, '').toLowerCase()})`).join('\n');

// Avisar quando uma transferência está a até 5 dias (ou já passou).
export function precisaAvisarCaixa(c, hoje, dias = 5) {
  return !!c?.etapas?.some((e) => Date.parse(e.ate) - Date.parse(hoje) <= dias * 86400000);
}

/* ===================================================== agenda de contas */
// O que vence nos próximos dias, de três fontes (0032):
//   💳 fatura de cartão: soma das compras da fatura (fatura_mes) e o dia de
//      vencimento da conta; antes do fechamento ainda pode crescer;
//   🔁 conta fixa: recorrência ativa fora do cartão (o que é cobrado no
//      cartão já está na fatura). Com `padrao`, sabe se já foi paga;
//   🧾 boleto avulso: contas_a_pagar, lançado pelo bot.
// E projeta o saldo do Santander, de onde sai quase tudo: saldo de hoje +
// salários previstos - o que vence, em ordem de data. Assim o aviso diz
// "fica negativo em 10/12" antes de acontecer.
const isoMais = (iso, n) => new Date(Date.parse(iso) + n * 86400000).toISOString().slice(0, 10);
const noMes = (a, m0, d) => {
  const ult = new Date(Date.UTC(a, m0 + 1, 0)).getUTCDate();
  return new Date(Date.UTC(a, m0, Math.min(d, ult))).toISOString().slice(0, 10);
};
const diasEntre = (de, ate) => Math.round((Date.parse(ate) - Date.parse(de)) / 86400000);
const hojeIso = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

export async function agenda(hoje, dias = 30) {
  hoje = hoje ?? hojeIso();
  const ate = isoMais(hoje, dias);
  const [fat, rec, bol, santander, caixa] = await Promise.all([
    q(`select k.slug, k.nome, k.dia_vencimento, k.dia_fechamento, pk.slug as paga_por,
              (l.fatura_mes + (k.dia_vencimento - 1))::date::text as vence,
              count(*)::int as n, sum(l.valor) as valor
         from public.lancamentos l
         join public.contas k on k.id = l.conta_id
         left join public.contas pk on pk.id = k.paga_por
        where l.tipo = 'saida' and l.origem = 'pluggy' and l.fatura_mes is not null
          and k.tipo = 'cartao_credito' and k.dia_vencimento is not null
          and (l.fatura_mes + (k.dia_vencimento - 1))::date between $1::date and $2::date
        group by 1, 2, 3, 4, 5, 6 order by 6`, [hoje, ate]),
    q(`select r.id, r.nome, r.tipo, r.dia_vencimento as dia, r.valor_previsto, r.padrao, k.slug as conta,
              (select coalesce(json_agg(json_build_object('data', l.data_compra::text, 'valor', l.valor,
                                                          'descricao', l.descricao)
                                        order by l.data_compra desc), '[]')
                 from public.lancamentos l
                where r.padrao is not null and l.conta_id = r.conta_id
                  and lower(l.descricao) like '%' || r.padrao || '%'
                  and l.data_compra >= $1::date - 75) as pagos
         from public.recorrencias r
         join public.contas k on k.id = r.conta_id
        where r.ativo and k.tipo <> 'cartao_credito'`, [hoje]),
    q(`select b.id, b.descricao, b.valor, b.vencimento::text as vencimento, k.slug as conta
         from public.contas_a_pagar b left join public.contas k on k.id = b.conta_id
        where b.pago_em is null and b.vencimento <= $1::date
        order by b.vencimento, b.id`, [ate]),
    q(`select pc.saldo from public.pluggy_contas pc join public.contas k on k.id = pc.conta_id
        where k.slug = 'santander_cc' limit 1`),
    previsaoCaixa(hoje),
  ]);

  const itens = [];
  const [a, m] = hoje.split('-').map(Number);

  for (const f of fat.rows) {
    const vence = dia(f.vence);
    // fecha no mesmo mês do vencimento se o dia for anterior; senão no mês anterior
    const [va, vm] = vence.split('-').map(Number);
    const fecha = f.dia_fechamento
      ? noMes(va, vm - 1 - (f.dia_fechamento < f.dia_vencimento ? 0 : 1), f.dia_fechamento) : null;
    itens.push({ tipo: 'fatura', nome: `Fatura ${f.nome.replace(/^Cart[aã]o\s+/i, '')}`, valor: num(f.valor),
                 data: vence, conta: f.paga_por, fecha, aberta: !!fecha && fecha >= hoje, n: f.n });
  }

  const entradas = [];
  for (const r of rec.rows) {
    const pagos = (typeof r.pagos === 'string' ? JSON.parse(r.pagos) : r.pagos ?? [])
      .map((p) => ({ ...p, data: dia(p.data), valor: num(p.valor) }));
    // pago = débito reconhecido entre 15 dias antes e 10 depois da data
    const pago = (d) => pagos.some((p) => p.data >= isoMais(d, -15) && p.data <= isoMais(d, 10));
    const valor = pagos[0]?.valor ?? num(r.valor_previsto);
    for (const desloc of [-1, 0, 1, 2]) {
      const d = noMes(a, m - 1 + desloc, r.dia);
      if (d > ate) break;
      if (r.tipo === 'entrada') {
        // salário de hoje pode já estar no saldo: só conta o que vem depois
        if (d > hoje) entradas.push({ nome: r.nome, valor: num(r.valor_previsto), data: d, conta: r.conta });
        continue;
      }
      if (r.padrao && pago(d)) continue;
      // sem padrao não dá para saber se pagou: só o que ainda vai vencer
      const atrasada = d < hoje;
      if (atrasada && (!r.padrao || diasEntre(d, hoje) > 10)) continue;
      itens.push({ tipo: 'fixa', nome: r.nome, valor, data: d, conta: r.conta, atrasada,
                   estimado: !!r.padrao && pagos.some((p) => p.valor !== valor),
                   automatico: /^debito/i.test(pagos[0]?.descricao ?? '') });
    }
  }

  for (const b of bol.rows) {
    const d = dia(b.vencimento);
    itens.push({ tipo: 'boleto', id: b.id, nome: b.descricao, valor: num(b.valor), data: d,
                 conta: b.conta ?? 'santander_cc', atrasada: d < hoje });
  }
  itens.sort((x, y) => x.data.localeCompare(y.data) || x.nome.localeCompare(y.nome));

  // projeção do Santander: o que sai dele, mais o Pix que a Caixa precisa
  let proj = null;
  if (santander.rows.length && santander.rows[0].saldo !== null) {
    const saldo = num(santander.rows[0].saldo);
    const ent = entradas.filter((e) => e.conta === 'santander_cc').sort((x, y) => x.data.localeCompare(y.data));
    const mov = [
      ...itens.filter((i) => i.conta === 'santander_cc')
        .map((i) => ({ data: i.atrasada ? hoje : i.data, valor: -i.valor })),
      ...ent.map((e) => ({ data: e.data, valor: e.valor })),
    ];
    for (const e of caixa?.etapas ?? []) {
      const d = isoMais(e.ate, -1);
      mov.push({ data: d < hoje ? hoje : d, valor: -e.valor });
    }
    // no mesmo dia, o salário entra antes (cai de madrugada) e as contas saem depois
    mov.sort((x, y) => x.data.localeCompare(y.data) || y.valor - x.valor);
    let corre = saldo, menor = saldo, menorEm = hoje, negativoEm = saldo < 0 ? hoje : null;
    for (const x of mov) {
      corre = Math.round((corre + x.valor) * 100) / 100;
      if (corre < menor) { menor = corre; menorEm = x.data; }
      if (corre < 0 && !negativoEm) negativoEm = x.data;
    }
    proj = { saldo, menor, menorEm, negativoEm, falta: menor < 0 ? Math.round(-menor * 100) / 100 : 0, entradas: ent };
  }

  return { hoje, ate, itens, santander: proj, caixa };
}

const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
function quando(iso, hoje) {
  const n = diasEntre(hoje, iso);
  if (n === 0) return 'Hoje';
  if (n === 1) return 'Amanhã';
  return `${ddmm(iso)} (${SEMANA[new Date(iso + 'T12:00:00Z').getUTCDay()]})`;
}
const ICONE = { fatura: '💳', fixa: '🔁', boleto: '🧾' };
function linhaItem(i) {
  const extra = [];
  if (i.atrasada) extra.push(`venceu ${ddmm(i.data)}`);
  if (i.tipo === 'fatura' && i.aberta) extra.push(`fecha ${ddmm(i.fecha)}, ainda pode subir`);
  if (i.automatico) extra.push('débito automático: deixe saldo');
  if (i.conta === 'caixa_cc') extra.push('sai da Caixa');
  if (i.tipo === 'boleto') extra.push(`/paguei ${i.id}`);
  return `${ICONE[i.tipo]} ${esc(i.nome)}: ${i.estimado ? '~' : ''}R$ ${reais(i.valor)}` +
    (extra.length ? ` <i>(${extra.join(' · ')})</i>` : '');
}
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function blocoSaldos(a) {
  const out = [];
  const s = a.santander;
  if (s) {
    const prox = s.entradas[0];
    const pior = s.menor < 0 && s.menorEm > a.hoje
      ? ` No pior dia (${ddmm(s.menorEm)}) chega a R$ ${reais(s.menor)}: faltam <b>R$ ${reais(s.falta)}</b>.` : '';
    out.push(s.negativoEm
      ? (s.saldo < 0
          ? `⚠️ <b>Santander negativo</b>: R$ ${reais(s.saldo)} (cheque especial cobra juros).`
          : `⚠️ <b>Santander</b>: saldo R$ ${reais(s.saldo)}. Mesmo com os salários previstos, fica negativo em <b>${ddmm(s.negativoEm)}</b>.`) +
        pior
      : `💰 Santander: saldo R$ ${reais(s.saldo)}` +
        (prox ? `, entra ${prox.nome} em ${ddmm(prox.data)}` : '') + `. Cobre tudo até ${ddmm(a.ate)}.`);
  }
  if (a.caixa?.etapas?.length) out.push(`🏠 <b>Caixa</b> (saldo R$ ${reais(a.caixa.saldo)}):\n${linhasEtapas(a.caixa)}`);
  return out.join('\n');
}

function agrupado(itens, hoje) {
  const grupos = new Map();
  for (const i of itens) {
    const g = i.atrasada ? '⏰ Atrasado' : quando(i.data, hoje);
    if (!grupos.has(g)) grupos.set(g, []);
    grupos.get(g).push(i);
  }
  return [...grupos].map(([g, xs]) => `<b>${g}</b>\n${xs.map(linhaItem).join('\n')}`).join('\n\n');
}

// /agenda: tudo até `ate`
export function textoAgenda(a) {
  const saldos = blocoSaldos(a);
  if (!a.itens.length) return `📅 Nada a pagar até ${ddmm(a.ate)}.${saldos ? `\n\n${saldos}` : ''}\n\n${RODAPE}`;
  const total = a.itens.reduce((s, i) => s + i.valor, 0);
  return `📅 <b>Contas a pagar até ${ddmm(a.ate)}</b>\n\n${agrupado(a.itens, a.hoje)}\n\n` +
    `Total: <b>R$ ${reais(total)}</b>${saldos ? `\n\n${saldos}` : ''}\n\n` +
    `<i>Boleto avulso: /boleto IPTU 350,00 10/12</i>\n\n${RODAPE}`;
}

// Aviso diário: o que vence hoje, amanhã ou em 3 dias, o que atrasou, e o
// saldo que vai faltar nos próximos 5 dias. null = não avisar hoje.
export function avisoAgenda(a, dias = [0, 1, 3]) {
  const perto = a.itens.filter((i) => i.atrasada || dias.includes(diasEntre(a.hoje, i.data)));
  const santanderPerto = !!a.santander?.negativoEm && diasEntre(a.hoje, a.santander.negativoEm) <= 5;
  const caixaPerto = precisaAvisarCaixa(a.caixa, a.hoje);
  // fatura que fecha amanhã: comprar depois do fechamento empurra o
  // pagamento para a fatura seguinte (~40 dias de prazo)
  const fechaAmanha = a.itens.filter((i) => i.tipo === 'fatura' && i.fecha && diasEntre(a.hoje, i.fecha) === 1);
  if (!perto.length && !santanderPerto && !caixaPerto && !fechaAmanha.length) return null;
  const blocos = [];
  if (perto.length) blocos.push(agrupado(perto, a.hoje));
  if (fechaAmanha.length) {
    blocos.push(fechaAmanha.map((i) => `✂️ ${i.nome} fecha amanhã: compra a partir de ` +
      `${ddmm(isoMais(i.fecha, 1))} só vence na fatura seguinte.`).join('\n'));
  }
  const saldos = blocoSaldos(a);
  if (saldos) blocos.push(saldos);
  const texto = ['🔔 <b>Lembrete de contas</b>', ...blocos, `/agenda para ver os próximos 30 dias\n${RODAPE}`].join('\n\n');
  return { texto, blocos, boletos: perto.filter((i) => i.tipo === 'boleto') };
}

/* ======================================================= alerta de teto */
// Categoria com teto que passou de 80% ou de 100% no mês. Cada faixa avisa
// uma vez por mês (avisos_enviados, chave teto:<AAAA-MM>:<slug>:<faixa>):
// o gasto só cresce, então avisar todo dia viraria ruído.
export async function alertasTeto(hoje) {
  hoje = hoje ?? hojeIso();
  const mes = `${hoje.slice(0, 7)}-01`;
  const r = await q(
    `select slug, nome, limite, gasto, pct from public.orcamento($1::date)
      where limite > 0 and pct >= 80 order by pct desc`, [mes]);
  const ultimo = new Date(Date.UTC(Number(hoje.slice(0, 4)), Number(hoje.slice(5, 7)), 0)).getUTCDate();
  const restam = ultimo - Number(hoje.slice(8, 10)) + 1;
  return r.rows.map((x) => {
    const pct = num(x.pct);
    const faixa = pct >= 100 ? 100 : 80;
    return {
      slug: x.slug, nome: x.nome, limite: num(x.limite), gasto: num(x.gasto), pct, faixa, restam,
      chave: `teto:${hoje.slice(0, 7)}:${x.slug}:${faixa}`,
      // passou direto de 100: o aviso de 80 não vem mais depois
      chaves: [80, 100].filter((f) => f <= faixa).map((f) => `teto:${hoje.slice(0, 7)}:${x.slug}:${f}`),
    };
  });
}

export function textoTetos(tetos) {
  const linhas = tetos.map((t) => (t.faixa === 100
    ? `🔴 <b>${esc(t.nome)}</b>: R$ ${reais(t.gasto)} de R$ ${reais(t.limite)} (${Math.round(t.pct)}%), passou R$ ${reais(t.gasto - t.limite)}`
    : `🟡 <b>${esc(t.nome)}</b>: R$ ${reais(t.gasto)} de R$ ${reais(t.limite)} (${Math.round(t.pct)}%), restam R$ ${reais(t.limite - t.gasto)} ` +
      `para ${t.restam} ${t.restam === 1 ? 'dia' : 'dias'}`));
  return `📊 <b>Teto do mês</b>\n${linhas.join('\n')}\n<i>/saldo para ver todas as categorias</i>`;
}

// A mensagem das 07h: contas (avisoAgenda) + tetos que cruzaram uma faixa
// e ainda não foram avisados. null = nada a dizer hoje. `chaves` são as
// marcas a gravar depois de enviar.
export async function lembreteDoDia(hoje) {
  hoje = hoje ?? hojeIso();
  const [a, tetos] = await Promise.all([agenda(hoje), alertasTeto(hoje)]);
  const ja = tetos.length
    ? new Set((await q(`select chave from public.avisos_enviados where chave = any($1::text[])`,
                       [tetos.map((t) => t.chave)])).rows.map((r) => r.chave))
    : new Set();
  const novos = tetos.filter((t) => !ja.has(t.chave));
  const av = avisoAgenda(a);
  if (!av && !novos.length) return null;
  const blocos = [...(av?.blocos ?? []), ...(novos.length ? [textoTetos(novos)] : [])];
  const fim = (av ? '/agenda para ver os próximos 30 dias\n' : '') + RODAPE;
  return {
    texto: ['🔔 <b>Lembrete do dia</b>', ...blocos, fim].join('\n\n'),
    teclado: tecladoBoletos(av?.boletos),
    chaves: novos.flatMap((t) => t.chaves),
  };
}

// Botões "Paguei" dos boletos citados
export function tecladoBoletos(boletos) {
  if (!boletos?.length) return {};
  return { reply_markup: { inline_keyboard: boletos.slice(0, 6).map((b) => (
    [{ text: `✅ Paguei: ${b.nome}`.slice(0, 60), callback_data: `pago:${b.id}` }])) } };
}

// "/boleto IPTU da casa 350,50 10/12[/2027]" -> { descricao, valor, vencimento }
export function lerBoleto(texto, hoje) {
  hoje = hoje ?? hojeIso();
  const t = String(texto ?? '').trim();
  const md = /(?:^|\s)(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?(?=\s|$)/.exec(t);
  if (!md) return { erro: 'Faltou a data de vencimento (dd/mm).' };
  const resto = `${t.slice(0, md.index)} ${t.slice(md.index + md[0].length)}`.trim();
  // o valor é o ÚLTIMO número: "Parcela 3 IPTU 200" vale 200
  const mv = [...resto.matchAll(/(?:^|\s)(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?=\s|$)/gi)].at(-1);
  if (!mv) return { erro: 'Faltou o valor.' };
  let v = mv[1];
  if (/\.\d{3}/.test(v) && !/\.\d{1,2}$/.test(v)) v = v.replace(/\./g, '');
  const valor = Number(v.replace(',', '.'));
  const descricao = `${resto.slice(0, mv.index)} ${resto.slice(mv.index + mv[0].length)}`.replace(/\s+/g, ' ').trim();
  if (!descricao) return { erro: 'Faltou a descrição.' };
  if (!(valor > 0)) return { erro: 'Valor inválido.' };
  const d = Number(md[1]), mes = Number(md[2]);
  let ano = md[3] ? Number(md[3].length === 2 ? `20${md[3]}` : md[3]) : Number(hoje.slice(0, 4));
  const iso = (y) => `${y}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const valida = (s) => !Number.isNaN(Date.parse(s)) && new Date(`${s}T12:00:00Z`).getUTCDate() === d;
  if (mes < 1 || mes > 12 || !valida(iso(ano))) return { erro: 'Data inválida.' };
  // sem ano e já passou há mais de um mês: é do ano que vem
  if (!md[3] && diasEntre(iso(ano), hoje) > 31) ano += 1;
  return { descricao, valor, vencimento: iso(ano) };
}

/* ============================================================ transações */
// Período inteiro de uma vez: a planilha filtra e ordena no navegador, que
// para ~1.500 linhas é instantâneo e não depende de ida ao servidor.
export async function transacoes({ de, ate }) {
  const r = await q(
    `select l.id, l.data_compra, l.mes_ref, l.valor, l.tipo, l.descricao, l.categoria_id,
            l.parcela_num, l.parcela_total, l.origem, l.conciliado,
            case when l.origem <> 'painel' then null
                 when l.origem_ref like 'previsao:%' then 'previsão'
                 else 'recorrência' end as automatico,
            k.slug as conta, u.apelido as pessoa
       from public.lancamentos l
       left join public.contas k on k.id = l.conta_id
       left join public.usuarios u on u.id = l.pagador_id
      where l.mes_ref between $1 and $2
      order by l.data_compra desc, l.created_at desc
      limit 5000`, [de, ate]);
  return r.rows.map((x) => ({
    ...x, valor: num(x.valor), data_compra: dia(x.data_compra), mes_ref: dia(x.mes_ref),
  }));
}

export async function mesesComDados() {
  const r = await q(`select distinct mes_ref from public.lancamentos order by 1 desc`);
  return r.rows.map((x) => dia(x.mes_ref).slice(0, 7));
}

/* ============================================================= orçamento */
export async function orcamento(mesPedido) {
  const atual = await mesAtual();
  const mes = mesPedido ?? atual.mes;
  const [cats, base, plano, metas, grupos, serieGrupo] = await Promise.all([
    q(`select o.id, o.slug, o.nome, o.gasto, o.limite, c.tipo, c.limite_padrao, g.slug as grupo
         from public.orcamento($1) o
         join public.categorias c on c.id = o.id
         left join public.grupos g on g.id = c.grupo_id
        where c.tipo <> 'entrada'
        order by o.limite desc nulls last, o.gasto desc`, [mes]),
    q(`select categoria_id, mediana, media, maximo, meses from public.baseline(6)`),
    q(`select * from public.plano_mensal($1)`, [mes]),
    q(`select slug, nome, valor_alvo, acumulado, falta, pct, aporte_mensal_necessario,
              data_alvo, meses_restantes, status
         from public.vw_metas`),
    q(`select slug, nome, pct_ref, ordem from public.grupos order by ordem`),
    // gasto por grupo nos 3 meses FECHADOS antes do corrente
    q(`select g.slug, sum(l.valor) / 3.0 as media
         from public.lancamentos l
         join public.categorias c on c.id = l.categoria_id
         join public.grupos g on g.id = coalesce(l.grupo_id, c.grupo_id)
        where l.tipo = 'saida'
          and l.mes_ref >= (date_trunc('month', current_date::timestamp) - interval '3 months')::date
          and l.mes_ref <  date_trunc('month', current_date::timestamp)::date
        group by 1`),
  ]);
  const basePor = Object.fromEntries(base.rows.map((b) => [b.categoria_id, nums(b, ['mediana', 'media', 'maximo'])]));
  const mediaGrupo = Object.fromEntries(serieGrupo.rows.map((r) => [r.slug, num(r.media)]));
  const p = Object.fromEntries(Object.entries(plano.rows[0] ?? {}).map(([k, v]) => [k, k === 'mes_ref' ? dia(v) : num(v)]));
  return {
    mes, mesAtual: atual.mes, hoje: atual.hoje, diasMes: atual.diasMes,
    categorias: cats.rows.map((c) => ({
      ...nums(c, ['gasto', 'limite', 'limite_padrao']),
      mediana: basePor[c.id]?.mediana ?? null, media: basePor[c.id]?.media ?? null,
    })),
    plano: p,
    metas: metas.rows.map((m) => ({ ...nums(m, ['valor_alvo', 'acumulado', 'falta', 'pct', 'aporte_mensal_necessario']),
                                    data_alvo: dia(m.data_alvo) })),
    grupos: grupos.rows.map((g) => ({
      ...g, pct_ref: num(g.pct_ref), ref: p.renda_prevista ? (num(g.pct_ref) / 100) * p.renda_prevista : 0,
      real: mediaGrupo[g.slug] ?? 0,
    })),
  };
}

/* ============================================================ relatórios */
export async function relatorios(mesPedido) {
  const atual = await mesAtual();
  const mes = mesPedido ?? atual.mes;
  const [porTipo, porGrupo, porCat, entradas] = await Promise.all([
    q(`select mes_ref, tipo, sum(valor) as valor from public.lancamentos
        where tipo in ('entrada', 'saida') group by 1, 2 order by 1`),
    q(`select l.mes_ref, g.slug, sum(l.valor) as valor
         from public.lancamentos l
         left join public.categorias c on c.id = l.categoria_id
         left join public.grupos g on g.id = coalesce(l.grupo_id, c.grupo_id)
        where l.tipo = 'saida' group by 1, 2 order by 1`),
    q(`select l.mes_ref, coalesce(c.slug, '_sem') as slug, coalesce(c.nome, 'Sem categoria') as nome,
              g.slug as grupo, sum(l.valor) as valor
         from public.lancamentos l
         left join public.categorias c on c.id = l.categoria_id
         left join public.grupos g on g.id = coalesce(l.grupo_id, c.grupo_id)
        where l.tipo = 'saida' group by 1, 2, 3, 4 order by 1`),
    q(`select coalesce(c.nome, 'Outras entradas') as nome, sum(l.valor) as valor
         from public.lancamentos l left join public.categorias c on c.id = l.categoria_id
        where l.tipo = 'entrada' and l.mes_ref = $1 group by 1 order by 2 desc`, [mes]),
  ]);
  const fix = (rows) => rows.map((r) => ({ ...r, mes_ref: dia(r.mes_ref), valor: num(r.valor) }));
  return {
    mes, mesAtual: atual.mes,
    porTipo: fix(porTipo.rows), porGrupo: fix(porGrupo.rows), porCategoria: fix(porCat.rows),
    entradasMes: entradas.rows.map((r) => nums(r, ['valor'])),
  };
}

/* ================================================================ escrita */
// Toda escrita do painel passa por aqui, com validação de tipo. As rotas
// só autenticam e repassam.

export async function trocarCategoria(id, categoriaId) {
  const r = await q(
    `update public.lancamentos set categoria_id = $2
      where id = $1 and tipo <> 'transferencia'
      returning id`, [id, categoriaId]);
  return r.rows.length === 1;
}

// "Aplicar a todas iguais": cria a regra e classifica o que estiver SEM
// categoria e casar com ela. Não mexe no que já tem categoria — uma
// regra nova não desfaz escolha feita antes.
export async function criarRegra(padrao, categoriaId) {
  const p = String(padrao ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (p.length < 3) throw new Error('padrão curto demais');
  const chave = `painel:${p.slice(0, 60)}`;
  await q(
    `insert into public.regras_classificacao (chave, padrao, categoria_id, prioridade, ignorar, nota)
     values ($1, $2, $3, 30, false, 'criada no painel')
     on conflict (chave) do update set categoria_id = excluded.categoria_id, ativo = true`,
    [chave, p, categoriaId]);
  const r = await q(
    `update public.lancamentos set categoria_id = $2
      where categoria_id is null and tipo = 'saida'
        and lower(regexp_replace(descricao, '\\s+', ' ', 'g')) like '%' || $1 || '%'
      returning id`, [p, categoriaId]);
  return { padrao: p, aplicadas: r.rows.length };
}

export async function definirTeto(categoriaId, valor) {
  const r = await q(
    `update public.categorias set limite_padrao = $2
      where id = $1 and tipo = 'variavel' returning id`, [categoriaId, valor]);
  if (r.rows.length !== 1) return false;
  // o mês corrente pode ter teto próprio (tabela limites) — ele também muda
  await q(`update public.limites set valor = $2
            where categoria_id = $1 and mes_ref >= date_trunc('month', current_date::timestamp)::date`,
          [categoriaId, valor]);
  return true;
}
