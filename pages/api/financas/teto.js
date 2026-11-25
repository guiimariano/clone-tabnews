// GERADO por financas-casal/scripts/sync-webhook.mjs — não edite aqui.
// A fonte e os testes ficam no projeto privado financas-casal.
// Define o teto mensal de uma categoria variável (tela de orçamento).
import { autenticado } from '../../../lib/financas/auth.js';
import { definirTeto } from '../../../lib/financas/dados.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ erro: 'use POST' }); }
  if (!autenticado(req)) return res.status(401).json({ erro: 'não autenticado' });
  const { categoria_id: cat, valor } = req.body ?? {};
  if (!Number.isInteger(cat) || cat < 1 || cat > 32767) return res.status(400).json({ erro: 'categoria inválida' });
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor < 0 || valor > 1e6) {
    return res.status(400).json({ erro: 'valor inválido' });
  }
  try {
    const ok = await definirTeto(cat, Math.round(valor * 100) / 100);
    return ok ? res.status(200).json({ ok: true }) : res.status(404).json({ erro: 'só categorias variáveis têm teto' });
  } catch (e) {
    console.error('definir teto:', e.message);
    return res.status(500).json({ erro: 'falhou ao gravar' });
  }
}
