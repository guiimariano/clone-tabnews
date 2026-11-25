// GERADO por financas-casal/scripts/sync-webhook.mjs — não edite aqui.
// A fonte e os testes ficam no projeto privado financas-casal.
// /financas/orcamento — o plano daqui pra frente.
//
// Tetos por categoria (editáveis), o ritmo do mês contra eles, os grupos
// do orçamento doméstico contra a referência, e as metas de 2027. O
// histórico não tinha plano: a mediana aparece como referência, nunca
// como "estourou".
import { useState } from 'react';
import { autenticado } from '../../lib/financas/auth.js';
import { orcamento, mesValido } from '../../lib/financas/dados.js';
import { Layout, Portao, Tile, SeletorMes, brl, brl0, pct, mesLongo, estado, NOME_GRUPO, rotuloMes } from '../../components/financas/base.js';

function Teto({ c, aoSalvar }) {
  const [v, setV] = useState(c.limite ?? '');
  const [st, setSt] = useState(null);
  async function salvar() {
    const n = Number(String(v).replace(/\./g, '').replace(',', '.'));
    if (!Number.isFinite(n) || n < 0 || n === c.limite) return;
    setSt('…');
    const r = await fetch('/api/financas/teto', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ categoria_id: c.id, valor: n }),
    });
    if (r.ok) { setSt('✓'); aoSalvar(n); setTimeout(() => setSt(null), 1500); } else setSt('erro');
  }
  return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
      <input className="in-teto tab" inputMode="decimal" value={v} aria-label={`teto de ${c.nome}`}
             onChange={(e) => setV(e.target.value)} onBlur={salvar}
             onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
      {st && <span className={st === 'erro' ? 'neg' : 'muted'} style={{ fontSize: '0.75rem' }}>{st}</span>}
    </span>
  );
}

export default function Orcamento({ ok, erro, d }) {
  const [cats, setCats] = useState(d?.categorias ?? []);
  if (!ok) return <Portao erro={erro} />;

  const { mes, mesAtual, hoje, diasMes, plano, metas, grupos } = d;
  const corrente = mes === mesAtual;
  const fracao = corrente ? hoje / diasMes : 1;

  const variaveis = cats.filter((c) => c.tipo === 'variavel');
  const outras = cats.filter((c) => c.tipo !== 'variavel' && (c.gasto > 0 || c.mediana > 0));
  const somaTeto = variaveis.reduce((a, c) => a + (c.limite ?? 0), 0);
  const somaGasto = variaveis.reduce((a, c) => a + c.gasto, 0);
  const pedemMetas = metas.reduce((a, m) => a + (m.aporte_mensal_necessario ?? 0), 0);
  const folgaLocal = plano.renda_prevista - plano.fixos_previstos - plano.aporte_metas - somaTeto;

  const maxG = Math.max(1, ...grupos.map((g) => Math.max(g.real, g.ref)));

  return (
    <Layout ativo="orcamento" titulo="Orçamento" sub={`${mesLongo(mes)} · tetos valem daqui pra frente`}
            acoes={<SeletorMes mes={mes} base="/financas/orcamento" />}>

      <section className="tiles">
        <Tile rotulo="Renda prevista" valor={`R$ ${brl0(plano.renda_prevista)}`} nota="recorrências de entrada" />
        <Tile rotulo="Fixos" valor={`R$ ${brl0(plano.fixos_previstos)}`} nota="moradia, contas, assinaturas" />
        <Tile rotulo="Metas" valor={`R$ ${brl0(plano.aporte_metas)}`} nota={`${metas.length} metas até dez/27`} />
        <Tile rotulo="Tetos variáveis" valor={`R$ ${brl0(somaTeto)}`} nota={`gasto: R$ ${brl0(somaGasto)}`} />
        <Tile rotulo="Folga do plano" valor={`R$ ${brl0(folgaLocal)}`} tom={folgaLocal < 0 ? 'critico' : folgaLocal < 500 ? 'atencao' : 'ok'}
              nota={folgaLocal < 0 ? 'o plano não fecha' : 'sobra prevista'} />
      </section>

      {folgaLocal < 0 && (
        <section className="cartao alerta">
          <strong>O plano não fecha em R$ {brl0(-folgaLocal)}.</strong>{' '}
          As metas pedem R$ {brl0(pedemMetas)}/mês ({pct((pedemMetas / plano.renda_prevista) * 100)} da renda). Para fechar:
          baixar tetos aqui, estender o prazo de alguma meta, ou aceitar um ritmo de metas menor por enquanto.
        </section>
      )}

      <section className="cartao" style={{ marginBottom: 16 }}>
        <div className="cartao-topo">
          <h2>Tetos por categoria</h2>
          <span className="muted" style={{ fontSize: '0.82rem' }}>
            {corrente ? `dia ${hoje} de ${diasMes} — a marca tracejada é onde o gasto deveria estar hoje` : ''}
          </span>
        </div>
        <div className="rolagem">
          <table className="tab-orc">
            <thead>
              <tr>
                <th>Categoria</th><th style={{ width: '32%' }}></th><th className="num">Gasto</th>
                <th className="num">Teto</th><th className="num">Resta</th>
                {corrente && <th className="num">Projeção</th>}
                <th className="num">Antes (mediana 6m)</th><th></th>
              </tr>
            </thead>
            <tbody>
              {variaveis.map((c) => {
                const proj = corrente && hoje ? (c.gasto / hoje) * diasMes : c.gasto;
                const e = estado(c.limite ? ((corrente ? proj : c.gasto) / c.limite) * 100 : null);
                const max = Math.max(c.limite ?? 0, c.gasto, 1);
                return (
                  <tr key={c.id}>
                    <td><span className="chip" style={{ background: `var(--s-${c.grupo ?? '_sem'})`, marginRight: 8 }} />{c.nome}</td>
                    <td>
                      <div className="trilha">
                        <div className={`preench est-${e.chave}`} style={{ width: `${(c.gasto / max) * 100}%` }} />
                        {c.limite > 0 && <div className="marca-teto" style={{ left: `${(c.limite / max) * 100}%` }} />}
                        {corrente && c.limite > 0 && <div className="marca-hoje" style={{ left: `${((c.limite * fracao) / max) * 100}%` }} />}
                      </div>
                    </td>
                    <td className="num tab">{brl0(c.gasto)}</td>
                    <td className="num"><Teto c={c} aoSalvar={(n) => setCats((cs) => cs.map((x) => (x.id === c.id ? { ...x, limite: n } : x)))} /></td>
                    <td className={`num tab ${c.limite && c.gasto > c.limite ? 'neg' : ''}`}>{c.limite ? brl0(c.limite - c.gasto) : '—'}</td>
                    {corrente && <td className="num tab">{brl0(proj)}</td>}
                    <td className="num tab muted">{c.mediana === null ? '—' : brl0(c.mediana)}</td>
                    <td><span className={`est est-${e.chave}`}>{e.icone} {e.rotulo}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="nota">
          Clique no teto para editar; salva ao sair do campo. “Projeção” é o gasto de hoje esticado até o fim do mês,
          e o estado usa a projeção, não o gasto atual — no dia 5 tudo parece dentro.
        </p>
        {outras.length > 0 && (
          <>
            <h2 style={{ marginTop: 22 }}>Fixos e eventuais (sem teto)</h2>
            <p className="desc">Não têm teto porque não se controlam no dia a dia: entram no plano como fixo previsto.</p>
            <table>
              <tbody>
                {outras.map((c) => (
                  <tr key={c.id}>
                    <td><span className="chip" style={{ background: `var(--s-${c.grupo ?? '_sem'})`, marginRight: 8 }} />{c.nome}
                      <span className="muted" style={{ fontSize: '0.75rem' }}> · {c.tipo}</span></td>
                    <td className="num tab">{brl0(c.gasto)}</td>
                    <td className="num tab muted">antes ~{c.mediana === null ? '—' : brl0(c.mediana)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>

      <div className="grade g2">
        <section className="cartao">
          <h2>Grupos contra a referência</h2>
          <p className="desc">Média dos 3 meses fechados (círculo cheio) contra a fatia de referência sobre a renda (vazado).</p>
          {grupos.map((g) => {
            const real = (g.real / maxG) * 100, ref = (g.ref / maxG) * 100;
            const desvio = plano.renda_prevista ? ((g.real - g.ref) / plano.renda_prevista) * 100 : 0;
            return (
              <div key={g.slug} className="db-linha">
                <div className="db-nome"><span className="chip" style={{ background: `var(--s-${g.slug})` }} />{NOME_GRUPO[g.slug] ?? g.nome}</div>
                <div className="db-trilha">
                  <div className="db-conector" style={{ left: `${Math.min(real, ref)}%`, width: `${Math.abs(real - ref)}%` }} />
                  <div className="db-ponto db-ref" style={{ left: `${ref}%` }} title={`referência R$ ${brl(g.ref)}`} />
                  <div className="db-ponto" style={{ left: `${real}%`, background: `var(--s-${g.slug})` }} title={`real R$ ${brl(g.real)}`} />
                </div>
                <div className="db-num tab">{brl0(g.real)} <span className="muted">/ {brl0(g.ref)}</span>{' '}
                  <span className={desvio > 0 ? 'neg' : 'muted'}>{desvio > 0 ? '▲' : '▼'}{Math.abs(desvio).toFixed(1)}pp</span></div>
              </div>
            );
          })}
        </section>

        <section className="cartao">
          <h2>Metas</h2>
          <p className="desc">
            Juntas pedem <strong className="tab">R$ {brl0(pedemMetas)}/mês</strong>
            {plano.renda_prevista ? ` (${pct((pedemMetas / plano.renda_prevista) * 100)} da renda)` : ''}.
          </p>
          {metas.map((m) => (
            <div key={m.slug} className="meta">
              <div className="meta-topo">
                <strong>{m.nome}</strong>
                <span className="tab">{brl0(m.acumulado)} de {brl0(m.valor_alvo)}</span>
              </div>
              <div className="trilha"><div className="preench" style={{ background: 'var(--s-metas)', width: `${Math.min(100, m.pct ?? 0)}%` }} /></div>
              <div className="meta-pe">
                <span>{pct(m.pct ?? 0, 1)}</span>
                {m.aporte_mensal_necessario
                  ? <span>precisa de <strong className="tab">R$ {brl(m.aporte_mensal_necessario)}/mês</strong></span>
                  : <span className="muted">sem prazo</span>}
                {m.data_alvo && <span className="muted">até {rotuloMes(m.data_alvo)} · {m.meses_restantes} meses</span>}
              </div>
            </div>
          ))}
        </section>
      </div>

      <style jsx global>{`
        .viz-root .alerta { box-shadow: inset 4px 0 0 var(--critico); margin-bottom: 16px; font-size: 0.9rem; }
        .viz-root .tab-orc td { padding: 7px 8px; }
        .viz-root .in-teto { width: 86px; text-align: right; padding: 3px 6px; font-size: 0.84rem;
          border-color: transparent; background: transparent; }
        .viz-root .in-teto:hover, .viz-root .in-teto:focus { border-color: var(--linha); background: var(--surface); }
        .viz-root .db-linha { display: grid; grid-template-columns: 150px 1fr 150px; gap: 12px; align-items: center; padding: 7px 0; }
        .viz-root .db-nome { display: flex; align-items: center; gap: 8px; font-size: 0.88rem; }
        .viz-root .db-trilha { position: relative; height: 16px; }
        .viz-root .db-trilha::before { content: ''; position: absolute; left: 0; right: 0; top: 7px; height: 2px; background: var(--linha); }
        .viz-root .db-conector { position: absolute; top: 7px; height: 2px; background: var(--ink-3); }
        .viz-root .db-ponto { position: absolute; top: 2px; width: 12px; height: 12px; border-radius: 50%; transform: translateX(-6px);
          box-shadow: 0 0 0 2px var(--surface); }
        .viz-root .db-ref { background: var(--surface); border: 2px solid var(--ink-3); }
        .viz-root .db-num { font-size: 0.8rem; text-align: right; }
        .viz-root .meta { padding: 10px 0; border-bottom: 1px solid var(--linha); }
        .viz-root .meta:last-of-type { border-bottom: 0; }
        .viz-root .meta-topo { display: flex; justify-content: space-between; gap: 12px; font-size: 0.9rem; margin-bottom: 7px; }
        .viz-root .meta-pe { display: flex; gap: 16px; font-size: 0.8rem; color: var(--ink-2); margin-top: 6px; flex-wrap: wrap; }
        @media (max-width: 640px) {
          .viz-root .db-linha { grid-template-columns: 1fr; gap: 4px; }
          .viz-root .db-num { text-align: left; }
        }
      `}</style>
    </Layout>
  );
}

export async function getServerSideProps({ req, query }) {
  if (!process.env.FINANCAS_SENHA || !autenticado(req)) return { props: { ok: false, erro: null } };
  try {
    return { props: { ok: true, d: await orcamento(mesValido(query.mes)) } };
  } catch (e) {
    console.error('orçamento falhou:', e);
    return { props: { ok: false, erro: 'Não consegui ler o banco agora.' } };
  }
}
