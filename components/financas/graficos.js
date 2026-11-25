// GERADO por financas-casal/scripts/sync-webhook.mjs — não edite aqui.
// A fonte e os testes ficam no projeto privado financas-casal.
// Gráficos do painel, em SVG à mão. Cada forma escolhida pela função:
//   Rosca        composição de um total (despesa do mês por grupo)
//   Acumulado    ritmo dentro do mês contra a mediana dos meses anteriores
//   ReceitaDespesa  dois valores por mês, lado a lado, e o resultado
//   Empilhadas   composição ao longo do tempo (grupos por mês)
//   Fluxo        para onde vai cada real (receita -> grupo -> categoria)
// Cor categórica só por GRUPO (6 cores validadas). Receita/despesa usam o
// par de polaridade, nunca a paleta categórica.
import { useState } from 'react';
import { ORDEM, NOME_GRUPO, brl, brl0, rotuloMes } from './base.js';

const corGrupo = (g) => `var(--s-${ORDEM.includes(g) ? g : '_sem'})`;

/* ------------------------------------------------------------- rosca */
export function Rosca({ fatias, tamanho = 190, centro, rotuloCentro }) {
  const [foco, setFoco] = useState(null);
  const total = fatias.reduce((a, f) => a + f.valor, 0);
  if (!total) return <p className="vazio">Sem despesas no mês.</p>;
  const R = tamanho / 2, r = R * 0.62, cx = R, cy = R;
  let ang = -Math.PI / 2;
  const arcos = fatias.map((f) => {
    const a0 = ang, a1 = ang + (f.valor / total) * Math.PI * 2;
    ang = a1;
    const grande = a1 - a0 > Math.PI ? 1 : 0;
    const p = (a, raio) => [cx + raio * Math.cos(a), cy + raio * Math.sin(a)];
    // folga de 1px entre fatias para a borda não sumir no tema escuro
    const [x0, y0] = p(a0 + 0.004, R), [x1, y1] = p(a1 - 0.004, R);
    const [x2, y2] = p(a1 - 0.004, r), [x3, y3] = p(a0 + 0.004, r);
    return { ...f, d: `M${x0},${y0} A${R},${R} 0 ${grande} 1 ${x1},${y1} L${x2},${y2} A${r},${r} 0 ${grande} 0 ${x3},${y3} Z` };
  });
  const ativo = foco !== null ? arcos[foco] : null;
  return (
    <svg viewBox={`0 0 ${tamanho} ${tamanho}`} className="gsvg" style={{ maxWidth: tamanho }}
         role="img" aria-label={`composição de R$ ${brl0(total)}`}>
      {arcos.map((a, i) => (
        <path key={a.chave} d={a.d} fill={a.cor} opacity={foco === null || foco === i ? 1 : 0.35}
              onMouseEnter={() => setFoco(i)} onMouseLeave={() => setFoco(null)}>
          <title>{`${a.nome}: R$ ${brl(a.valor)} (${Math.round((a.valor / total) * 100)}%)`}</title>
        </path>
      ))}
      <text x={cx} y={cy - 4} textAnchor="middle" style={{ fontSize: 17, fontWeight: 600, fill: 'var(--ink)' }}>
        {ativo ? `${Math.round((ativo.valor / total) * 100)}%` : (centro ?? `R$ ${brl0(total)}`)}
      </text>
      <text x={cx} y={cy + 14} textAnchor="middle" style={{ fontSize: 11 }}>
        {ativo ? ativo.nome : (rotuloCentro ?? 'no mês')}
      </text>
    </svg>
  );
}

export const fatiasPorGrupo = (porCategoria) => {
  const por = {};
  for (const c of porCategoria) {
    const g = c.slug === '_sem' ? '_sem' : (c.grupo ?? '_sem');
    por[g] = (por[g] ?? 0) + c.valor;
  }
  return [...ORDEM, '_sem'].filter((g) => por[g] > 0)
    .map((g) => ({ chave: g, nome: NOME_GRUPO[g], valor: por[g], cor: corGrupo(g) }));
};

/* ---------------------------------------------------------- acumulado */
export function Acumulado({ curva, ateDia, diasMes, alturaPx = 230 }) {
  const [dica, setDica] = useState(null);
  const W = 640, H = alturaPx, ml = 52, mr = 12, mt = 10, mb = 26;
  const dias = curva.slice(0, diasMes);
  const max = Math.max(1, ...dias.map((d) => Math.max(d.mes, d.max ?? 0, d.mediana ?? 0)));
  const x = (d) => ml + ((d - 1) / (diasMes - 1)) * (W - ml - mr);
  const y = (v) => mt + (1 - v / max) * (H - mt - mb);
  const linha = (pts) => pts.map(([a, b], i) => `${i ? 'L' : 'M'}${a.toFixed(1)},${b.toFixed(1)}`).join('');
  const temBase = dias.some((d) => d.mediana !== null);
  const visiveis = dias.filter((d) => d.dia <= ateDia);
  const faixa = temBase
    ? `${linha(dias.map((d) => [x(d.dia), y(d.max)]))}L${dias.slice().reverse().map((d) => `${x(d.dia).toFixed(1)},${y(d.min).toFixed(1)}`).join('L')}Z`
    : null;
  const marcas = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const passo = Math.ceil(diasMes / 8);
  return (
    <div className="gcont">
      <svg viewBox={`0 0 ${W} ${H}`} className="gsvg" role="img"
           aria-label="despesa acumulada no mês contra a mediana dos meses anteriores"
           onMouseLeave={() => setDica(null)}>
        {marcas.map((v) => (
          <g key={v}>
            <line x1={ml} x2={W - mr} y1={y(v)} y2={y(v)} className="eixo" />
            <text x={ml - 6} y={y(v) + 4} textAnchor="end">{v >= 1000 ? `${brl0(v / 1000)}k` : brl0(v)}</text>
          </g>
        ))}
        {dias.filter((d) => d.dia === 1 || d.dia % passo === 0).map((d) => (
          <text key={d.dia} x={x(d.dia)} y={H - 6} textAnchor="middle">{d.dia}</text>
        ))}
        {faixa && <path d={faixa} fill="var(--ink-3)" opacity="0.13" />}
        {temBase && <path d={linha(dias.map((d) => [x(d.dia), y(d.mediana)]))} fill="none"
                          stroke="var(--ink-3)" strokeWidth="2" strokeDasharray="5 4" />}
        <path d={linha(visiveis.map((d) => [x(d.dia), y(d.mes)]))} fill="none"
              stroke="var(--s-custo_fixo)" strokeWidth="2.5" strokeLinejoin="round" />
        {visiveis.length > 0 && (
          <circle cx={x(visiveis.at(-1).dia)} cy={y(visiveis.at(-1).mes)} r="4" fill="var(--s-custo_fixo)" />
        )}
        {dias.map((d) => (
          <rect key={d.dia} x={x(d.dia) - (W - ml - mr) / diasMes / 2} y={mt}
                width={(W - ml - mr) / diasMes} height={H - mt - mb} fill="transparent"
                onMouseEnter={() => setDica(d)} />
        ))}
        {dica && <line x1={x(dica.dia)} x2={x(dica.dia)} y1={mt} y2={H - mb} stroke="var(--ink-3)" />}
      </svg>
      {dica && (
        <div className="dica" style={{ top: 0, left: `${Math.min(70, (x(dica.dia) / W) * 100)}%` }}>
          <strong>dia {dica.dia}</strong><br />
          {dica.dia <= ateDia && <>este mês: R$ {brl0(dica.mes)}<br /></>}
          {dica.mediana !== null && <span className="muted">mediana: R$ {brl0(dica.mediana)}</span>}
        </div>
      )}
      <ul className="legenda">
        <li><span className="chip" style={{ background: 'var(--s-custo_fixo)' }} />este mês</li>
        {temBase && <li><span className="chip" style={{ background: 'var(--ink-3)' }} />mediana dos 6 meses anteriores</li>}
        {temBase && <li><span className="chip" style={{ background: 'var(--ink-3)', opacity: 0.25 }} />faixa mín.–máx.</li>}
      </ul>
    </div>
  );
}

/* ----------------------------------------------------- receita x despesa */
export function ReceitaDespesa({ meses, destaque, aoClicar }) {
  const [dica, setDica] = useState(null);
  if (!meses.length) return <p className="vazio">Sem dados.</p>;
  const W = Math.max(520, meses.length * 52), H = 230, ml = 46, mb = 26, mt = 12;
  const max = Math.max(1, ...meses.map((m) => Math.max(m.receita, m.despesa)));
  const larg = (W - ml) / meses.length, bw = Math.min(16, larg * 0.32);
  const y = (v) => mt + (1 - v / max) * (H - mt - mb);
  return (
    <div className="gcont rolagem">
      <svg viewBox={`0 0 ${W} ${H}`} className="gsvg" style={{ minWidth: W * 0.75 }} role="img"
           aria-label="receita e despesa por mês" onMouseLeave={() => setDica(null)}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={ml} x2={W} y1={y(f * max)} y2={y(f * max)} className="eixo" />
            <text x={ml - 6} y={y(f * max) + 4} textAnchor="end">{`${brl0((f * max) / 1000)}k`}</text>
          </g>
        ))}
        {meses.map((m, i) => {
          const cx = ml + larg * i + larg / 2;
          const fraco = destaque && m.mes !== destaque ? 0.45 : 1;
          return (
            <g key={m.mes} opacity={fraco} style={{ cursor: aoClicar ? 'pointer' : 'default' }}
               onMouseEnter={() => setDica({ ...m, cx })} onClick={() => aoClicar?.(m.mes)}>
              <rect x={cx - bw - 1} y={y(m.receita)} width={bw} height={H - mb - y(m.receita)} rx="2" fill="var(--entrada)" />
              <rect x={cx + 1} y={y(m.despesa)} width={bw} height={H - mb - y(m.despesa)} rx="2" fill="var(--saida)" />
              <text x={cx} y={H - 8} textAnchor="middle"
                    style={m.mes === destaque ? { fill: 'var(--ink)', fontWeight: 600 } : undefined}>
                {rotuloMes(m.mes)}{m.parcial ? '*' : ''}
              </text>
              <rect x={cx - larg / 2} y={mt} width={larg} height={H - mt - mb} fill="transparent" />
            </g>
          );
        })}
      </svg>
      {dica && (
        <div className="dica" style={{ top: 0, left: `${Math.min(72, (dica.cx / W) * 100)}%` }}>
          <strong>{rotuloMes(dica.mes)}</strong><br />
          <span className="pos">receita R$ {brl0(dica.receita)}</span><br />
          <span className="neg">despesa R$ {brl0(dica.despesa)}</span><br />
          resultado <strong className={dica.receita - dica.despesa >= 0 ? 'pos' : 'neg'}>
            R$ {brl0(dica.receita - dica.despesa)}</strong>
        </div>
      )}
      <ul className="legenda">
        <li><span className="chip" style={{ background: 'var(--entrada)' }} />receita</li>
        <li><span className="chip" style={{ background: 'var(--saida)' }} />despesa</li>
        {meses.some((m) => m.parcial) && <li className="muted">* mês em andamento ou parcial</li>}
      </ul>
    </div>
  );
}

/* ------------------------------------------------- empilhadas por grupo */
export function Empilhadas({ meses }) {
  const [dica, setDica] = useState(null);
  if (!meses.length) return <p className="vazio">Sem dados.</p>;
  const W = Math.max(520, meses.length * 52), H = 250, ml = 46, mb = 26, mt = 12;
  const max = Math.max(1, ...meses.map((m) => m.total));
  const larg = (W - ml) / meses.length, bw = Math.min(30, larg * 0.6);
  const y = (v) => mt + (1 - v / max) * (H - mt - mb);
  return (
    <div className="gcont rolagem">
      <svg viewBox={`0 0 ${W} ${H}`} className="gsvg" style={{ minWidth: W * 0.75 }} role="img"
           aria-label="despesa por grupo e mês" onMouseLeave={() => setDica(null)}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={ml} x2={W} y1={y(f * max)} y2={y(f * max)} className="eixo" />
            <text x={ml - 6} y={y(f * max) + 4} textAnchor="end">{`${brl0((f * max) / 1000)}k`}</text>
          </g>
        ))}
        {meses.map((m, i) => {
          const cx = ml + larg * i + larg / 2;
          let acum = 0;
          const segs = [...ORDEM, '_sem'].filter((g) => m.grupos[g] > 0);
          return (
            <g key={m.mes} opacity={m.parcial ? 0.55 : 1}>
              {segs.map((g, j) => {
                const v = m.grupos[g];
                const y1 = y(acum + v), h = Math.max(1, y(acum) - y1 - 1);
                acum += v;
                return (
                  <rect key={g} x={cx - bw / 2} y={y1} width={bw} height={h}
                        rx={j === segs.length - 1 ? 3 : 0} fill={corGrupo(g)}
                        onMouseEnter={() => setDica({ mes: m.mes, g, v, total: m.total, cx })} />
                );
              })}
              <text x={cx} y={H - 8} textAnchor="middle">{rotuloMes(m.mes)}{m.parcial ? '*' : ''}</text>
            </g>
          );
        })}
      </svg>
      {dica && (
        <div className="dica" style={{ top: 0, left: `${Math.min(72, (dica.cx / W) * 100)}%` }}>
          <strong>{NOME_GRUPO[dica.g]}</strong> · {rotuloMes(dica.mes)}<br />
          R$ {brl(dica.v)} <span className="muted">({Math.round((dica.v / dica.total) * 100)}% do mês)</span>
        </div>
      )}
      <ul className="legenda">
        {[...ORDEM, '_sem'].map((g) => (
          <li key={g}><span className="chip" style={{ background: corGrupo(g) }} />{NOME_GRUPO[g]}</li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------- fluxo */
// Sankey de 3 colunas: receitas -> grupos -> categorias. As duas primeiras
// colunas somam o MESMO total: se sobrou, entra "Sobra" no meio; se faltou,
// entra "Déficit" do lado das receitas (o dinheiro veio de saldo, reserva
// ou limite). Sem isso o gráfico esconderia justamente o mês ruim.
export function Fluxo({ entradas, categorias: todas }) {
  // categoria com saldo negativo (venda/estorno maior que o gasto) não tem fluxo
  const categorias = todas.filter((c) => c.valor > 0);
  const totalEnt = entradas.reduce((a, e) => a + e.valor, 0);
  const totalSai = categorias.reduce((a, c) => a + c.valor, 0);
  if (!totalEnt && !totalSai) return <p className="vazio">Sem movimento no mês.</p>;

  const porGrupo = {};
  for (const c of categorias) {
    const g = c.slug === '_sem' ? '_sem' : (c.grupo ?? '_sem');
    (porGrupo[g] ??= []).push(c);
  }
  const grupos = [...ORDEM, '_sem'].filter((g) => porGrupo[g])
    .map((g) => ({ g, valor: porGrupo[g].reduce((a, c) => a + c.valor, 0),
                   cats: [...porGrupo[g]].sort((a, b) => b.valor - a.valor) }));

  const esqN = entradas.map((e, i) => ({ chave: `e${i}`, nome: e.nome, valor: e.valor, cor: 'var(--entrada)' }));
  if (totalSai > totalEnt) esqN.push({ chave: '_def', nome: 'Déficit', valor: totalSai - totalEnt, cor: 'var(--critico)' });
  const meioN = grupos.map((x) => ({ chave: x.g, nome: NOME_GRUPO[x.g], valor: x.valor, cor: corGrupo(x.g) }));
  if (totalEnt > totalSai) meioN.push({ chave: '_sobra', nome: 'Sobra', valor: totalEnt - totalSai, cor: 'var(--entrada)' });
  const dirN = grupos.flatMap((x) => x.cats.map((c) => ({
    chave: `${x.g}:${c.slug}`, nome: c.nome, valor: c.valor, cor: corGrupo(x.g), pai: x.g })));

  const total = Math.max(totalEnt, totalSai);
  const gap = 3, W = 860, nw = 12, col = [20, 330, 590];
  const n = Math.max(esqN.length, meioN.length, dirN.length);
  const alturaUtil = Math.max(300, dirN.length * 20);
  const k = (alturaUtil - gap * n) / total;
  const H = alturaUtil + 16;

  const empilha = (nos) => {
    let yy = 8;
    return nos.map((x) => { const o = { ...x, y: yy, h: x.valor * k }; yy += o.h + gap; return o; });
  };
  const esq = empilha(esqN), meio = empilha(meioN), dir = empilha(dirN);
  const faixa = (x0, y0, x1, y1, h) => {
    const c = (x0 + x1) / 2;
    return `M${x0},${y0} C${c},${y0} ${c},${y1} ${x1},${y1} L${x1},${y1 + h} C${c},${y1 + h} ${c},${y0 + h} ${x0},${y0 + h} Z`;
  };

  // esquerda -> meio: as duas colunas têm o mesmo total; percorre as duas
  // juntas, cortando cada ligação no menor resto.
  const links = [];
  let i = 0, j = 0, restE = esq[0]?.valor ?? 0, restM = meio[0]?.valor ?? 0, offE = 0, offM = 0;
  while (i < esq.length && j < meio.length) {
    const v = Math.min(restE, restM);
    if (v > 0.005) {
      links.push({ chave: `a${i}-${j}`, cor: meio[j].cor,
                   d: faixa(col[0] + nw, esq[i].y + offE, col[1], meio[j].y + offM, v * k) });
    }
    offE += v * k; offM += v * k; restE -= v; restM -= v;
    if (restE <= 0.005) { i++; restE = esq[i]?.valor ?? 0; offE = 0; }
    if (restM <= 0.005) { j++; restM = meio[j]?.valor ?? 0; offM = 0; }
  }
  // meio -> direita: cada categoria sai do seu grupo
  const off = {};
  for (const d of dir) {
    const m = meio.find((x) => x.chave === d.pai);
    if (!m) continue;
    off[m.chave] = off[m.chave] ?? 0;
    links.push({ chave: `b${d.chave}`, cor: d.cor, d: faixa(col[1] + nw, m.y + off[m.chave], col[2], d.y, d.h) });
    off[m.chave] += d.h;
  }

  const rotulo = (x, nó) => (
    <text x={x + nw + 6} y={nó.y + nó.h / 2 + 4} style={{ fill: 'var(--ink-2)', fontSize: 11.5 }}>
      {nó.nome} <tspan style={{ fill: 'var(--ink-3)' }}>{brl0(nó.valor)}</tspan>
    </text>
  );
  return (
    <div className="rolagem">
      <svg viewBox={`0 0 ${W} ${H}`} className="gsvg" style={{ minWidth: 640 }} role="img"
           aria-label={`fluxo do dinheiro: receitas de R$ ${brl0(totalEnt)} e despesas de R$ ${brl0(totalSai)}`}>
        {links.map((l) => <path key={l.chave} d={l.d} fill={l.cor} opacity="0.26" />)}
        {[[esq, col[0]], [meio, col[1]], [dir, col[2]]].map(([nos, x]) => nos.map((nó) => (
          <g key={nó.chave}>
            <rect x={x} y={nó.y} width={nw} height={Math.max(1, nó.h)} rx="2" fill={nó.cor}>
              <title>{`${nó.nome}: R$ ${brl(nó.valor)}`}</title>
            </rect>
            {nó.h >= 9 && rotulo(x, nó)}
          </g>
        )))}
      </svg>
    </div>
  );
}
