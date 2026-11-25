// GERADO por financas-casal/scripts/sync-webhook.mjs — não edite aqui.
// A fonte e os testes ficam no projeto privado financas-casal.
// Troca a categoria de um lançamento (planilha do painel).
import { autenticado } from '../../../lib/financas/auth.js';
import { trocarCategoria } from '../../../lib/financas/dados.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ erro: 'use POST' }); }
  if (!autenticado(req)) return res.status(401).json({ erro: 'não autenticado' });
  const { id, categoria_id: cat } = req.body ?? {};
  if (!UUID.test(String(id ?? ''))) return res.status(400).json({ erro: 'id inválido' });
  if (!Number.isInteger(cat) || cat < 1 || cat > 32767) return res.status(400).json({ erro: 'categoria inválida' });
  try {
    const ok = await trocarCategoria(id, cat);
    return ok ? res.status(200).json({ ok: true }) : res.status(404).json({ erro: 'lançamento não encontrado' });
  } catch (e) {
    console.error('trocar categoria:', e.message);
    return res.status(500).json({ erro: 'falhou ao gravar' });
  }
}
