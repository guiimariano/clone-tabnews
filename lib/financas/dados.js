// GERADO por financas-casal/scripts/sync-webhook.mjs — não edite aqui.
// A fonte e os testes ficam no projeto privado financas-casal.
// Consultas do painel. Uma função, uma ida ao banco em paralelo.
//
// Vive aqui (projeto privado) e é sincronizada para o site, igual ao
// webhook: testada aqui, executada lá.
import { q } from './pg.js';

export async function painel() {
  // O mês do PLANO: o mais recente que já tem gasto lançado, nunca antes
  // do corrente. Compra no cartão depois do fechamento já é da fatura do
  // mês seguinte, e é esse mês que o casal está planejando — em 25/11 o
  // painel mostra dezembro, porque a fatura de dezembro já está aberta.
  const m = await q(`select date_trunc('month', current_date::timestamp)::date as atual,
                            greatest(date_trunc('month', current_date::timestamp)::date,
                                     coalesce(max(mes_ref), '1900-01-01')) as plano
                       from public.lancamentos where tipo = 'saida'`);
  const mesAtual = m.rows[0].atual;
  const mesPlano = m.rows[0].plano;

  const [plano, grupos, serie, categorias, metas, pendentes, totais, maiores, baseline, pagadores, cego, abertas] =
    await Promise.all([
    // 1. a conta do mês: renda - fixos - metas = disponível
    q(`select * from public.plano_mensal($1)`, [mesPlano]),

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
         from public.orcamento($1) o
         join public.categorias c on c.id = o.id
         left join public.grupos g on g.id = c.grupo_id
        where o.limite is not null and o.limite > 0
        order by o.limite desc`, [mesPlano]),

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
          and l.mes_ref = $1
        where b.mediana > 0
        order by b.mediana desc`, [mesPlano]),

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
       -- Compra fora do padrão (excedente da fatura Santander acima de
       -- R$ 500, migration 0019) é 'eventual' e não tem teto: sai do
       -- bolso mas nenhum limite a confronta.
       extra as (
         select coalesce(sum(l.valor), 0) as v
           from public.lancamentos l
           join public.categorias c on c.id = l.categoria_id
          where l.tipo = 'saida' and c.slug = 'compras_adicionais'
            and l.mes_ref in (select mes_ref from meses)
       ),
       sem_cat as (
         select coalesce(sum(valor), 0) as v
           from public.lancamentos
          where tipo = 'saida' and categoria_id is null
            and mes_ref in (select mes_ref from meses)
       )
       select (select count(*) from meses)::int as meses,
              extra.v as extra, sem_cat.v as sem_categoria
         from extra, sem_cat`),

    // 12. contas em aberto do mês do plano: compras no cartão que ainda
    // viram fatura, mais as previsões (fatura Santander, 0020). É o que
    // vai sair quando a renda cair na virada do mês.
    // A previsão do Santander é debitada da CORRENTE, mas o que está em
    // aberto é a fatura do cartão — o nome mostrado é o do cartão.
    q(`select case when l.origem_ref like 'previsao:santander%' then 'santander_cartao' else k.slug end as slug,
              case when l.origem_ref like 'previsao:santander%' then 'Cartão Santander' else k.nome end as nome,
              bool_or(l.origem_ref like 'previsao:%') as previsao,
              count(*)::int as n, sum(l.valor) as valor
         from public.lancamentos l
         join public.contas k on k.id = l.conta_id
        where l.mes_ref = $1 and l.tipo = 'saida'
          and (k.tipo = 'cartao_credito' or l.origem_ref like 'previsao:%')
        group by 1, 2
        order by 5 desc`, [mesPlano]),
  ]);

  const num = (v) => (v === null || v === undefined ? null : Number(v));
  const dia = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

  return {
    geradoEm: new Date().toISOString(),
    mesAtual: dia(mesAtual),
    mesPlano: dia(mesPlano),
    abertas: abertas.rows.map((r) => ({ ...r, valor: num(r.valor) })),
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
      const extra = num(r.extra) ?? 0;
      const semCat = num(r.sem_categoria) ?? 0;
      return {
        meses: r.meses ?? 0,
        extraMes: extra / m,
        semCategoriaMes: semCat / m,
        totalMes: (extra + semCat) / m,
      };
    })(),
  };
}
