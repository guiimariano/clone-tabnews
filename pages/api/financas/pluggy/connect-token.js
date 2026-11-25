// GERADO por financas-casal/scripts/sync-webhook.mjs — não edite aqui.
// A fonte e os testes ficam no projeto privado financas-casal.
// Entrega ao widget um connect token da Pluggy. Só para sessão autenticada
// do painel: sem isso, qualquer um na internet abriria conexões bancárias
// na conta Pluggy do casal.
import { autenticado } from '../../../../lib/financas/auth.js';
import { configurado, connectToken } from '../../../../lib/financas/pluggy.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ erro: 'use POST' });
  }
  if (!autenticado(req)) return res.status(401).json({ erro: 'não autenticado' });
  if (!configurado()) return res.status(503).json({ erro: 'Pluggy não configurada no servidor' });

  const itemId = req.body?.itemId;
  if (itemId !== undefined && !UUID.test(String(itemId))) {
    return res.status(400).json({ erro: 'itemId inválido' });
  }

  try {
    return res.status(200).json({ accessToken: await connectToken(itemId) });
  } catch (e) {
    console.error('connect token falhou:', e.message);
    return res.status(502).json({ erro: 'a Pluggy não respondeu' });
  }
}
