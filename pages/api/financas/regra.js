// GERADO por financas-casal/scripts/sync-webhook.mjs — não edite aqui.
// A fonte e os testes ficam no projeto privado financas-casal.
// Cria uma regra de classificação a partir da planilha ("aplicar a todas
// iguais") e já classifica o que estiver sem categoria e casar com ela.
import { autenticado } from '../../../lib/financas/auth.js';
import { criarRegra } from '../../../lib/financas/dados.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ erro: 'use POST' }); }
  if (!autenticado(req)) return res.status(401).json({ erro: 'não autenticado' });
  const { padrao, categoria_id: cat } = req.body ?? {};
  if (typeof padrao !== 'string' || padrao.trim().length < 3 || padrao.length > 80) {
    return res.status(400).json({ erro: 'o padrão precisa ter de 3 a 80 caracteres' });
  }
  if (!Number.isInteger(cat) || cat < 1 || cat > 32767) return res.status(400).json({ erro: 'categoria inválida' });
  try {
    return res.status(200).json(await criarRegra(padrao, cat));
  } catch (e) {
    console.error('criar regra:', e.message);
    return res.status(500).json({ erro: 'falhou ao criar a regra' });
  }
}
