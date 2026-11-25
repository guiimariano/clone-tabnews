// GERADO por financas-casal/scripts/sync-webhook.mjs — não edite aqui.
// A fonte e os testes ficam no projeto privado financas-casal.
// /financas/conectar — conecta bancos via Pluggy Connect (Open Finance).
//
// O widget roda no navegador mas não vê credencial nenhuma: pede ao
// nosso servidor um connect token de curta duração (rota autenticada),
// e no fim devolve só o id da conexão, que o servidor confirma na Pluggy.
import { useState } from 'react';
import Script from 'next/script';
import { Layout, Portao } from '../../components/financas/base.js';
import { autenticado } from '../../lib/financas/auth.js';
import { configurado } from '../../lib/financas/pluggy.js';
import { q } from '../../lib/financas/pg.js';

const ROTULO_STATUS = {
  UPDATED: 'em dia',
  UPDATING: 'atualizando',
  LOGIN_ERROR: 'precisa reautorizar',
  OUTDATED: 'desatualizada',
  WAITING_USER_INPUT: 'esperando você',
};

export default function Conectar({ ok, pluggy, itens }) {
  const [carregado, setCarregado] = useState(false);
  const [msg, setMsg] = useState(null);
  const [lista, setLista] = useState(itens ?? []);
  const [ocupado, setOcupado] = useState(false);

  if (!ok) return <Portao />;

  async function abrir(itemId) {
    setOcupado(true);
    setMsg(null);
    try {
      const r = await fetch('/api/financas/pluggy/connect-token', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(itemId ? { itemId } : {}),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro ?? 'falhou');

      const widget = new window.PluggyConnect({
        connectToken: j.accessToken,
        // Sandbox mostra o "Pluggy Bank" de teste. Útil para o primeiro
        // teste; depois de conectar os bancos reais, pode desligar.
        includeSandbox: true,
        ...(itemId ? { updateItem: itemId } : {}),
        onSuccess: async (itemData) => {
          const s = await fetch('/api/financas/pluggy/item', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ itemId: itemData.item.id }),
          });
          const sj = await s.json();
          if (!s.ok) return setMsg({ tom: 'erro', texto: `Conectou, mas não consegui registrar: ${sj.erro}` });
          setMsg({ tom: 'ok', texto: `Conectado: ${sj.banco ?? 'banco'} (${ROTULO_STATUS[sj.status] ?? sj.status}).` });
          setLista((l) => [
            { item_id: itemData.item.id, conector: sj.banco, status: sj.status },
            ...l.filter((x) => x.item_id !== itemData.item.id),
          ]);
        },
        onError: (erro) => {
          console.error('Pluggy Connect:', erro);
          setMsg({ tom: 'erro', texto: `A conexão falhou: ${erro?.message ?? 'erro desconhecido'}` });
        },
      });
      widget.init();
    } catch (e) {
      setMsg({ tom: 'erro', texto: e.message });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Layout ativo="conectar" titulo="Bancos" sub="conexões Open Finance pela Pluggy">
      <Script src="https://cdn.pluggy.ai/pluggy-connect/latest/pluggy-connect.js"
              strategy="afterInteractive" onLoad={() => setCarregado(true)} />
      <section className="cartao c">
        <p className="desc">
          Open Finance pela Pluggy. A autorização acontece no app do banco; nenhuma senha passa
          por aqui. O consentimento vale até 12 meses e depois precisa ser renovado.
        </p>

        {!pluggy ? (
          <p className="aviso">
            A Pluggy ainda não está configurada no servidor: faltam as variáveis
            <code>PLUGGY_CLIENT_ID</code> e <code>PLUGGY_CLIENT_SECRET</code>.
          </p>
        ) : (
          <button onClick={() => abrir()} disabled={!carregado || ocupado}>
            {carregado ? (ocupado ? 'abrindo…' : 'Conectar um banco') : 'carregando…'}
          </button>
        )}

        {msg && <p className={`msg ${msg.tom}`}>{msg.texto}</p>}

        <h2>Conexões</h2>
        {lista.length === 0 ? <p className="muted">Nenhuma ainda.</p> : (
          <ul>
            {lista.map((i) => (
              <li key={i.item_id}>
                <strong>{i.conector ?? 'banco'}</strong>{' '}
                <span className="muted">· {ROTULO_STATUS[i.status] ?? i.status ?? '—'}</span>
                {pluggy && (i.status === 'LOGIN_ERROR' || i.status === 'OUTDATED') && (
                  <button className="mini" onClick={() => abrir(i.item_id)} disabled={!carregado || ocupado}>
                    reautorizar
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <Estilo />
    </Layout>
  );
}

export async function getServerSideProps({ req }) {
  if (!process.env.FINANCAS_SENHA || !autenticado(req)) return { props: { ok: false } };
  let itens = [];
  try {
    const r = await q(`select item_id, conector, status from public.pluggy_items
                        where ativo order by created_at desc`);
    itens = r.rows;
  } catch (e) {
    console.error('pluggy_items:', e.message);
  }
  return { props: { ok: true, pluggy: configurado(), itens } };
}

function Estilo() {
  return (
    <style jsx global>{`
      .viz-root .c button { font: inherit; padding: 9px 15px; border-radius: 8px; border: 0;
        background: var(--s-custo_fixo); color: #fff; cursor: pointer; }
      .viz-root .c button:disabled { opacity: 0.5; cursor: default; }
      .viz-root .c button.mini { padding: 3px 10px; margin-left: 8px; font-size: 0.85rem; }
      .viz-root .c .msg { padding: 10px 12px; border-radius: 8px; border: 1px solid var(--linha); }
      .viz-root .c .msg.ok { box-shadow: inset 4px 0 0 var(--ok); }
      .viz-root .c .msg.erro { box-shadow: inset 4px 0 0 var(--critico); }
      .viz-root .c .aviso { box-shadow: inset 4px 0 0 var(--atencao); padding: 10px 12px; border-radius: 8px; }
      .viz-root .c ul { padding-left: 18px; }
      .viz-root .c li { margin: 6px 0; }
    `}</style>
  );
}
