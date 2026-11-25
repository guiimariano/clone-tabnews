// GERADO por financas-casal/scripts/sync-webhook.mjs — não edite aqui.
// A fonte e os testes ficam no projeto privado financas-casal.
// Peças comuns do painel: formatação, layout com navegação, indicadores,
// seletor de mês, portão de senha e o estilo (tokens claro/escuro).
//
// Paleta categórica dos 6 grupos validada para daltonismo nos dois modos
// (adjacent CVD ΔE 9.1 claro / 8.4 escuro). A ORDEM é o mecanismo de
// segurança: atribuída por grupo fixo, nunca ciclada. Status (ok/atenção/
// crítico) é paleta separada, sempre com ícone e texto.
import Head from 'next/head';
import Link from 'next/link';

export { padraoSugerido } from './texto.js';

export const ORDEM = ['custo_fixo', 'conforto', 'metas', 'prazeres', 'liberdade', 'conhecimento'];
export const NOME_GRUPO = {
  custo_fixo: 'Custo fixo', conforto: 'Conforto', metas: 'Metas', prazeres: 'Prazeres',
  liberdade: 'Liberdade financeira', conhecimento: 'Conhecimento', _sem: 'Sem grupo',
};

export const brl = (v) =>
  Number(v ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const brl0 = (v) => Number(v ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
export const pct = (v, casas = 0) => `${Number(v ?? 0).toFixed(casas).replace('.', ',')}%`;
const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MES_LONGO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto',
  'setembro', 'outubro', 'novembro', 'dezembro'];
export const rotuloMes = (iso) => `${MES[Number(iso.slice(5, 7)) - 1]}/${iso.slice(2, 4)}`;
export const mesLongo = (iso) => `${MES_LONGO[Number(iso.slice(5, 7)) - 1]} de ${iso.slice(0, 4)}`;
export const dataCurta = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—');
export function somaMes(iso, n) {
  const [a, m] = iso.slice(0, 7).split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return d.toISOString().slice(0, 10);
}

export function estado(p) {
  if (p === null || p === undefined || Number.isNaN(p)) return { chave: 'neutro', rotulo: 'sem teto', icone: '–' };
  if (p > 100) return { chave: 'critico', rotulo: 'passou', icone: '▲' };
  if (p >= 80) return { chave: 'atencao', rotulo: 'perto', icone: '●' };
  return { chave: 'ok', rotulo: 'dentro', icone: '✓' };
}

export function Tile({ rotulo, valor, nota, tom = 'neutro', href }) {
  const corpo = (
    <>
      <div className="tile-rotulo">{rotulo}</div>
      <div className="tile-valor tab">{valor}</div>
      {nota && <div className="tile-nota">{nota}</div>}
    </>
  );
  return href
    ? <Link href={href} className={`tile tom-${tom} tile-link`}>{corpo}</Link>
    : <div className={`tile tom-${tom}`}>{corpo}</div>;
}

// ‹ out/26 · novembro de 2026 · dez/26 ›
export function SeletorMes({ mes, base, extra = '' }) {
  const ant = somaMes(mes, -1), prox = somaMes(mes, 1);
  const url = (m) => `${base}?mes=${m.slice(0, 7)}${extra}`;
  return (
    <nav className="seletor-mes" aria-label="mês">
      <Link href={url(ant)} aria-label={`mês anterior, ${rotuloMes(ant)}`}>‹ {rotuloMes(ant)}</Link>
      <strong>{mesLongo(mes)}</strong>
      <Link href={url(prox)} aria-label={`próximo mês, ${rotuloMes(prox)}`}>{rotuloMes(prox)} ›</Link>
    </nav>
  );
}

const ABAS = [
  { id: 'dashboard', href: '/financas', rotulo: 'Dashboard' },
  { id: 'transacoes', href: '/financas/transacoes', rotulo: 'Transações' },
  { id: 'orcamento', href: '/financas/orcamento', rotulo: 'Orçamento' },
  { id: 'relatorios', href: '/financas/relatorios', rotulo: 'Relatórios' },
  { id: 'conectar', href: '/financas/conectar', rotulo: 'Bancos' },
];

export function Layout({ ativo, titulo, sub, acoes, children, largo = false }) {
  return (
    <>
      <Head>
        <title>{titulo ? `${titulo} · Finanças` : 'Finanças'}</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <div className="viz-root">
        <div className={`moldura${largo ? ' largo' : ''}`}>
          <header className="topo">
            <Link href="/financas" className="marca">Finanças</Link>
            <nav className="abas" aria-label="seções">
              {ABAS.map((a) => (
                <Link key={a.id} href={a.href} className={a.id === ativo ? 'ativa' : undefined}
                      aria-current={a.id === ativo ? 'page' : undefined}>{a.rotulo}</Link>
              ))}
            </nav>
            <form method="POST" action="/api/financas/login" className="sair-form">
              <input type="hidden" name="acao" value="sair" />
              <button type="submit" className="sair">sair</button>
            </form>
          </header>
          {(titulo || acoes) && (
            <div className="cabeca">
              <div>
                {titulo && <h1>{titulo}</h1>}
                {sub && <p className="sub">{sub}</p>}
              </div>
              {acoes}
            </div>
          )}
          {children}
        </div>
      </div>
      <Estilo />
    </>
  );
}

export function Portao({ erro }) {
  return (
    <>
      <Head><title>Finanças</title><meta name="robots" content="noindex, nofollow" /></Head>
      <div className="viz-root portao">
        <form method="POST" action="/api/financas/login">
          <h1>Finanças</h1>
          <label htmlFor="senha" className="sub">Senha do casal</label>
          <input id="senha" type="password" name="senha" autoComplete="current-password" required autoFocus />
          {erro && <p className="erro" role="alert">{erro}</p>}
          <button type="submit">Entrar</button>
        </form>
      </div>
      <Estilo />
    </>
  );
}

export function Estilo() {
  return (
    <style jsx global>{`
      body { margin: 0; }
      .viz-root {
        color-scheme: light;
        --surface: #fcfcfb; --plano: #f4f4f1; --ink: #0b0b0b; --ink-2: #52514e; --ink-3: #85837c;
        --linha: #e4e3dd; --realce: #eef3fb;
        --s-custo_fixo: #2a78d6; --s-conforto: #eb6834; --s-metas: #1baf7a;
        --s-prazeres: #eda100; --s-liberdade: #e87ba4; --s-conhecimento: #008300; --s-_sem: #b3b1a8;
        --ok: #0ca30c; --atencao: #fab219; --critico: #d03b3b; --atencao-texto: #8a6d0f;
        --entrada: #0f8a4f; --saida: #c4442f;
        --f: "Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif;
        --fd: "Cascadia Code", ui-monospace, Consolas, monospace;
        background: var(--plano); color: var(--ink); font-family: var(--f);
        min-height: 100vh; padding: 0 16px 72px; box-sizing: border-box;
      }
      @media (prefers-color-scheme: dark) {
        :root:where(:not([data-theme="light"])) .viz-root {
          color-scheme: dark;
          --surface: #1a1a19; --plano: #0d0d0d; --ink: #fff; --ink-2: #c3c2b7; --ink-3: #8d8b82;
          --linha: #2e2e2b; --realce: #1b2433;
          --s-custo_fixo: #3987e5; --s-conforto: #d95926; --s-metas: #199e70;
          --s-prazeres: #c98500; --s-liberdade: #d55181; --s-conhecimento: #008300; --s-_sem: #5d5c56;
          --atencao-texto: #fab219; --entrada: #3fbf7f; --saida: #ef7a63;
        }
      }
      :root[data-theme="dark"] .viz-root {
        color-scheme: dark;
        --surface: #1a1a19; --plano: #0d0d0d; --ink: #fff; --ink-2: #c3c2b7; --ink-3: #8d8b82;
        --linha: #2e2e2b; --realce: #1b2433;
        --s-custo_fixo: #3987e5; --s-conforto: #d95926; --s-metas: #199e70;
        --s-prazeres: #c98500; --s-liberdade: #d55181; --s-conhecimento: #008300; --s-_sem: #5d5c56;
        --atencao-texto: #fab219; --entrada: #3fbf7f; --saida: #ef7a63;
      }
      .viz-root * { box-sizing: border-box; }
      .viz-root a { color: inherit; }
      .viz-root .moldura { max-width: 1180px; margin: 0 auto; }
      .viz-root .moldura.largo { max-width: 1400px; }

      .viz-root .topo { display: flex; align-items: center; gap: 18px; padding: 14px 0;
        border-bottom: 1px solid var(--linha); margin-bottom: 22px; flex-wrap: wrap; }
      .viz-root .marca { font-weight: 700; font-size: 1.05rem; text-decoration: none; letter-spacing: -0.01em; }
      .viz-root .abas { display: flex; gap: 4px; flex-wrap: wrap; flex: 1; }
      .viz-root .abas a { text-decoration: none; color: var(--ink-2); padding: 7px 12px; border-radius: 7px;
        font-size: 0.9rem; }
      .viz-root .abas a:hover { background: var(--surface); color: var(--ink); }
      .viz-root .abas a.ativa { background: var(--surface); color: var(--ink); font-weight: 600;
        box-shadow: inset 0 0 0 1px var(--linha); }
      .viz-root .sair { background: none; border: 1px solid var(--linha); color: var(--ink-2);
        padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 0.82rem; }

      .viz-root .cabeca { display: flex; justify-content: space-between; align-items: flex-end;
        gap: 16px; margin-bottom: 18px; flex-wrap: wrap; }
      .viz-root h1 { margin: 0; font-size: 1.65rem; letter-spacing: -0.02em; }
      .viz-root h2 { margin: 0 0 4px; font-size: 1.02rem; letter-spacing: -0.01em; }
      .viz-root .sub, .viz-root .desc { margin: 4px 0 0; color: var(--ink-2); font-size: 0.9rem; }
      .viz-root .desc { margin: 0 0 14px; max-width: 72ch; }
      .viz-root .muted { color: var(--ink-3); }
      .viz-root .tab { font-family: var(--fd); font-variant-numeric: tabular-nums; }
      .viz-root code { font-family: var(--fd); font-size: 0.86em; }
      .viz-root .nota { margin: 12px 0 0; font-size: 0.8rem; color: var(--ink-3); max-width: 76ch; }
      .viz-root .vazio { color: var(--ink-3); font-size: 0.9rem; margin: 0; }
      .viz-root .cartao { background: var(--surface); border: 1px solid var(--linha); border-radius: 10px;
        padding: 18px; min-width: 0; }
      .viz-root .cartao-topo { display: flex; justify-content: space-between; align-items: baseline;
        gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
      .viz-root .cartao-topo a { font-size: 0.82rem; color: var(--ink-2); }
      .viz-root .grade { display: grid; gap: 16px; margin-bottom: 16px; }
      .viz-root .g2 { grid-template-columns: repeat(auto-fit, minmax(min(100%, 420px), 1fr)); }
      .viz-root .g3 { grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); }
      .viz-root .g-2-1 { grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); }
      @media (max-width: 900px) { .viz-root .g-2-1 { grid-template-columns: 1fr; } }

      .viz-root .seletor-mes { display: flex; align-items: center; gap: 12px; font-size: 0.88rem; }
      .viz-root .seletor-mes a { text-decoration: none; color: var(--ink-2); padding: 6px 10px;
        border: 1px solid var(--linha); border-radius: 7px; background: var(--surface); }
      .viz-root .seletor-mes strong { min-width: 150px; text-align: center; }

      .viz-root .tiles { display: grid; gap: 12px; margin-bottom: 16px;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 170px), 1fr)); }
      .viz-root .tile { background: var(--surface); border: 1px solid var(--linha); border-radius: 10px;
        padding: 14px 16px; display: block; text-decoration: none; }
      .viz-root .tile-link:hover { border-color: var(--ink-3); }
      .viz-root .tile-rotulo { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ink-3); }
      .viz-root .tile-valor { font-size: 1.35rem; font-weight: 600; margin: 6px 0 2px; }
      .viz-root .tile-nota { font-size: 0.78rem; color: var(--ink-3); }
      .viz-root .tom-critico { box-shadow: inset 4px 0 0 var(--critico); }
      .viz-root .tom-critico .tile-valor { color: var(--critico); }
      .viz-root .tom-atencao { box-shadow: inset 4px 0 0 var(--atencao); }
      .viz-root .tom-ok { box-shadow: inset 4px 0 0 var(--ok); }
      .viz-root .pos { color: var(--entrada); }
      .viz-root .neg { color: var(--saida); }

      .viz-root .chip { display: inline-block; width: 10px; height: 10px; border-radius: 3px; flex: none; }
      .viz-root .legenda { list-style: none; display: flex; flex-wrap: wrap; gap: 6px 16px; padding: 0;
        margin: 12px 0 0; font-size: 0.8rem; color: var(--ink-2); }
      .viz-root .legenda li { display: flex; align-items: center; gap: 6px; }
      .viz-root .gcont { position: relative; }
      .viz-root .gsvg { display: block; width: 100%; height: auto; overflow: visible; }
      .viz-root .gsvg text { font-family: var(--f); fill: var(--ink-3); font-size: 11px; }
      .viz-root .gsvg .eixo { stroke: var(--linha); }
      .viz-root .dica { position: absolute; background: var(--surface); border: 1px solid var(--linha);
        border-radius: 8px; padding: 8px 10px; font-size: 0.82rem; box-shadow: 0 4px 14px rgba(0,0,0,.12);
        pointer-events: none; white-space: nowrap; z-index: 5; }

      .viz-root .rolagem { overflow-x: auto; }
      .viz-root table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
      .viz-root th { text-align: left; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.07em;
        color: var(--ink-3); font-weight: 500; padding: 7px 8px; border-bottom: 1px solid var(--linha);
        white-space: nowrap; background: var(--surface); }
      .viz-root td { padding: 6px 8px; border-bottom: 1px solid var(--linha); vertical-align: middle; }
      .viz-root .num { text-align: right; }
      .viz-root tr.clicavel:hover td { background: var(--realce); }

      .viz-root .est { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.06em; white-space: nowrap; }
      .viz-root .est-ok { color: var(--ok); }
      .viz-root .est-atencao { color: var(--atencao-texto); }
      .viz-root .est-critico { color: var(--critico); }
      .viz-root .est-neutro { color: var(--ink-3); }
      .viz-root .trilha { position: relative; height: 10px; background: var(--plano); border-radius: 4px; }
      .viz-root .preench { height: 10px; border-radius: 4px; min-width: 2px; }
      .viz-root .preench.est-ok { background: var(--ok); }
      .viz-root .preench.est-atencao { background: var(--atencao); }
      .viz-root .preench.est-critico { background: var(--critico); }
      .viz-root .preench.est-neutro { background: var(--ink-3); }
      .viz-root .marca-teto { position: absolute; top: -3px; width: 2px; height: 16px; background: var(--ink); }
      .viz-root .marca-hoje { position: absolute; top: -5px; width: 0; height: 20px;
        border-left: 2px dashed var(--ink-3); }

      .viz-root input, .viz-root select, .viz-root button.bt { font: inherit; font-size: 0.86rem;
        color: var(--ink); background: var(--surface); border: 1px solid var(--linha); border-radius: 7px;
        padding: 6px 9px; }
      .viz-root button.bt { cursor: pointer; }
      .viz-root button.bt.prim { background: var(--s-custo_fixo); border-color: var(--s-custo_fixo); color: #fff; }
      .viz-root button.bt:disabled { opacity: 0.5; cursor: default; }

      .viz-root.portao { display: flex; align-items: center; justify-content: center; min-height: 100vh; }
      .viz-root.portao form { background: var(--surface); border: 1px solid var(--linha); border-radius: 12px;
        padding: 30px; width: 100%; max-width: 330px; display: flex; flex-direction: column; gap: 12px; }
      .viz-root.portao input { padding: 11px 13px; border: 1px solid var(--linha); border-radius: 7px;
        font-size: 1rem; background: var(--plano); color: var(--ink); }
      .viz-root.portao button { padding: 11px; border: 0; border-radius: 7px; background: var(--s-custo_fixo);
        color: #fff; font-size: 0.95rem; cursor: pointer; }
      .viz-root .erro { color: var(--critico); font-size: 0.86rem; margin: 0; }
      .viz-root :focus-visible { outline: 2px solid var(--s-custo_fixo); outline-offset: 2px; }
    `}</style>
  );
}
