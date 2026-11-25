// GERADO por financas-casal/scripts/sync-webhook.mjs — não edite aqui.
// A fonte e os testes ficam no projeto privado financas-casal.
// Sincronização diária Pluggy -> Supabase, disparada pelo Vercel Schedules.
//
// Alvo de um schedule com gatilho schedule/v1beta (vercel.json): a função
// é PRIVADA, sem URL pública, e só o agendador do Vercel a invoca. A
// checagem dos cabeçalhos CloudEvent abaixo é só para recusar chamada que
// não seja um disparo de schedule — não é a barreira de segurança.
//
// Testado em preview (25/11/2026): o agendador chama POST neste caminho
// com os cabeçalhos ce-*; um POST de fora, mesmo com os cabeçalhos
// forjados, recebe 404 da plataforma e não executa nada.
//
// Idempotente: rodar duas vezes não duplica (origem_ref = pluggy:<id>).
// Sem retry (alvo function): uma falha vira 500 no histórico e a próxima
// execução, no dia seguinte, recupera tudo, porque a Pluggy devolve o
// histórico inteiro a cada leitura.
import { sincronizar } from '../../../../lib/financas/pluggy-sync.js';
import { configurado } from '../../../../lib/financas/pluggy.js';

export const config = { maxDuration: 300 };

const h = (req, k) => req.headers[k];

export default async function handler(req, res) {
  console.log(`pluggy-sync entrada: ${req.method} ce-type=${h(req, "ce-type") ?? "-"}`);
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ erro: 'use POST' }); }
  if (h(req, 'ce-specversion') !== '1.0' || h(req, 'ce-type') !== 'com.vercel.schedule.v1beta' || !h(req, 'ce-id')) {
    return res.status(400).json({ erro: 'não é um disparo de schedule' });
  }
  if (!configurado()) {
    console.error("pluggy-sync: sem PLUGGY_CLIENT_ID/SECRET neste ambiente");
    return res.status(503).json({ erro: 'Pluggy não configurada' });
  }

  const execucao = h(req, 'ce-id');
  const t0 = Date.now();
  try {
    const r = await sincronizar({ gravar: true });
    const resumo = r.contas.map((c) => (c.modo === 'saldo'
      ? `${c.conta}: saldo ${c.saldo}`
      : `${c.conta}: ${c.novas} novas, ${c.atualizadas} atualizadas, ${c.removidas} removidas`));
    console.log(`pluggy-sync ${execucao} ok em ${Date.now() - t0}ms · ${resumo.join(' · ')}`);
    return res.status(200).json({ ok: true, execucao, contas: resumo, descobertas: r.descobertas.length });
  } catch (e) {
    console.error(`pluggy-sync ${execucao} falhou em ${Date.now() - t0}ms:`, e.message);
    return res.status(500).json({ ok: false, erro: e.message });
  }
}
