// GERADO por financas-casal/scripts/sync-webhook.mjs — não edite aqui.
// A fonte e os testes ficam no projeto privado financas-casal.
// Portão do painel: valida a senha e devolve o cookie assinado.
//
// Form HTML puro, sem JS no cliente: a senha vai no corpo do POST por
// HTTPS, o cookie volta HttpOnly, e o navegador redireciona. Nada de
// token em localStorage, que JS de terceiro leria.
import { senhaCorreta, criarToken, cookieDeSessao, cookieVazio } from '../../../lib/financas/auth.js';

export default function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }
  if (!process.env.FINANCAS_SENHA) {
    console.error('FINANCAS_SENHA ausente');
    return res.redirect(303, '/financas');
  }

  const corpo = typeof req.body === 'string' ? Object.fromEntries(new URLSearchParams(req.body)) : (req.body ?? {});

  if (corpo.acao === 'sair') {
    res.setHeader('Set-Cookie', cookieVazio());
    return res.redirect(303, '/financas');
  }

  if (!senhaCorreta(corpo.senha)) {
    // Sem detalhar o motivo e sem ecoar a tentativa.
    return res.redirect(303, '/financas?erro=1');
  }

  res.setHeader('Set-Cookie', cookieDeSessao(criarToken()));
  return res.redirect(303, '/financas');
}
