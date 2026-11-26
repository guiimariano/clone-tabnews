// GERADO por financas-casal/scripts/sync-webhook.mjs — não edite aqui.
// A fonte e os testes ficam no projeto privado financas-casal.
// /financas/transacoes — a planilha.
//
// O período inteiro vem do servidor de uma vez; busca, filtros e
// ordenação rodam no navegador (instantâneo para ~1.500 linhas). Trocar a
// categoria grava na hora e oferece "aplicar a todas iguais", que vira
// regra para as próximas sincronizações da Pluggy.
import { useMemo, useState } from 'react';
import { autenticado } from '../../lib/financas/auth.js';
import { transacoes, cadastros, mesesComDados, mesValido } from '../../lib/financas/dados.js';
import { Layout, Portao, SeletorMes, brl, brl0, dataCurta, rotuloMes, mesLongo, NOME_GRUPO, padraoSugerido } from '../../components/financas/base.js';

const POR_PAGINA = 250;

// A lista de categorias só é montada na linha que está sendo editada:
// com ela em todas, a planilha de 12 meses passava de 800 KB.
function CelulaCategoria({ l, catPor, opcoes, aoTrocar }) {
  const [editando, setEditando] = useState(false);
  const nome = catPor[l.categoria_id]?.nome;
  if (!editando) {
    return (
      <button type="button" className={nome ? 'cel-cat' : 'cel-cat vazio-cat'} onClick={() => setEditando(true)}
              aria-label={`categoria de ${l.descricao}: ${nome ?? 'sem categoria'} — trocar`}>
        {nome ?? 'sem categoria'}
      </button>
    );
  }
  return (
    <select autoFocus value={l.categoria_id ?? ''} aria-label={`categoria de ${l.descricao}`}
            className="sel-cat" onBlur={() => setEditando(false)}
            onChange={(e) => { setEditando(false); if (e.target.value) aoTrocar(l, Number(e.target.value)); }}>
      <option value="">sem categoria</option>
      {opcoes}
    </select>
  );
}

function csv(linhas, cats) {
  const nome = Object.fromEntries(cats.map((c) => [c.id, c.nome]));
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const cab = ['data', 'competencia', 'descricao', 'categoria', 'tipo', 'valor', 'conta', 'pessoa', 'parcela', 'pendente'];
  const corpo = linhas.map((l) => [
    l.data_compra, l.mes_ref.slice(0, 7), l.descricao, nome[l.categoria_id] ?? '', l.tipo,
    String(l.tipo === 'entrada' ? l.valor : -l.valor).replace('.', ','), l.conta ?? '', l.pessoa ?? '',
    l.parcela_total > 1 ? `${l.parcela_num}/${l.parcela_total}` : '', l.conciliado === false ? 'sim' : '',
  ].map(esc).join(';'));
  return '﻿' + [cab.join(';'), ...corpo].join('\r\n'); // BOM + ; para o Excel pt-BR abrir certo
}

// Trocar de mês é navegação no cliente: o Next reaproveita o componente e
// só troca as props, então o estado copiado delas (linhas, filtros, página)
// ficaria com o mês anterior. A chave por período força uma planilha nova.
export default function Transacoes(props) {
  return <Planilha key={`${props.periodo}:${props.mes}:${JSON.stringify(props.filtroInicial ?? {})}`} {...props} />;
}

function Planilha({ ok, erro, linhas: inicial, cad, mes, periodo, filtroInicial }) {
  const [linhas, setLinhas] = useState(inicial ?? []);
  const [f, setF] = useState(filtroInicial ?? {});
  const [ordem, setOrdem] = useState({ campo: 'data_compra', dir: -1 });
  const [pagina, setPagina] = useState(1);
  const [oferta, setOferta] = useState(null); // { linha, padrao, categoria_id }
  const [aviso, setAviso] = useState(null);

  const cats = cad?.categorias ?? [];
  const catPor = useMemo(() => Object.fromEntries(cats.map((c) => [c.id, c])), [cats]);
  const catSlug = useMemo(() => Object.fromEntries(cats.map((c) => [c.slug, c.id])), [cats]);
  const contaNome = useMemo(() => Object.fromEntries((cad?.contas ?? []).map((c) => [c.slug, c.nome])), [cad]);

  const filtradas = useMemo(() => {
    const busca = (f.q ?? '').toLowerCase().trim();
    let r = linhas.filter((l) => {
      // "retorno" = dinheiro que voltou (venda de item, estorno): saída negativa
      if (f.tipo === 'retorno') { if (!(l.tipo === 'saida' && l.valor < 0)) return false; }
      else if (f.tipo && l.tipo !== f.tipo) return false;
      if (f.conta && l.conta !== f.conta) return false;
      if (f.pessoa && (l.pessoa ?? '_') !== f.pessoa) return false;
      if (f.categoria === '_sem') { if (l.categoria_id || l.tipo !== 'saida') return false; }
      else if (f.categoria && l.categoria_id !== catSlug[f.categoria]) return false;
      if (f.grupo && catPor[l.categoria_id]?.grupo !== f.grupo) return false;
      if (busca && !l.descricao.toLowerCase().includes(busca)) return false;
      return true;
    });
    const { campo, dir } = ordem;
    const val = (l) => campo === 'categoria' ? (catPor[l.categoria_id]?.nome ?? '~')
      : campo === 'valor' ? (l.tipo === 'entrada' ? l.valor : -l.valor) : (l[campo] ?? '');
    r = [...r].sort((a, b) => (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0) * dir);
    return r;
  }, [linhas, f, ordem, catPor, catSlug]);

  if (!ok) return <Portao erro={erro} />;

  const tot = filtradas.reduce((a, l) => {
    if (l.tipo === 'entrada') a.ent += l.valor; else if (l.tipo === 'saida') a.sai += l.valor; else a.tr += l.valor;
    return a;
  }, { ent: 0, sai: 0, tr: 0 });

  const muda = (campo, v) => { setF((x) => ({ ...x, [campo]: v || undefined })); setPagina(1); };
  const ordenar = (campo) => setOrdem((o) => ({ campo, dir: o.campo === campo ? -o.dir : campo === 'descricao' || campo === 'categoria' ? 1 : -1 }));
  const seta = (campo) => (ordem.campo === campo ? (ordem.dir > 0 ? ' ▲' : ' ▼') : '');

  async function trocar(l, categoriaId) {
    const antes = l.categoria_id;
    setLinhas((ls) => ls.map((x) => (x.id === l.id ? { ...x, categoria_id: categoriaId } : x)));
    const r = await fetch('/api/financas/lancamento', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: l.id, categoria_id: categoriaId }),
    });
    if (!r.ok) {
      setLinhas((ls) => ls.map((x) => (x.id === l.id ? { ...x, categoria_id: antes } : x)));
      setAviso({ tom: 'erro', texto: 'Não consegui salvar a categoria.' });
      return;
    }
    setOferta({ linha: l, padrao: padraoSugerido(l.descricao), categoria_id: categoriaId });
  }

  const iguais = oferta
    ? linhas.filter((x) => x.id !== oferta.linha.id && !x.categoria_id && x.tipo === 'saida' &&
        x.descricao.toLowerCase().replace(/\s+/g, ' ').includes(oferta.padrao)).length
    : 0;

  async function criarRegra() {
    const r = await fetch('/api/financas/regra', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ padrao: oferta.padrao, categoria_id: oferta.categoria_id }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setAviso({ tom: 'erro', texto: j.erro ?? 'Não consegui criar a regra.' }); return; }
    const p = j.padrao;
    setLinhas((ls) => ls.map((x) => (!x.categoria_id && x.tipo === 'saida' &&
      x.descricao.toLowerCase().replace(/\s+/g, ' ').includes(p) ? { ...x, categoria_id: oferta.categoria_id } : x)));
    setAviso({ tom: 'ok', texto: `Regra criada: “${p}” → ${catPor[oferta.categoria_id]?.nome}. ${j.aplicadas} lançamento(s) classificados agora, e as próximas sincronizações já chegam assim.` });
    setOferta(null);
  }

  function exportar() {
    const blob = new Blob([csv(filtradas, cats)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `transacoes-${periodo === '12m' ? 'ultimos-12-meses' : mes.slice(0, 7)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  const grupos = [...new Set(cats.map((c) => c.grupo ?? '_'))];
  const opcoesCat = (
    <>
      {grupos.map((g) => (
        <optgroup key={g} label={NOME_GRUPO[g] ?? 'Outras'}>
          {cats.filter((c) => (c.grupo ?? '_') === g && c.tipo !== 'entrada').map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </optgroup>
      ))}
      <optgroup label="Entradas">
        {cats.filter((c) => c.tipo === 'entrada').map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
      </optgroup>
    </>
  );

  const visiveis = filtradas.slice(0, pagina * POR_PAGINA);
  const sub = periodo === '12m' ? 'últimos 12 meses' : mesLongo(mes);

  return (
    <Layout ativo="transacoes" titulo="Transações" largo
            sub={`${sub} · ${filtradas.length} de ${linhas.length} lançamentos`}
            acoes={
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                {periodo !== '12m' && <SeletorMes mes={mes} base="/financas/transacoes" />}
                <a className="bt-link" href={periodo === '12m' ? `/financas/transacoes?mes=${mes.slice(0, 7)}` : '/financas/transacoes?periodo=12m'}>
                  {periodo === '12m' ? 'um mês' : '12 meses'}
                </a>
              </div>
            }>

      <section className="cartao filtros">
        <input type="search" placeholder="buscar descrição…" value={f.q ?? ''} onChange={(e) => muda('q', e.target.value)}
               aria-label="buscar" style={{ minWidth: 200, flex: 2 }} />
        <select value={f.categoria ?? ''} onChange={(e) => muda('categoria', e.target.value)} aria-label="categoria">
          <option value="">todas as categorias</option>
          <option value="_sem">— sem categoria —</option>
          {cats.map((c) => <option key={c.slug} value={c.slug}>{c.nome}</option>)}
        </select>
        <select value={f.grupo ?? ''} onChange={(e) => muda('grupo', e.target.value)} aria-label="grupo">
          <option value="">todos os grupos</option>
          {(cad?.grupos ?? []).map((g) => <option key={g.slug} value={g.slug}>{g.nome}</option>)}
        </select>
        <select value={f.tipo ?? ''} onChange={(e) => muda('tipo', e.target.value)} aria-label="tipo">
          <option value="">entradas, saídas e transf.</option>
          <option value="saida">saídas</option>
          <option value="entrada">entradas</option>
          <option value="retorno">retornos (vendas e estornos)</option>
          <option value="transferencia">transferências</option>
        </select>
        <select value={f.conta ?? ''} onChange={(e) => muda('conta', e.target.value)} aria-label="conta">
          <option value="">todas as contas</option>
          {(cad?.contas ?? []).filter((c) => linhas.some((l) => l.conta === c.slug))
            .map((c) => <option key={c.slug} value={c.slug}>{c.nome}</option>)}
        </select>
        <select value={f.pessoa ?? ''} onChange={(e) => muda('pessoa', e.target.value)} aria-label="pessoa">
          <option value="">todas as pessoas</option>
          {(cad?.pessoas ?? []).map((p) => <option key={p.apelido} value={p.apelido}>{p.apelido}</option>)}
          <option value="_">sem pessoa</option>
        </select>
        {Object.values(f).some(Boolean) && <button className="bt" onClick={() => { setF({}); setPagina(1); }}>limpar</button>}
        <button className="bt" onClick={exportar} disabled={!filtradas.length}>exportar CSV</button>
      </section>

      <section className="tiles">
        <div className="tile"><div className="tile-rotulo">Entradas</div><div className="tile-valor tab pos">R$ {brl0(tot.ent)}</div></div>
        <div className="tile"><div className="tile-rotulo">Saídas</div><div className="tile-valor tab neg">R$ {brl0(tot.sai)}</div></div>
        <div className="tile"><div className="tile-rotulo">Resultado</div>
          <div className={`tile-valor tab ${tot.ent - tot.sai < 0 ? 'neg' : 'pos'}`}>R$ {brl0(tot.ent - tot.sai)}</div></div>
        <div className="tile"><div className="tile-rotulo">Transferências</div><div className="tile-valor tab muted">R$ {brl0(tot.tr)}</div>
          <div className="tile-nota">entre contas do casal — não é gasto</div></div>
      </section>

      {aviso && (
        <div className={`aviso aviso-${aviso.tom}`} role="status">
          {aviso.texto} <button className="bt" onClick={() => setAviso(null)} aria-label="fechar">×</button>
        </div>
      )}
      {oferta && (
        <div className="aviso aviso-oferta" role="dialog" aria-label="criar regra">
          <div>
            Categoria salva. Aplicar <strong>{catPor[oferta.categoria_id]?.nome}</strong> a tudo que contiver
          </div>
          <input value={oferta.padrao} onChange={(e) => setOferta((o) => ({ ...o, padrao: e.target.value.toLowerCase() }))}
                 aria-label="padrão da regra" style={{ minWidth: 220 }} />
          <span className="muted">{iguais} sem categoria {iguais === 1 ? 'casa' : 'casam'} agora</span>
          <button className="bt prim" onClick={criarRegra} disabled={oferta.padrao.trim().length < 3}>criar regra</button>
          <button className="bt" onClick={() => setOferta(null)}>só esta</button>
        </div>
      )}

      <section className="cartao" style={{ padding: 0 }}>
        <div className="rolagem">
          <table className="planilha">
            <thead>
              <tr>
                <th onClick={() => ordenar('data_compra')} className="ord">Data{seta('data_compra')}</th>
                <th onClick={() => ordenar('descricao')} className="ord">Descrição{seta('descricao')}</th>
                <th onClick={() => ordenar('categoria')} className="ord">Categoria{seta('categoria')}</th>
                <th onClick={() => ordenar('conta')} className="ord">Conta{seta('conta')}</th>
                <th onClick={() => ordenar('pessoa')} className="ord">Pessoa{seta('pessoa')}</th>
                {periodo === '12m' && <th onClick={() => ordenar('mes_ref')} className="ord">Compet.{seta('mes_ref')}</th>}
                <th onClick={() => ordenar('valor')} className="ord num">Valor{seta('valor')}</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((l) => (
                <tr key={l.id} className={l.categoria_id || l.tipo !== 'saida' ? undefined : 'sem-cat'}>
                  <td className="tab muted" style={{ whiteSpace: 'nowrap' }}>{dataCurta(l.data_compra)}</td>
                  <td>
                    {l.descricao}
                    <span className="selos">
                      {l.parcela_total > 1 && <span className="selo">{l.parcela_num}/{l.parcela_total}</span>}
                      {l.automatico ? <span className="selo">{l.automatico}</span>
                        : l.conciliado === false && <span className="selo">pendente</span>}
                      {l.tipo === 'transferencia' && <span className="selo">transferência</span>}
                      {l.tipo === 'saida' && l.valor < 0 && <span className="selo">retorno</span>}
                    </span>
                  </td>
                  <td>
                    {l.tipo === 'transferencia' ? <span className="muted">—</span> : (
                      <CelulaCategoria l={l} catPor={catPor} opcoes={opcoesCat} aoTrocar={trocar} />
                    )}
                  </td>
                  <td className="muted" style={{ whiteSpace: 'nowrap' }}>{contaNome[l.conta] ?? l.conta}</td>
                  <td className="muted">{l.pessoa ?? ''}</td>
                  {periodo === '12m' && <td className="muted tab">{rotuloMes(l.mes_ref)}</td>}
                  <td className={`num tab ${l.tipo === 'entrada' || l.valor < 0 ? 'pos' : l.tipo === 'transferencia' ? 'muted' : ''}`}
                      style={{ whiteSpace: 'nowrap' }}>
                    {/* retorno (venda de item, estorno): saída negativa, abate o gasto (0030) */}
                    {l.tipo === 'entrada' || l.valor < 0 ? '+' : l.tipo === 'saida' ? '−' : ''}{brl(Math.abs(l.valor))}
                  </td>
                </tr>
              ))}
              {!visiveis.length && <tr><td colSpan="7" className="vazio" style={{ padding: 20 }}>Nada com esses filtros.</td></tr>}
            </tbody>
          </table>
        </div>
        {filtradas.length > visiveis.length && (
          <div style={{ padding: 14, textAlign: 'center' }}>
            <button className="bt" onClick={() => setPagina((p) => p + 1)}>
              mostrar mais ({filtradas.length - visiveis.length} restantes)
            </button>
          </div>
        )}
      </section>

      <style jsx global>{`
        .viz-root .filtros { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; padding: 12px; }
        .viz-root .filtros select { flex: 1; min-width: 150px; }
        .viz-root .bt-link { font-size: 0.86rem; text-decoration: none; padding: 6px 10px; border: 1px solid var(--linha);
          border-radius: 7px; background: var(--surface); color: var(--ink-2); }
        .viz-root .planilha th.ord { cursor: pointer; user-select: none; position: sticky; top: 0; }
        .viz-root .planilha td { padding: 4px 8px; }
        .viz-root .planilha tr.sem-cat td { background: color-mix(in srgb, var(--atencao) 9%, transparent); }
        .viz-root .sel-cat { padding: 3px 6px; font-size: 0.82rem; max-width: 190px; border-color: transparent; background: transparent; }
        .viz-root .sel-cat:hover, .viz-root .sel-cat:focus { border-color: var(--linha); background: var(--surface); }
        .viz-root .cel-cat { font: inherit; font-size: 0.82rem; background: none; border: 1px solid transparent;
          border-radius: 6px; padding: 3px 6px; cursor: pointer; color: var(--ink); text-align: left; }
        .viz-root .cel-cat:hover { border-color: var(--linha); background: var(--surface); }
        .viz-root .cel-cat.vazio-cat { color: var(--atencao-texto); border-color: var(--atencao); }
        .viz-root .selos { margin-left: 6px; }
        .viz-root .selo { font-size: 0.68rem; color: var(--ink-3); border: 1px solid var(--linha); border-radius: 4px;
          padding: 0 5px; margin-left: 4px; white-space: nowrap; }
        .viz-root .aviso { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; padding: 10px 14px;
          border-radius: 9px; margin-bottom: 14px; font-size: 0.88rem; border: 1px solid var(--linha); background: var(--surface); }
        .viz-root .aviso-ok { box-shadow: inset 4px 0 0 var(--ok); }
        .viz-root .aviso-erro { box-shadow: inset 4px 0 0 var(--critico); }
        .viz-root .aviso-oferta { box-shadow: inset 4px 0 0 var(--s-custo_fixo); }
      `}</style>
    </Layout>
  );
}

export async function getServerSideProps({ req, query }) {
  if (!process.env.FINANCAS_SENHA || !autenticado(req)) return { props: { ok: false, erro: null } };
  try {
    const meses = await mesesComDados();
    const hoje = new Date();
    const atual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`;
    const mes = mesValido(query.mes) ?? atual;
    const periodo = query.periodo === '12m' ? '12m' : 'mes';
    const de = periodo === '12m' ? `${meses.at(-1) ?? atual.slice(0, 7)}-01` : mes;
    const ate = periodo === '12m' ? `${meses[0] ?? atual.slice(0, 7)}-01` : mes;
    const [linhas, cad] = await Promise.all([transacoes({ de, ate }), cadastros()]);
    const filtroInicial = {};
    for (const k of ['categoria', 'conta', 'pessoa', 'tipo', 'grupo', 'q']) {
      if (typeof query[k] === 'string' && query[k].length <= 60) filtroInicial[k] = query[k];
    }
    return { props: { ok: true, linhas, cad, mes, periodo, filtroInicial } };
  } catch (e) {
    console.error('transações falhou:', e);
    return { props: { ok: false, erro: 'Não consegui ler o banco agora.' } };
  }
}
