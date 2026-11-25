// GERADO por financas-casal/scripts/sync-webhook.mjs — não edite aqui.
// A fonte e os testes ficam no projeto privado financas-casal.
// Consultas do painel. Uma função, uma ida ao banco em paralelo.
//
// Vive aqui (projeto privado) e é sincronizada para o site, igual ao
// webhook: testada aqui, executada lá.
import { q } from './pg.js';

export async function painel() {
  const [plano, grupos, serie, categorias, metas, pendentes, totais, maiores, baseline, pagadores, cego] =
    await Promise.all([
    // 1. a conta do mês: renda - fixos - metas = disponível
    q(`select * from public.plano_mensal()`),

    // 2. grupos do mês contra a referência
    q(`select slug, nome, descricao, cor, ordem, pct_ref, valor_ref, limite, gasto, pct_real, desvio
         from public.vw_orcamento_grupo`),

    // 3. série mensal por grupo, só meses com movimento
    q(`select l.mes_ref, g.slug, g.nome, g.cor, g.ordem, sum(l.valor) as valor
         from public.lancamentos l
         join public.categorias c on c.id = l.categoria_id
         join public.grupos g on g.id = coalesce(l.grupo_id, c.grupo_id)
        where l.tipo = 'saida'
        group by 1,2,3,4,5
        order by 1, 5`),

    // 4. categoria: gasto do mês contra o limite
    q(`select o.slug, o.nome, o.cor, o.gasto, o.limite, o.saldo, o.pct, g.slug as grupo
         from public.orcamento() o
         join public.categorias c on c.id = o.id
         left join public.grupos g on g.id = c.grupo_id
        where o.limite is not null and o.limite > 0
        order by o.limite desc`),

    // 5. metas
    q(`select slug, nome, prazo, valor_alvo, acumulado, falta, pct, cor,
              aporte_mensal_necessario, status, bloqueante, data_alvo
         from public.vw_metas`),

    // 6. o que falta classificar
    q(`select count(*)::int as n, coalesce(sum(valor), 0) as valor
         from public.lancamentos where categoria_id is null and tipo = 'saida'`),

    // 7. entrada / saída / transferência por mês
    q(`select mes_ref, tipo, sum(valor) as valor, count(*)::int as n
         from public.lancamentos
        group by 1,2 order by 1`),

    // 8. onde o dinheiro foi: maiores destinos do histórico
    q(`select descricao, count(*)::int as n, sum(valor) as valor,
              coalesce(c.nome, '(sem categoria)') as categoria
         from public.lancamentos l
         left join public.categorias c on c.id = l.categoria_id
        where l.tipo = 'saida'
        group by 1, 4
        order by 3 desc
        limit 12`),

    // 9. mediana medida contra o limite — o "onde gastamos demais"
    q(`select b.slug, b.nome, b.tipo, b.meses, b.mediana, b.media, b.maximo,
              coalesce(l.valor, c.limite_padrao) as limite, c.cor,
              g.slug as grupo
         from public.baseline(3) b
         join public.categorias c on c.id = b.categoria_id
         left join public.grupos g on g.id = c.grupo_id
         left join public.limites l
           on l.categoria_id = b.categoria_id
          and l.mes_ref = date_trunc('month', current_date::timestamp)::date
        where b.mediana > 0
        order by b.mediana desc`),

    // 10. quem gastou, deduzido do cartão
    q(`select u.apelido, count(*)::int as n, sum(l.valor) as valor
         from public.lancamentos l
         join public.usuarios u on u.id = l.pagador_id
        where l.tipo = 'saida'
        group by 1 order by 3 desc`),

    // 11. o ponto cego: dinheiro que sai todo mês e NÃO está em nenhum
    // limite. plano_mensal só confronta categorias com limite, então uma
    // folga perto de zero pode esconder isto. Sem mostrar, o painel
    // tranquiliza sem base.
    q(`with meses as (
         -- meses FECHADOS: tira o corrente e tira o primeiro, que é
         -- parcial porque o extrato começa no dia 27. Incluir agosto
         -- divide por 3 um valor que só ocorreu 2 vezes e subestima.
         select distinct mes_ref from public.lancamentos
          where origem = 'importacao'
            and mes_ref < date_trunc('month', current_date::timestamp)::date
            and mes_ref > (select min(mes_ref) from public.lancamentos where origem = 'importacao')
       ),
       -- Pagamento de fatura é transferência a partir da CORRENTE: o
       -- lançamento guarda a conta de origem, não o cartão de destino,
       -- que não é registrado em lugar nenhum. Então filtra pelo
       -- descritor do banco, que é estável — e se ele mudar o número cai
       -- para zero e a seção desaparece, em vez de mentir.
       --
       -- Só o cartão SEM fatura importada conta como invisível: o do
       -- Bradesco teve as 3 faturas carregadas, então o gasto dele já
       -- está dentro dos limites por categoria.
       fatura as (
         select coalesce(sum(l.valor), 0) as v
           from public.lancamentos l
          where l.tipo = 'transferencia'
            and lower(l.descricao) like 'pagamento cartao credito%'
            and l.mes_ref in (select mes_ref from meses)
       ),
       sem_cat as (
         select coalesce(sum(valor), 0) as v
           from public.lancamentos
          where tipo = 'saida' and categoria_id is null
            and mes_ref in (select mes_ref from meses)
       )
       select (select count(*) from meses)::int as meses,
              fatura.v as fatura, sem_cat.v as sem_categoria
         from fatura, sem_cat`),
  ]);

  const num = (v) => (v === null || v === undefined ? null : Number(v));
  const dia = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

  return {
    geradoEm: new Date().toISOString(),
    plano: Object.fromEntries(
      Object.entries(plano.rows[0] ?? {}).map(([k, v]) => [k, k === 'mes_ref' ? dia(v) : num(v)])
    ),
    grupos: grupos.rows.map((r) => ({
      ...r, pct_ref: num(r.pct_ref), valor_ref: num(r.valor_ref),
      limite: num(r.limite), gasto: num(r.gasto), pct_real: num(r.pct_real), desvio: num(r.desvio),
    })),
    serie: serie.rows.map((r) => ({ ...r, mes_ref: dia(r.mes_ref), valor: num(r.valor) })),
    categorias: categorias.rows.map((r) => ({
      ...r, gasto: num(r.gasto), limite: num(r.limite), saldo: num(r.saldo), pct: num(r.pct),
    })),
    metas: metas.rows.map((r) => ({
      ...r, valor_alvo: num(r.valor_alvo), acumulado: num(r.acumulado), falta: num(r.falta),
      pct: num(r.pct), aporte_mensal_necessario: num(r.aporte_mensal_necessario), data_alvo: dia(r.data_alvo),
    })),
    pendentes: { n: pendentes.rows[0].n, valor: num(pendentes.rows[0].valor) },
    totais: totais.rows.map((r) => ({ ...r, mes_ref: dia(r.mes_ref), valor: num(r.valor) })),
    maiores: maiores.rows.map((r) => ({ ...r, valor: num(r.valor) })),
    baseline: baseline.rows.map((r) => ({
      ...r, mediana: num(r.mediana), media: num(r.media), maximo: num(r.maximo), limite: num(r.limite),
    })),
    pagadores: pagadores.rows.map((r) => ({ ...r, valor: num(r.valor) })),
    cego: (() => {
      const r = cego.rows[0] ?? {};
      const m = Math.max(r.meses ?? 0, 1);
      const fatura = num(r.fatura) ?? 0;
      const semCat = num(r.sem_categoria) ?? 0;
      return {
        meses: r.meses ?? 0,
        faturaMes: fatura / m,
        semCategoriaMes: semCat / m,
        totalMes: (fatura + semCat) / m,
      };
    })(),
  };
}
