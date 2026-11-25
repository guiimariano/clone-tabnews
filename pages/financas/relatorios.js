// GERADO por financas-casal/scripts/sync-webhook.mjs — não edite aqui.
// A fonte e os testes ficam no projeto privado financas-casal.
// /financas/relatorios — receita x despesa, composição por grupo, fluxo do
// dinheiro no mês e a planilha categoria x mês.
import { useRouter } from 'next/router';
import { autenticado } from '../../lib/financas/auth.js';
import { relatorios, mesValido } from '../../lib/financas/dados.js';
import { Layout, Portao, SeletorMes, brl, brl0, pct, rotuloMes, mesLongo } from '../../components/financas/base.js';
import { ReceitaDespesa, Empilhadas, Fluxo } from '../../components/financas/graficos.js';

export default function Relatorios({ ok, erro, d }) {
  const router = useRouter();
  if (!ok) return <Portao erro={erro} />;
  const { mes, mesAtual } = d;

  const meses = [...new Set(d.porTipo.map((r) => r.mes_ref))].sort();
  const primeiro = meses[0];
  const parcial = (m) => m === primeiro || m >= mesAtual;
  const soma = (m, tipo) => d.porTipo.filter((r) => r.mes_ref === m && r.tipo === tipo).reduce((a, r) => a + r.valor, 0);
  const serie = meses.map((m) => ({ mes: m, receita: soma(m, 'entrada'), despesa: soma(m, 'saida'), parcial: parcial(m) }));

  const empilhadas = meses.map((m) => {
    const grupos = {};
    for (const r of d.porGrupo.filter((x) => x.mes_ref === m)) grupos[r.slug ?? '_sem'] = (grupos[r.slug ?? '_sem'] ?? 0) + r.valor;
    return { mes: m, grupos, total: Object.values(grupos).reduce((a, v) => a + v, 0), parcial: parcial(m) };
  });

  // médias só sobre meses completos: o primeiro (parcial) e os em aberto distorcem
  const completos = serie.filter((s) => !s.parcial);
  const mediaRec = completos.reduce((a, s) => a + s.receita, 0) / (completos.length || 1);
  const mediaDesp = completos.reduce((a, s) => a + s.despesa, 0) / (completos.length || 1);

  // planilha categoria x mês
  const cats = {};
  for (const r of d.porCategoria) {
    cats[r.slug] ??= { slug: r.slug, nome: r.nome, grupo: r.grupo, por: {}, total: 0 };
    cats[r.slug].por[r.mes_ref] = (cats[r.slug].por[r.mes_ref] ?? 0) + r.valor;
    if (!parcial(r.mes_ref)) cats[r.slug].total += r.valor;
  }
  const linhasCat = Object.values(cats).sort((a, b) => b.total - a.total);
  const maxCel = Math.max(1, ...linhasCat.flatMap((c) => Object.values(c.por)));

  const catsMes = linhasCat.filter((c) => c.por[mes] > 0).map((c) => ({ slug: c.slug, nome: c.nome, grupo: c.grupo, valor: c.por[mes] }));

  return (
    <Layout ativo="relatorios" titulo="Relatórios" largo sub={`${meses.length} meses de histórico · médias só sobre ${completos.length} meses completos`}>

      <section className="tiles">
        <div className="tile"><div className="tile-rotulo">Receita média</div><div className="tile-valor tab pos">R$ {brl0(mediaRec)}</div></div>
        <div className="tile"><div className="tile-rotulo">Despesa média</div><div className="tile-valor tab neg">R$ {brl0(mediaDesp)}</div></div>
        <div className="tile"><div className="tile-rotulo">Resultado médio</div>
          <div className={`tile-valor tab ${mediaRec - mediaDesp < 0 ? 'neg' : 'pos'}`}>R$ {brl0(mediaRec - mediaDesp)}</div>
          <div className="tile-nota">{mediaRec ? `poupança de ${pct(((mediaRec - mediaDesp) / mediaRec) * 100)}` : ''}</div></div>
        <div className="tile"><div className="tile-rotulo">Meses no vermelho</div>
          <div className="tile-valor tab">{completos.filter((s) => s.despesa > s.receita).length} de {completos.length}</div></div>
      </section>

      <div className="grade g2">
        <section className="cartao">
          <h2>Receita × despesa</h2>
          <ReceitaDespesa meses={serie} destaque={mes} aoClicar={(m) => router.push(`/financas/relatorios?mes=${m.slice(0, 7)}`)} />
        </section>
        <section className="cartao">
          <h2>Despesa por grupo</h2>
          <Empilhadas meses={empilhadas} />
        </section>
      </div>

      <section className="cartao" style={{ marginBottom: 16 }}>
        <div className="cartao-topo">
          <h2>Para onde vai cada real · {mesLongo(mes)}</h2>
          <SeletorMes mes={mes} base="/financas/relatorios" />
        </div>
        <Fluxo entradas={d.entradasMes} categorias={catsMes} />
        <p className="nota">Receitas à esquerda, grupos no meio, categorias à direita. Se a despesa passou da receita,
          a diferença aparece como “Déficit”: saiu de saldo, reserva ou limite do cartão.</p>
      </section>

      <section className="cartao" style={{ padding: 0, marginBottom: 16 }}>
        <div style={{ padding: '16px 18px 4px' }}>
          <h2>Categoria × mês</h2>
          <p className="desc">Cor mais forte, mais gasto. Clique numa célula para ver as transações. Média e total só sobre meses completos.</p>
        </div>
        <div className="rolagem">
          <table className="heat">
            <thead>
              <tr>
                <th>Categoria</th>
                {meses.map((m) => <th key={m} className="num">{rotuloMes(m)}{parcial(m) ? '*' : ''}</th>)}
                <th className="num">Média</th><th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {linhasCat.map((c) => (
                <tr key={c.slug}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <span className="chip" style={{ background: `var(--s-${c.slug === '_sem' ? '_sem' : c.grupo ?? '_sem'})`, marginRight: 8 }} />{c.nome}
                  </td>
                  {meses.map((m) => {
                    const v = c.por[m] ?? 0;
                    return (
                      <td key={m} className="num tab cel"
                          style={{ background: v ? `color-mix(in srgb, var(--s-custo_fixo) ${Math.round(8 + (v / maxCel) * 55)}%, transparent)` : undefined }}
                          title={`${c.nome} · ${rotuloMes(m)}: R$ ${brl(v)}`}
                          onClick={() => v && router.push(`/financas/transacoes?mes=${m.slice(0, 7)}&categoria=${c.slug}`)}>
                        {v ? brl0(v) : ''}
                      </td>
                    );
                  })}
                  <td className="num tab"><strong>{brl0(c.total / (completos.length || 1))}</strong></td>
                  <td className="num tab muted">{brl0(c.total)}</td>
                </tr>
              ))}
              <tr className="total">
                <td>Total</td>
                {meses.map((m) => <td key={m} className="num tab">{brl0(soma(m, 'saida'))}</td>)}
                <td className="num tab">{brl0(mediaDesp)}</td>
                <td className="num tab">{brl0(completos.reduce((a, s) => a + s.despesa, 0))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="cartao">
        <h2>Resultado mês a mês</h2>
        <div className="rolagem">
          <table>
            <thead><tr><th>Mês</th><th className="num">Receita</th><th className="num">Despesa</th><th className="num">Resultado</th><th className="num">Poupança</th></tr></thead>
            <tbody>
              {[...serie].reverse().map((s) => (
                <tr key={s.mes} className={s.parcial ? 'muted' : undefined}>
                  <td>{rotuloMes(s.mes)}{s.parcial ? ' *' : ''}</td>
                  <td className="num tab">{brl0(s.receita)}</td>
                  <td className="num tab">{brl0(s.despesa)}</td>
                  <td className={`num tab ${s.receita - s.despesa < 0 ? 'neg' : 'pos'}`}>{brl0(s.receita - s.despesa)}</td>
                  <td className="num tab">{s.receita ? pct(((s.receita - s.despesa) / s.receita) * 100) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="nota">* mês parcial: o primeiro (o histórico da Pluggy começa em 27/11/2025) e os ainda em aberto.</p>
      </section>

      <style jsx global>{`
        .viz-root .heat td.cel { cursor: pointer; min-width: 62px; }
        .viz-root .heat th:first-child, .viz-root .heat td:first-child { position: sticky; left: 0; background: var(--surface); z-index: 1; }
        .viz-root .heat tr.total td { font-weight: 600; border-top: 2px solid var(--linha); }
        .viz-root tr.muted td { color: var(--ink-3); }
      `}</style>
    </Layout>
  );
}

export async function getServerSideProps({ req, query }) {
  if (!process.env.FINANCAS_SENHA || !autenticado(req)) return { props: { ok: false, erro: null } };
  try {
    return { props: { ok: true, d: await relatorios(mesValido(query.mes)) } };
  } catch (e) {
    console.error('relatórios falhou:', e);
    return { props: { ok: false, erro: 'Não consegui ler o banco agora.' } };
  }
}
