// GERADO por financas-casal/scripts/sync-webhook.mjs — não edite aqui.
// A fonte e os testes ficam no projeto privado financas-casal.
// Painel em /financas. Renderizado no servidor: os dados nunca chegam ao
// cliente sem o cookie de sessão válido.
//
// Gráficos em SVG à mão, sem biblioteca: três formas, escolhidas pela
// função que cada uma cumpre, e paleta validada (ver comentário da
// PALETA abaixo).
import { useState } from 'react';
import Head from 'next/head';
import { autenticado } from '../lib/financas/auth.js';
import { painel } from '../lib/financas/dados.js';

// Paleta categórica validada para separação sob daltonismo nos dois modos
// (adjacent CVD ΔE 9.1 claro / 8.4 escuro; normal 19.6 / 19.3). A ORDEM é
// o mecanismo de segurança, não enfeite: atribuída por grupo fixo, nunca
// ciclada. Status é paleta separada e nunca vira "série 7".
const PALETA = {
  custo_fixo:   { claro: '#2a78d6', escuro: '#3987e5' },
  conforto:     { claro: '#eb6834', escuro: '#d95926' },
  metas:        { claro: '#1baf7a', escuro: '#199e70' },
  prazeres:     { claro: '#eda100', escuro: '#c98500' },
  liberdade:    { claro: '#e87ba4', escuro: '#d55181' },
  conhecimento: { claro: '#008300', escuro: '#008300' },
};
const ORDEM = ['custo_fixo', 'conforto', 'metas', 'prazeres', 'liberdade', 'conhecimento'];

const brl = (v) =>
  Number(v ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const brl0 = (v) => Number(v ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const rotuloMes = (iso) => `${MES[Number(iso.slice(5, 7)) - 1]}/${iso.slice(2, 4)}`;

// Estado do mês do plano contra o teto — sempre com rótulo, nunca cor
// sozinha. Só se aplica ao mês planejado: o histórico não tinha plano,
// então não "estourou" nada, e o painel não diz isso dele.
function estado(pct) {
  if (pct === null || pct === undefined) return { chave: 'neutro', rotulo: '—', icone: '' };
  if (pct > 100) return { chave: 'critico', rotulo: 'passou do teto', icone: '▲' };
  if (pct >= 80) return { chave: 'atencao', rotulo: 'perto do teto', icone: '●' };
  return { chave: 'ok', rotulo: 'dentro', icone: '✓' };
}

/* ---------------------------------------------------------------- tiles */
function Tile({ rotulo, valor, nota, tom = 'neutro' }) {
  return (
    <div className={`tile tom-${tom}`}>
      <div className="tile-rotulo">{rotulo}</div>
      <div className="tile-valor">{valor}</div>
      {nota && <div className="tile-nota">{nota}</div>}
    </div>
  );
}

/* ------------------------------------------- barras empilhadas por mês */
function PorMes({ serie, parciais }) {
  const [dica, setDica] = useState(null);
  const meses = [...new Set(serie.map((r) => r.mes_ref))].sort();
  if (!meses.length) return <p className="vazio">Sem lançamentos ainda.</p>;

  const porMes = meses.map((m) => {
    const itens = ORDEM.map((slug) => ({
      slug,
      nome: serie.find((r) => r.slug === slug)?.nome ?? slug,
      valor: serie.filter((r) => r.mes_ref === m && r.slug === slug).reduce((a, r) => a + r.valor, 0),
    })).filter((x) => x.valor > 0);
    return { mes: m, itens, total: itens.reduce((a, x) => a + x.valor, 0) };
  });

  const max = Math.max(...porMes.map((m) => m.total), 1);
  const H = 240, L = 54, GAP = 2;

  return (
    <div className="gcont">
      <div className="barras" style={{ height: H + 46 }}>
        {porMes.map((m) => {
          let y = 0;
          const parcial = parciais.includes(m.mes);
          return (
            <div key={m.mes} className="col">
              <div className="valor-topo">{brl0(m.total)}</div>
              <svg width={L} height={H} role="img"
                   aria-label={`${rotuloMes(m.mes)}: R$ ${brl(m.total)}`}>
                {m.itens.map((it, i) => {
                  const h = Math.max((it.valor / max) * H - GAP, 1);
                  const topo = H - y - h;
                  y += h + GAP;
                  // Arredondado só na ponta do dado (segmento do topo); o
                  // resto fica reto, ancorado na base. Arredondar cada
                  // segmento transforma a pilha em contas de colar.
                  const pontaDoTopo = i === m.itens.length - 1;
                  return (
                    <rect key={it.slug} x="0" y={topo} width={L} height={h}
                      rx={pontaDoTopo ? 4 : 0}
                      fill={`var(--s-${it.slug})`}
                      opacity={parcial ? 0.55 : 1}
                      onMouseEnter={() => setDica({ mes: m.mes, ...it, total: m.total })}
                      onMouseLeave={() => setDica(null)} />
                  );
                })}
              </svg>
              <div className={`eixo-x${parcial ? ' parcial' : ''}`}>
                {rotuloMes(m.mes)}{parcial && <span className="aster">*</span>}
              </div>
            </div>
          );
        })}
      </div>
      {dica && (
        <div className="dica" role="status">
          <strong>{dica.nome}</strong> · {rotuloMes(dica.mes)}<br />
          R$ {brl(dica.valor)} <span className="muted">
            ({Math.round((dica.valor / dica.total) * 100)}% do mês)</span>
        </div>
      )}
      <Legenda />
      {parciais.length > 0 && (
        <p className="nota">
          <span className="aster">*</span> mês parcial: o extrato cobre de 27/08 a 24/11 e a fatura
          de novembro não fechou. Comparar esses meses com set e out subestima os dois extremos.
        </p>
      )}
    </div>
  );
}

function Legenda() {
  return (
    <ul className="legenda">
      {ORDEM.map((slug) => (
        <li key={slug}>
          <span className="chip" style={{ background: `var(--s-${slug})` }} />
          {slug.replace('_', ' ').replace('liberdade', 'liberdade financeira')}
        </li>
      ))}
    </ul>
  );
}

/* --------------------------------------- dumbbell: real vs referência */
// Comparar "real" com "referência mensal" só faz sentido sobre mês
// FECHADO. Usar o mês corrente põe tudo abaixo da referência no dia 5 e
// o gráfico passa a contradizer o que o texto afirma — foi o que
// aconteceu na primeira versão: custo fixo aparecia 32,8pp ABAIXO porque
// novembro estava no meio.
function RealVsRef({ grupos, renda, serie, mesesFechados }) {
  const media = (slug) => {
    if (!mesesFechados.length) return 0;
    const soma = mesesFechados.reduce(
      (a, m) => a + serie.filter((r) => r.mes_ref === m && r.slug === slug).reduce((b, r) => b + r.valor, 0),
      0
    );
    return soma / mesesFechados.length;
  };

  grupos = grupos.map((g) => {
    const gasto = media(g.slug);
    const pct = renda ? (gasto / renda) * 100 : null;
    return { ...g, gasto, pct_real: pct, desvio: pct === null ? null : pct - g.pct_ref };
  });

  const max = Math.max(...grupos.map((g) => Math.max(g.gasto ?? 0, g.valor_ref ?? 0)), 1);
  return (
    <div className="gcont">
      {grupos.map((g) => {
        const real = ((g.gasto ?? 0) / max) * 100;
        const ref = ((g.valor_ref ?? 0) / max) * 100;
        const acima = (g.gasto ?? 0) > (g.valor_ref ?? 0);
        return (
          <div key={g.slug} className="db-linha">
            <div className="db-nome">
              <span className="chip" style={{ background: `var(--s-${g.slug})` }} />
              {g.nome}
            </div>
            <div className="db-trilha">
              <div className="db-conector"
                   style={{ left: `${Math.min(real, ref)}%`, width: `${Math.abs(real - ref)}%` }} />
              <div className="db-ponto db-ref" style={{ left: `${ref}%` }}
                   title={`referência R$ ${brl(g.valor_ref)}`} />
              <div className="db-ponto db-real" style={{ left: `${real}%`, background: `var(--s-${g.slug})` }}
                   title={`hoje R$ ${brl(g.gasto)}`} />
            </div>
            <div className="db-num">
              <span className="tab">{brl0(g.gasto)}</span>
              <span className="muted"> / {brl0(g.valor_ref)}</span>
              <span className={acima ? 'des-acima' : 'des-abaixo'}>
                {' '}{acima ? '▲' : '▼'} {Math.abs(g.desvio ?? 0).toFixed(1)}pp
              </span>
            </div>
          </div>
        );
      })}
      <p className="nota">
        Círculo cheio: a média dos <strong>meses fechados</strong>
        {mesesFechados.length ? ` (${mesesFechados.map(rotuloMes).join(' e ')})` : ''}.
        Círculo vazado: a fatia de referência do modelo sobre a renda de R$ {brl(renda)}.
        A distância é o desvio. O mês em andamento fica fora de propósito — incluí-lo colocaria
        todo grupo abaixo da referência até o dia 30.
      </p>
    </div>
  );
}

/* ------------------------------- barras horizontais com marca de limite */
function Barras({ itens, campo, rotuloCampo }) {
  const max = Math.max(...itens.map((i) => Math.max(i[campo] ?? 0, i.limite ?? 0)), 1);
  return (
    <div className="gcont">
      {itens.map((i) => {
        const v = i[campo] ?? 0;
        const pct = i.limite ? (v / i.limite) * 100 : null;
        const e = estado(pct);
        return (
          <div key={i.slug} className="hb-linha">
            <div className="hb-nome">{i.nome}</div>
            <div className="hb-trilha">
              <div className={`hb-fill est-${e.chave}`} style={{ width: `${(v / max) * 100}%` }} />
              {i.limite > 0 && (
                <div className="hb-limite" style={{ left: `${(i.limite / max) * 100}%` }}
                     title={`limite R$ ${brl(i.limite)}`} />
              )}
            </div>
            <div className="hb-num">
              <span className="tab">{brl0(v)}</span>
              {i.limite > 0 && <span className="muted"> de {brl0(i.limite)}</span>}
              {i.ref > 0 && <div className="hb-ref muted">antes ~{brl0(i.ref)}/mês</div>}
            </div>
            <div className={`hb-est est-${e.chave}`}>
              <span aria-hidden="true">{e.icone}</span> {e.rotulo}
            </div>
          </div>
        );
      })}
      <p className="nota">
        Barra: {rotuloCampo}. Marca vertical: o teto planejado. Estado por ícone e texto, não só por cor.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------- metas */
function Metas({ metas, plano }) {
  if (!metas.length) return <p className="vazio">Nenhuma meta ativa.</p>;
  const pedem = metas.reduce((a, m) => a + (m.aporte_mensal_necessario ?? 0), 0);
  return (
    <div className="gcont">
      <p className="metas-resumo">
        Juntas pedem <strong className="tab">R$ {brl0(pedem)}/mês</strong>
        {' '}({((pedem / plano.renda_prevista) * 100).toFixed(0)}% da renda).
        {' '}Depois de fixos e metas, sobram <strong className="tab">R$ {brl0(plano.disponivel_variaveis)}</strong>
        {' '}para os variáveis, cujos tetos somam R$ {brl0(plano.limites_variaveis)}.
      </p>
      {metas.map((m) => (
        <div key={m.slug} className="meta">
          <div className="meta-topo">
            <span className="meta-nome">
              {m.nome}
              {m.bloqueante && <span className="tag">bloqueia as outras</span>}
            </span>
            <span className="tab">{brl0(m.acumulado)} de {brl0(m.valor_alvo)}</span>
          </div>
          <div className="meta-trilha">
            <div className="meta-fill" style={{ width: `${Math.min(m.pct ?? 0, 100)}%` }} />
          </div>
          <div className="meta-pe">
            <span>{(m.pct ?? 0).toFixed(1)}%</span>
            {m.aporte_mensal_necessario
              ? <span>ritmo necessário <strong>R$ {brl(m.aporte_mensal_necessario)}/mês</strong></span>
              : <span className="muted">sem prazo</span>}
            <span className="muted">falta R$ {brl0(m.falta)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------- página */
export default function Financas({ ok, erro, dados }) {
  if (!ok) return <Portao erro={erro} />;

  const { plano, grupos, serie, categorias, metas, pendentes, maiores, baseline, pagadores, cego,
          abertas, mesAtual, mesPlano } = dados;
  const meses = [...new Set(serie.map((r) => r.mes_ref))].sort();
  // Parciais: o primeiro mês (o extrato começa no dia 27), o corrente e
  // o do plano, que ainda está enchendo.
  const parciais = [meses[0], ...meses.filter((m) => m >= mesAtual)].filter(Boolean);
  const mesP = rotuloMes(mesPlano);
  // Plano: gasto do mês planejado contra o teto, com o que costumava ser
  // gasto (mediana dos meses fechados) só como referência.
  const refPor = Object.fromEntries(baseline.map((b) => [b.slug, b.mediana]));
  const planoCats = categorias.map((c) => ({ ...c, ref: refPor[c.slug] }));
  const totalAberto = abertas.reduce((a, x) => a + x.valor, 0);
  const mesesFechados = meses.filter((m) => !parciais.includes(m));
  const folgaTom = plano.folga < 0 ? 'critico' : plano.folga < 500 ? 'atencao' : 'ok';

  return (
    <>
      <Head><title>Finanças</title><meta name="robots" content="noindex, nofollow" /></Head>
      <div className="viz-root">
        <header>
          <div>
            <h1>Finanças</h1>
            <p className="sub">
              {meses.length} meses medidos · planejando {mesP}
            </p>
          </div>
          <a className="conectar" href="/financas/conectar">conectar bancos</a>
          <form method="POST" action="/api/financas/login">
            <input type="hidden" name="acao" value="sair" />
            <button type="submit" className="sair">sair</button>
          </form>
        </header>

        <section className="tiles">
          <Tile rotulo={`Renda de ${mesP}`} valor={`R$ ${brl0(plano.renda_prevista)}`}
                nota="salários + benefício" />
          <Tile rotulo="Fixos previstos" valor={`R$ ${brl0(plano.fixos_previstos)}`}
                nota="moradia, contas, telefone" />
          <Tile rotulo="Disponível p/ variáveis" valor={`R$ ${brl0(plano.disponivel_variaveis)}`}
                nota={`depois de R$ ${brl0(plano.aporte_metas)} de metas`} />
          <Tile rotulo="Folga" valor={`R$ ${brl0(plano.folga)}`} tom={folgaTom}
                nota={plano.folga < 0 ? 'o plano não fecha' : 'sobra prevista'} />
        </section>

        {abertas.length > 0 && (
          <section className="abertas">
            <h2>Contas em aberto · {mesP}</h2>
            <p className="desc">O que sai quando a renda cair na virada do mês.</p>
            <div className="cego-linhas">
              {abertas.map((a) => (
                <div key={a.slug}>
                  <span className="tab">R$ {brl0(a.valor)}</span>
                  <span className="muted"> · {a.nome}
                    {a.previsao ? ' — previsão, troca pelo valor real quando o débito sair'
                                : ` — ${a.n} compras até agora, fatura ainda aberta`}</span>
                </div>
              ))}
              <div className="cego-total">
                <span className="tab">R$ {brl0(totalAberto)}</span>
                <span className="muted"> em aberto</span>
              </div>
            </div>
          </section>
        )}

        {cego.totalMes > 0 && (
          <section className="cego">
            <h2>Fora do orçamento</h2>
            <p className="desc">
              A folga acima confronta só as categorias <strong>com limite</strong>. Isto sai
              do bolso e não entra em nenhum teto, então uma folga perto de zero pode tranquilizar sem base.
            </p>
            <div className="cego-linhas">
              <div>
                <span className="tab">R$ {brl0(cego.extraMes)}</span>
                <span className="muted"> /mês em média · compras adicionais — o que a fatura do
                Santander passa de R$ 500, fora do padrão e sem teto</span>
              </div>
              <div>
                <span className="tab">R$ {brl0(cego.semCategoriaMes)}</span>
                <span className="muted"> /mês · lançamentos sem categoria, quase todos pessoa física
                e autônomo</span>
              </div>
              <div className="cego-total">
                <span className="tab">R$ {brl0(cego.totalMes)}</span>
                <span className="muted"> /mês invisível para o limite
                {' '}({((cego.totalMes / plano.renda_prevista) * 100).toFixed(1)}% da renda)</span>
              </div>
            </div>
          </section>
        )}

        <section>
          <h2>Para onde o dinheiro vai, mês a mês</h2>
          <p className="desc">
            Cada barra é um mês, repartida pelos seis grupos do orçamento doméstico.
          </p>
          <PorMes serie={serie} parciais={parciais} />
        </section>

        <section>
          <h2>Onde vocês estão contra a referência</h2>
          <p className="desc">
            Média dos meses fechados contra a fatia de referência de cada grupo. O desequilíbrio
            não está no prazer — está no custo fixo, e os grupos que constroem futuro estão em zero.
          </p>
          <RealVsRef grupos={grupos} renda={plano.renda_prevista}
                     serie={serie} mesesFechados={mesesFechados} />
        </section>

        <section>
          <h2>Plano de {mesP}</h2>
          <p className="desc">
            O teto de cada categoria daqui pra frente e quanto já foi gasto em {mesP}.
            O "antes" é a mediana dos meses medidos, sem plano — só referência, não meta.
            {pendentes.n > 0 && (
              <> Há <strong>{pendentes.n} lançamentos sem categoria</strong> (R$ {brl0(pendentes.valor)})
              — use <code>/classificar</code> no grupo.</>
            )}
          </p>
          <Barras itens={planoCats} campo="gasto" rotuloCampo={`gasto em ${mesP}`} />
        </section>

        <section>
          <h2>Metas</h2>
          <Metas metas={metas} plano={plano} />
        </section>

        <div className="duas">
          <section>
            <h2>Maiores destinos</h2>
            <div className="rolagem">
              <table>
                <thead><tr><th>Estabelecimento</th><th>Categoria</th><th className="num">x</th><th className="num">Total</th></tr></thead>
                <tbody>
                  {maiores.map((m, i) => (
                    <tr key={i}>
                      <td>{m.descricao}</td>
                      <td className="muted">{m.categoria}</td>
                      <td className="num">{m.n}</td>
                      <td className="num tab">{brl(m.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2>Quem gastou</h2>
            <p className="desc">Deduzido dos 4 dígitos do cartão na fatura.</p>
            <div className="rolagem">
              <table>
                <thead><tr><th>Pessoa</th><th className="num">Lançamentos</th><th className="num">Total</th><th className="num">Por mês</th></tr></thead>
                <tbody>
                  {pagadores.map((p) => (
                    <tr key={p.apelido}>
                      <td>{p.apelido}</td>
                      <td className="num">{p.n}</td>
                      <td className="num tab">{brl(p.valor)}</td>
                      <td className="num tab">{brl(p.valor / 3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <footer>
          Gerado em {new Date(dados.geradoEm).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
          {' '}· lançado pelo bot no Telegram
        </footer>
      </div>
      <Estilo />
    </>
  );
}

/* -------------------------------------------------------------- portão */
function Portao({ erro }) {
  return (
    <>
      <Head><title>Finanças</title><meta name="robots" content="noindex, nofollow" /></Head>
      <div className="viz-root portao">
        <form method="POST" action="/api/financas/login">
          <h1>Finanças</h1>
          <p className="sub">Painel privado.</p>
          <input type="password" name="senha" placeholder="senha" autoFocus
                 autoComplete="current-password" aria-label="senha" />
          <button type="submit">entrar</button>
          {erro && <p className="erro" role="alert">{erro}</p>}
        </form>
      </div>
      <Estilo />
    </>
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
    return { props: { ok: true, dados: await painel() } };
  } catch (e) {
    console.error('painel financas falhou:', e);
    return { props: { ok: false, erro: 'Não consegui ler o banco agora.' } };
  }
}

/* -------------------------------------------------------------- estilo */
function Estilo() {
  return (
    <style jsx global>{`
      .viz-root {
        color-scheme: light;
        --surface: #fcfcfb;
        --plano: #f9f9f7;
        --ink: #0b0b0b;
        --ink-2: #52514e;
        --ink-3: #85837c;
        --linha: #e4e3dd;
        --s-custo_fixo: #2a78d6;
        --s-conforto: #eb6834;
        --s-metas: #1baf7a;
        --s-prazeres: #eda100;
        --s-liberdade: #e87ba4;
        --s-conhecimento: #008300;
        --ok: #0ca30c;
        --atencao: #fab219;
        --critico: #d03b3b;
        --f: "Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif;
        --fd: "Cascadia Code", ui-monospace, Consolas, monospace;

        background: var(--plano);
        color: var(--ink);
        font-family: var(--f);
        min-height: 100vh;
        padding: 32px 20px 72px;
        box-sizing: border-box;
      }
      @media (prefers-color-scheme: dark) {
        :root:where(:not([data-theme="light"])) .viz-root {
          color-scheme: dark;
          --surface: #1a1a19;
          --plano: #0d0d0d;
          --ink: #ffffff;
          --ink-2: #c3c2b7;
          --ink-3: #8d8b82;
          --linha: #2e2e2b;
          --s-custo_fixo: #3987e5;
          --s-conforto: #d95926;
          --s-metas: #199e70;
          --s-prazeres: #c98500;
          --s-liberdade: #d55181;
          --s-conhecimento: #008300;
        }
      }
      :root[data-theme="dark"] .viz-root {
        color-scheme: dark;
        --surface: #1a1a19; --plano: #0d0d0d; --ink: #fff; --ink-2: #c3c2b7;
        --ink-3: #8d8b82; --linha: #2e2e2b;
        --s-custo_fixo: #3987e5; --s-conforto: #d95926; --s-metas: #199e70;
        --s-prazeres: #c98500; --s-liberdade: #d55181; --s-conhecimento: #008300;
      }

      .viz-root * { box-sizing: border-box; }
      .viz-root > * { max-width: 1060px; margin-left: auto; margin-right: auto; }
      .viz-root header { display: flex; justify-content: space-between; align-items: flex-start;
        gap: 16px; margin-bottom: 28px; }
      .viz-root h1 { margin: 0; font-size: 1.9rem; letter-spacing: -0.02em; }
      .viz-root h2 { margin: 0 0 4px; font-size: 1.12rem; letter-spacing: -0.01em; }
      .viz-root .sub, .viz-root .desc { margin: 0; color: var(--ink-2); font-size: 0.92rem; }
      .viz-root .desc { margin-bottom: 16px; max-width: 68ch; }
      .viz-root .muted { color: var(--ink-3); }
      .viz-root .tab { font-family: var(--fd); font-variant-numeric: tabular-nums; }
      .viz-root code { font-family: var(--fd); font-size: 0.86em; }
      .viz-root section { background: var(--surface); border: 1px solid var(--linha);
        border-radius: 10px; padding: 20px; margin-bottom: 18px; }
      .viz-root .nota { margin: 14px 0 0; font-size: 0.82rem; color: var(--ink-3); max-width: 70ch; }
      .viz-root .vazio { color: var(--ink-3); font-size: 0.92rem; margin: 0; }
      .viz-root .aster { color: var(--ink-3); }
      .viz-root footer { margin-top: 24px; font-size: 0.78rem; color: var(--ink-3);
        font-family: var(--fd); }
      .viz-root .sair { background: none; border: 1px solid var(--linha); color: var(--ink-2);
        padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 0.82rem; }

      .viz-root .tiles { display: grid; gap: 12px; margin-bottom: 18px; background: none;
        border: 0; padding: 0; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); }
      .viz-root .tile { background: var(--surface); border: 1px solid var(--linha);
        border-radius: 10px; padding: 16px 18px; }
      .viz-root .tile-rotulo { font-size: 0.74rem; text-transform: uppercase;
        letter-spacing: 0.08em; color: var(--ink-3); }
      .viz-root .tile-valor { font-family: var(--fd); font-variant-numeric: tabular-nums;
        font-size: 1.5rem; font-weight: 600; margin: 6px 0 2px; }
      .viz-root .tile-nota { font-size: 0.8rem; color: var(--ink-3); }
      .viz-root .tom-critico { border-left: 4px solid var(--critico); }
      .viz-root .tom-critico .tile-valor { color: var(--critico); }
      .viz-root .tom-atencao { border-left: 4px solid var(--atencao); }
      .viz-root .tom-ok { border-left: 4px solid var(--ok); }

      .viz-root .cego { border-left: 4px solid var(--atencao); }
      .viz-root .conectar { margin-left: auto; margin-right: 12px; font-size: 0.85rem; color: var(--ink-2); }
      .viz-root .abertas { border-left: 4px solid var(--critico); }
      .viz-root .hb-ref { font-size: 0.75rem; }
      .viz-root .metas-resumo { margin: 0 0 6px; font-size: 0.9rem; }
      .viz-root .cego-linhas { display: flex; flex-direction: column; gap: 8px; font-size: 0.88rem; }
      .viz-root .cego-linhas .tab { font-size: 1.05rem; font-weight: 600; }
      .viz-root .cego-total { border-top: 1px solid var(--linha); padding-top: 9px; margin-top: 3px; }

      .viz-root .gcont { position: relative; }
      .viz-root .barras { display: flex; gap: 20px; align-items: flex-end; overflow-x: auto;
        padding-bottom: 4px; }
      .viz-root .col { display: flex; flex-direction: column; align-items: center; }
      .viz-root .col svg { display: block; }
      .viz-root .col rect { cursor: pointer; }
      .viz-root .valor-topo { font-family: var(--fd); font-size: 0.76rem; color: var(--ink-2);
        margin-bottom: 6px; }
      .viz-root .eixo-x { font-size: 0.78rem; color: var(--ink-2); margin-top: 8px; }
      .viz-root .eixo-x.parcial { color: var(--ink-3); }
      .viz-root .dica { position: absolute; top: 0; right: 0; background: var(--surface);
        border: 1px solid var(--linha); border-radius: 8px; padding: 10px 12px;
        font-size: 0.84rem; box-shadow: 0 4px 14px rgba(0,0,0,.1); pointer-events: none; }
      .viz-root .legenda { list-style: none; display: flex; flex-wrap: wrap; gap: 6px 18px;
        padding: 0; margin: 16px 0 0; font-size: 0.82rem; color: var(--ink-2); }
      .viz-root .legenda li { display: flex; align-items: center; gap: 7px; }
      .viz-root .chip { width: 10px; height: 10px; border-radius: 3px; flex: none; }

      .viz-root .db-linha { display: grid; grid-template-columns: 170px 1fr 190px;
        gap: 14px; align-items: center; padding: 7px 0; }
      .viz-root .db-nome { display: flex; align-items: center; gap: 8px; font-size: 0.9rem; }
      .viz-root .db-trilha { position: relative; height: 16px; }
      .viz-root .db-trilha::before { content: ''; position: absolute; left: 0; right: 0; top: 7px;
        height: 2px; background: var(--linha); }
      .viz-root .db-conector { position: absolute; top: 7px; height: 2px; background: var(--ink-3); }
      .viz-root .db-ponto { position: absolute; top: 2px; width: 12px; height: 12px;
        border-radius: 50%; transform: translateX(-6px); }
      .viz-root .db-ref { background: var(--surface); border: 2px solid var(--ink-3); }
      .viz-root .db-real { box-shadow: 0 0 0 2px var(--surface); }
      .viz-root .db-num { font-size: 0.82rem; text-align: right; }
      .viz-root .des-acima { color: var(--critico); }
      .viz-root .des-abaixo { color: var(--ink-3); }

      .viz-root .hb-linha { display: grid; grid-template-columns: 136px 1fr 150px 86px;
        gap: 12px; align-items: center; padding: 5px 0; }
      .viz-root .hb-nome { font-size: 0.88rem; }
      .viz-root .hb-trilha { position: relative; height: 14px; background: var(--plano);
        border-radius: 4px; }
      .viz-root .hb-fill { height: 14px; border-radius: 4px; min-width: 2px; }
      .viz-root .hb-fill.est-ok { background: var(--ok); }
      .viz-root .hb-fill.est-atencao { background: var(--atencao); }
      .viz-root .hb-fill.est-critico { background: var(--critico); }
      .viz-root .hb-fill.est-neutro { background: var(--ink-3); }
      .viz-root .hb-limite { position: absolute; top: -3px; width: 2px; height: 20px;
        background: var(--ink); }
      .viz-root .hb-num { font-size: 0.82rem; text-align: right; }
      .viz-root .hb-est { font-size: 0.74rem; text-transform: uppercase; letter-spacing: 0.06em; }
      .viz-root .hb-est.est-ok { color: var(--ok); }
      .viz-root .hb-est.est-atencao { color: #8a6d0f; }
      .viz-root .hb-est.est-critico { color: var(--critico); }
      .viz-root .hb-est.est-neutro { color: var(--ink-3); }

      .viz-root .meta { padding: 10px 0; border-bottom: 1px solid var(--linha); }
      .viz-root .meta:last-of-type { border-bottom: 0; }
      .viz-root .meta-topo { display: flex; justify-content: space-between; gap: 12px;
        font-size: 0.9rem; margin-bottom: 7px; }
      .viz-root .meta-nome { display: flex; align-items: center; gap: 8px; }
      .viz-root .tag { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.06em;
        border: 1px solid var(--critico); color: var(--critico); padding: 1px 6px; border-radius: 4px; }
      .viz-root .meta-trilha { height: 10px; background: var(--plano); border-radius: 4px; }
      .viz-root .meta-fill { height: 10px; border-radius: 4px; background: var(--s-liberdade);
        min-width: 2px; }
      .viz-root .meta-pe { display: flex; gap: 18px; font-size: 0.8rem; color: var(--ink-2);
        margin-top: 6px; flex-wrap: wrap; }

      .viz-root .duas { display: grid; gap: 18px; grid-template-columns: repeat(auto-fit, minmax(330px, 1fr)); }
      .viz-root .duas section { margin-bottom: 0; }
      .viz-root .rolagem { overflow-x: auto; }
      .viz-root table { width: 100%; border-collapse: collapse; font-size: 0.86rem; }
      .viz-root th { text-align: left; font-size: 0.72rem; text-transform: uppercase;
        letter-spacing: 0.07em; color: var(--ink-3); font-weight: 500; padding: 6px 8px;
        border-bottom: 1px solid var(--linha); white-space: nowrap; }
      .viz-root td { padding: 6px 8px; border-bottom: 1px solid var(--linha); }
      .viz-root .num { text-align: right; }

      .viz-root.portao { display: flex; align-items: center; justify-content: center;
        min-height: 100vh; padding: 20px; }
      .viz-root.portao form { background: var(--surface); border: 1px solid var(--linha);
        border-radius: 12px; padding: 30px; width: 100%; max-width: 330px;
        display: flex; flex-direction: column; gap: 12px; }
      .viz-root.portao h1 { font-size: 1.4rem; }
      .viz-root.portao input { padding: 11px 13px; border: 1px solid var(--linha);
        border-radius: 7px; font-size: 1rem; background: var(--plano); color: var(--ink); }
      .viz-root.portao button { padding: 11px; border: 0; border-radius: 7px;
        background: var(--s-custo_fixo); color: #fff; font-size: 0.95rem; cursor: pointer; }
      .viz-root .erro { color: var(--critico); font-size: 0.86rem; margin: 0; }

      .viz-root :focus-visible { outline: 2px solid var(--s-custo_fixo); outline-offset: 2px; }

      @media (max-width: 680px) {
        .viz-root .db-linha { grid-template-columns: 1fr; gap: 4px; }
        .viz-root .db-num { text-align: left; }
        .viz-root .hb-linha { grid-template-columns: 1fr 1fr; }
        .viz-root .hb-trilha { grid-column: 1 / -1; }
      }
    `}</style>
  );
}
