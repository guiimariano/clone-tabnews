// GERADO por financas-casal/scripts/sync-webhook.mjs — não edite aqui.
// A fonte e os testes ficam no projeto privado financas-casal.
// /financas — Dashboard. Renderizado no servidor: os dados nunca chegam ao
// cliente sem o cookie de sessão válido.
//
// Inspirado no dashboard do Securo: indicadores no topo, ritmo do mês
// contra a mediana, composição da despesa, 12 meses de receita x despesa,
// orçamento, contas/cartões, vencimentos e últimas transações.
import Link from 'next/link';
import { useRouter } from 'next/router';
import { autenticado } from '../lib/financas/auth.js';
import { dashboard, mesValido } from '../lib/financas/dados.js';
import {
  Layout, Portao, Tile, SeletorMes, brl, brl0, pct, rotuloMes, mesLongo, dataCurta, somaMes, estado,
  NOME_GRUPO,
} from '../components/financas/base.js';
import { Rosca, fatiasPorGrupo, Acumulado, ReceitaDespesa } from '../components/financas/graficos.js';

export default function Dashboard({ ok, erro, d }) {
  const router = useRouter();
  if (!ok) return <Portao erro={erro} />;

  const { mes, mesAtual, hoje, diasMes, plano } = d;
  const corrente = mes === mesAtual;
  const ateDia = corrente ? hoje : mes > mesAtual ? 0 : diasMes;

  const doMes = (m, tipo) => d.totais.filter((t) => t.mes_ref === m && t.tipo === tipo).reduce((a, t) => a + t.valor, 0);
  const receita = doMes(mes, 'entrada'), despesa = doMes(mes, 'saida');
  const ant = somaMes(mes, -1);
  const despAnt = doMes(ant, 'saida');
  const resultado = receita - despesa;
  const poupanca = receita > 0 ? (resultado / receita) * 100 : null;
  const variacao = despAnt > 0 ? ((despesa - despAnt) / despAnt) * 100 : null;
  const emAberto = d.abertas.reduce((a, x) => a + x.valor, 0);

  const mesesSerie = [...new Set(d.totais.map((t) => t.mes_ref))].sort();
  const primeiro = mesesSerie[0];
  const serie = mesesSerie.map((m) => ({
    mes: m, receita: doMes(m, 'entrada'), despesa: doMes(m, 'saida'),
    parcial: m === primeiro || m >= mesAtual,
  }));

  const fatias = fatiasPorGrupo(d.porCategoria);
  const topCats = d.porCategoria.slice(0, 8);

  // ritmo do orçamento (só categorias com teto)
  const { gasto: gastoTeto, limite: teto } = d.ritmo;
  const esperadoHoje = corrente ? (teto * hoje) / diasMes : teto;
  const projecao = corrente && hoje > 0 ? (gastoTeto / hoje) * diasMes : gastoTeto;
  const eRitmo = estado(teto ? (projecao / teto) * 100 : null);

  // vencimentos: faturas em aberto + fixos do mês que ainda vêm
  const fixos = d.recorrencias
    .filter((r) => !/^Cartão Santander/.test(r.nome)) // já está como fatura em aberto
    .filter((r) => !corrente || r.dia >= hoje)
    .map((r) => ({ chave: `r-${r.nome}`, nome: r.nome, valor: r.valor, quando: `dia ${r.dia}`, ordem: r.dia, tipo: 'fixo' }));
  const faturas = d.abertas.map((a) => ({
    chave: `f-${a.slug}`, nome: `Fatura ${a.nome}`, valor: a.valor, quando: dataCurta(a.vence),
    ordem: a.vence ? Number(a.vence.slice(8, 10)) + (a.vence.slice(0, 7) > mes.slice(0, 7) ? 31 : 0) : 99,
    tipo: a.previsao ? 'previsão' : `${a.n} compras`,
  }));
  const vencimentos = [...faturas, ...fixos].sort((a, b) => a.ordem - b.ordem);

  const bancos = d.contas.filter((c) => c.tipo === 'BANK');
  const cartoes = d.contas.filter((c) => c.tipo === 'CREDIT');
  const saldoBancos = bancos.reduce((a, c) => a + (c.saldo ?? 0), 0);

  return (
    <Layout ativo="dashboard" titulo={mesLongo(mes)}
            sub={`${corrente ? `dia ${hoje} de ${diasMes}` : mes > mesAtual ? 'mês futuro' : 'mês fechado'} · competência: a fatura entra no mês anterior ao vencimento`}
            acoes={<SeletorMes mes={mes} base="/financas" />}>

      <section className="tiles">
        <Tile rotulo="Receitas" valor={`R$ ${brl0(receita)}`} nota="salários, benefício, Pix recebidos" />
        <Tile rotulo="Despesas" valor={`R$ ${brl0(despesa)}`}
              nota={variacao === null ? '—' : `${variacao >= 0 ? '▲' : '▼'} ${pct(Math.abs(variacao))} vs ${rotuloMes(ant)}`} />
        <Tile rotulo="Resultado" valor={`R$ ${brl0(resultado)}`} tom={resultado < 0 ? 'critico' : 'ok'}
              nota={resultado < 0 ? 'gastou mais do que entrou' : 'sobrou no mês'} />
        <Tile rotulo="Taxa de poupança" valor={poupanca === null ? '—' : pct(poupanca)}
              tom={poupanca === null ? 'neutro' : poupanca < 0 ? 'critico' : poupanca < 10 ? 'atencao' : 'ok'}
              nota="resultado ÷ receita" />
        <Tile rotulo="Faturas em aberto" valor={`R$ ${brl0(emAberto)}`}
              nota={d.abertas.map((a) => `${a.nome.replace('Cartão ', '').split(' ')[0]} ${dataCurta(a.vence)}`).join(' · ') || 'nenhuma'} />
        <Tile rotulo="Sem categoria" valor={`${d.pendentes.n}`} tom={d.pendentes.n ? 'atencao' : 'ok'}
              nota={d.pendentes.n ? `R$ ${brl0(d.pendentes.valor)} — classificar` : 'tudo classificado'}
              href={`/financas/transacoes?mes=${mes.slice(0, 7)}&categoria=_sem`} />
      </section>

      <div className="grade g-2-1">
        <section className="cartao">
          <div className="cartao-topo">
            <h2>Despesa acumulada no mês</h2>
            <span className="muted tab">R$ {brl0(despesa)}</span>
          </div>
          <Acumulado curva={d.curva} ateDia={ateDia} diasMes={diasMes} />
          {d.mesesBase.length > 0 && corrente && (() => {
            const ponto = d.curva[hoje - 1];
            if (!ponto || ponto.mediana === null) return null;
            const dif = ponto.mes - ponto.mediana;
            return (
              <p className="nota">
                No dia {hoje}: R$ {brl0(ponto.mes)}, <strong className={dif > 0 ? 'neg' : 'pos'}>
                {dif > 0 ? 'acima' : 'abaixo'} da mediana em R$ {brl0(Math.abs(dif))}</strong>
                {' '}({d.mesesBase.map(rotuloMes).join(', ')}).
              </p>
            );
          })()}
        </section>

        <section className="cartao">
          <div className="cartao-topo">
            <h2>Para onde foi</h2>
            <Link href={`/financas/transacoes?mes=${mes.slice(0, 7)}`}>ver transações</Link>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <Rosca fatias={fatias} />
          </div>
          <table style={{ marginTop: 12 }}>
            <tbody>
              {topCats.map((c) => (
                <tr key={c.slug} className="clicavel" style={{ cursor: 'pointer' }}
                    onClick={() => router.push(`/financas/transacoes?mes=${mes.slice(0, 7)}&categoria=${c.slug}`)}>
                  <td><span className="chip" style={{ background: `var(--s-${c.slug === '_sem' ? '_sem' : c.grupo ?? '_sem'})`, marginRight: 8 }} />{c.nome}</td>
                  <td className="num tab">{brl0(c.valor)}</td>
                  <td className="num muted">{despesa ? pct((c.valor / despesa) * 100) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <div className="grade g-2-1">
        <section className="cartao">
          <div className="cartao-topo">
            <h2>Receita × despesa</h2>
            <Link href="/financas/relatorios">relatórios</Link>
          </div>
          <ReceitaDespesa meses={serie} destaque={mes}
                          aoClicar={(m) => router.push(`/financas?mes=${m.slice(0, 7)}`)} />
          <p className="nota">Clique num mês para abri-lo. O primeiro mês é parcial: o histórico da Pluggy começa em 27/11/2025.</p>
        </section>

        <section className="cartao">
          <div className="cartao-topo">
            <h2>Ritmo do orçamento</h2>
            <Link href={`/financas/orcamento?mes=${mes.slice(0, 7)}`}>orçamento</Link>
          </div>
          {teto > 0 ? (
            <>
              <div className="tab" style={{ fontSize: '1.3rem', fontWeight: 600 }}>
                R$ {brl0(gastoTeto)} <span className="muted" style={{ fontSize: '0.9rem', fontWeight: 400 }}>de R$ {brl0(teto)}</span>
              </div>
              <div className="trilha" style={{ margin: '12px 0 8px' }}>
                <div className={`preench est-${eRitmo.chave}`} style={{ width: `${Math.min(100, (gastoTeto / teto) * 100)}%` }} />
                {corrente && <div className="marca-hoje" style={{ left: `${(esperadoHoje / teto) * 100}%` }} title="onde deveria estar hoje" />}
              </div>
              <p className="nota" style={{ marginTop: 4 }}>
                {corrente
                  ? <>No ritmo atual o mês fecha em <strong className={`est-${eRitmo.chave}`}>R$ {brl0(projecao)}</strong>
                      {' '}({pct((projecao / teto) * 100)} do teto). A linha tracejada é onde o gasto deveria estar no dia {hoje}.</>
                  : <>{pct((gastoTeto / teto) * 100)} do teto das categorias variáveis.</>}
              </p>
              <dl className="mini-plano">
                <div><dt>Renda prevista</dt><dd className="tab">{brl0(plano.renda_prevista)}</dd></div>
                <div><dt>Fixos</dt><dd className="tab">−{brl0(plano.fixos_previstos)}</dd></div>
                <div><dt>Metas</dt><dd className="tab">−{brl0(plano.aporte_metas)}</dd></div>
                <div><dt>Tetos variáveis</dt><dd className="tab">−{brl0(plano.limites_variaveis)}</dd></div>
                <div className="total"><dt>Folga do plano</dt>
                  <dd className={`tab ${plano.folga < 0 ? 'neg' : 'pos'}`}>{brl0(plano.folga)}</dd></div>
              </dl>
            </>
          ) : <p className="vazio">Nenhuma categoria com teto.</p>}
        </section>
      </div>

      <div className="grade g3">
        <section className="cartao">
          <div className="cartao-topo">
            <h2>Contas e cartões</h2>
            <Link href="/financas/conectar">bancos</Link>
          </div>
          {d.contas.length === 0 && <p className="vazio">Nenhuma conta sincronizada.</p>}
          {bancos.length > 0 && (
            <>
              <div className="lista-contas">
                {bancos.map((c) => (
                  <div key={c.nome + c.subtipo}>
                    <span>{c.nome}</span>
                    <span className={`tab ${(c.saldo ?? 0) < 0 ? 'neg' : ''}`}>{c.saldo === null ? '—' : `R$ ${brl(c.saldo)}`}</span>
                  </div>
                ))}
              </div>
              <p className="nota" style={{ marginTop: 6 }}>Saldo em conta: <strong className="tab">R$ {brl(saldoBancos)}</strong></p>
            </>
          )}
          {d.caixa && (
            <div className="cartao-credito">
              <div className="lista-contas">
                <div><strong>Caixa (apartamento)</strong><span className={`tab ${d.caixa.saldo < 0 ? 'neg' : ''}`}>R$ {brl(d.caixa.saldo)}</span></div>
                {d.caixa.proximos.map((x) => (
                  <div key={x.nome} className="muted" style={{ fontSize: '0.8rem' }}>
                    <span>{dataCurta(x.data)} · {x.nome} R$ {brl(x.valor)}</span>
                    <span className={`tab ${x.saldoDepois < 0 ? 'neg' : ''}`}>fica R$ {brl(x.saldoDepois)}</span>
                  </div>
                ))}
              </div>
              <p className={`nota ${d.caixa.transferir ? 'est-critico' : 'est-ok'}`} style={{ marginTop: 6 }}>
                {d.caixa.transferir
                  ? `⚠ Transfira R$ ${brl0(d.caixa.transferir)} antes de ${dataCurta(d.caixa.negativoEm)} para não entrar no cheque especial.`
                  : '✓ O saldo cobre os próximos débitos.'}
              </p>
            </div>
          )}
          {cartoes.map((c) => {
            const aberta = d.abertas.find((a) => (c.slug && a.slug === c.slug));
            const uso = c.limite ? ((c.limite - (c.limite_livre ?? c.limite)) / c.limite) * 100 : null;
            return (
              <div key={c.nome} className="cartao-credito">
                <div className="lista-contas">
                  <div><strong>{c.nome}</strong><span className="tab">{aberta ? `R$ ${brl(aberta.valor)}` : '—'}</span></div>
                </div>
                <div className="trilha" style={{ height: 6, margin: '6px 0 4px' }}>
                  <div className="preench est-neutro" style={{ height: 6, width: `${Math.min(100, uso ?? 0)}%` }} />
                </div>
                <div className="muted" style={{ fontSize: '0.78rem' }}>
                  {aberta ? `fatura aberta, vence ${dataCurta(aberta.vence)}` : 'sem fatura aberta'}
                  {c.limite ? ` · limite livre R$ ${brl0(c.limite_livre)} de ${brl0(c.limite)}` : ''}
                </div>
              </div>
            );
          })}
          {d.contas[0]?.saldo_em && (
            <p className="nota">Saldos da Pluggy em {new Date(d.contas[0].saldo_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.</p>
          )}
        </section>

        <section className="cartao">
          <div className="cartao-topo"><h2>Próximos vencimentos</h2></div>
          {vencimentos.length === 0 ? <p className="vazio">Nada a vencer.</p> : (
            <table>
              <tbody>
                {vencimentos.map((v) => (
                  <tr key={v.chave}>
                    <td className="muted tab" style={{ whiteSpace: 'nowrap' }}>{v.quando}</td>
                    <td>{v.nome}<div className="muted" style={{ fontSize: '0.75rem' }}>{v.tipo}</div></td>
                    <td className="num tab">{brl0(v.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="cartao">
          <div className="cartao-topo">
            <h2>Últimas transações</h2>
            <Link href={`/financas/transacoes?mes=${mes.slice(0, 7)}`}>ver todas</Link>
          </div>
          {d.ultimas.length === 0 ? <p className="vazio">Nenhuma no mês.</p> : (
            <table>
              <tbody>
                {d.ultimas.map((t) => (
                  <tr key={t.id}>
                    <td className="muted tab" style={{ whiteSpace: 'nowrap' }}>{dataCurta(t.data_compra)}</td>
                    <td>
                      {t.descricao}
                      <div className="muted" style={{ fontSize: '0.75rem' }}>
                        {t.categoria ?? 'sem categoria'}{t.pessoa ? ` · ${t.pessoa}` : ''}{t.conciliado === false ? ' · pendente' : ''}
                      </div>
                    </td>
                    <td className={`num tab ${t.tipo === 'entrada' || t.valor < 0 ? 'pos' : ''}`}>
                      {t.tipo === 'entrada' || t.valor < 0 ? '+' : ''}{brl(Math.abs(t.valor))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <p className="nota">Gerado em {new Date(d.geradoEm).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} · alimentado pela Pluggy (Open Finance).</p>

      <style jsx global>{`
        .viz-root .mini-plano { margin: 14px 0 0; font-size: 0.84rem; }
        .viz-root .mini-plano div { display: flex; justify-content: space-between; padding: 4px 0;
          border-bottom: 1px solid var(--linha); }
        .viz-root .mini-plano dt { color: var(--ink-2); }
        .viz-root .mini-plano dd { margin: 0; }
        .viz-root .mini-plano .total { border-bottom: 0; font-weight: 600; }
        .viz-root .lista-contas div { display: flex; justify-content: space-between; gap: 10px;
          padding: 5px 0; font-size: 0.86rem; }
        .viz-root .cartao-credito { border-top: 1px solid var(--linha); padding-top: 10px; margin-top: 10px; }
      `}</style>
    </Layout>
  );
}

export async function getServerSideProps({ req, query }) {
  if (!process.env.FINANCAS_SENHA) {
    return { props: { ok: false, erro: 'FINANCAS_SENHA não configurada no servidor.' } };
  }
  if (!autenticado(req)) {
    return { props: { ok: false, erro: query.erro === '1' ? 'Senha incorreta.' : null } };
  }
  try {
    return { props: { ok: true, d: await dashboard(mesValido(query.mes)) } };
  } catch (e) {
    console.error('dashboard financas falhou:', e);
    return { props: { ok: false, erro: 'Não consegui ler o banco agora.' } };
  }
}
