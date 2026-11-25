// GERADO por financas-casal/scripts/sync-webhook.mjs — não edite aqui.
// A fonte e os testes ficam no projeto privado financas-casal.
// Registra a conexão que o widget acabou de criar.
//
// O navegador só manda o id. Nome do banco e status vêm da própria
// Pluggy, lidos com o apiKey do servidor — um id que não for desta conta
// falha ali e não é gravado.
import { autenticado } from '../../../../lib/financas/auth.js';
import { configurado, item } from '../../../../lib/financas/pluggy.js';
import { q } from '../../../../lib/financas/pg.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ erro: 'use POST' });
  }
  if (!autenticado(req)) return res.status(401).json({ erro: 'não autenticado' });
  if (!configurado()) return res.status(503).json({ erro: 'Pluggy não configurada no servidor' });

  const itemId = String(req.body?.itemId ?? '');
  if (!UUID.test(itemId)) return res.status(400).json({ erro: 'itemId inválido' });

  let it;
  try {
    it = await item(itemId);
  } catch (e) {
    console.error('item pluggy não confirmado:', e.message);
    return res.status(e.status === 404 ? 404 : 502).json({ erro: 'conexão não encontrada na Pluggy' });
  }

  await q(
    `insert into public.pluggy_items (item_id, conector, conector_id, status, atualizado_pluggy)
     values ($1, $2, $3, $4, $5)
     on conflict (item_id) do update
        set conector = excluded.conector, conector_id = excluded.conector_id,
            status = excluded.status, atualizado_pluggy = excluded.atualizado_pluggy,
            ativo = true, updated_at = now()`,
    [it.id, it.connector?.name ?? null, it.connector?.id ?? null, it.status ?? null, it.updatedAt ?? null]
  );

  return res.status(200).json({ ok: true, banco: it.connector?.name ?? null, status: it.status ?? null });
}
