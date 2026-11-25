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
  return {
    saldo, saldo_em: s.rows[0].saldo_em ? new Date(s.rows[0].saldo_em).toISOString() : null,
    proximos, negativoEm,
    falta: Math.round(falta * 100) / 100,
    // sugestão redonda: cobre tudo o que vence até o próximo ciclo
    transferir: falta > 0 ? Math.ceil(falta / 10) * 10 : 0,
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
    (c.transferir
      ? `Transfira <b>R$ ${reais(c.transferir)}</b> antes de ${ddmm(c.negativoEm)} para não entrar no cheque especial.`
      : '✅ O saldo cobre os próximos débitos.');
}

// Avisar só quando o primeiro débito sem saldo está perto (ou já passou).
export function precisaAvisarCaixa(c, hoje, dias = 5) {
  if (!c?.negativoEm) return false;
  const ms = Date.parse(c.negativoEm) - Date.parse(hoje);
  return ms <= dias * 86400000;
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
