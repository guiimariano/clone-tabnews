// GERADO por financas-casal/scripts/sync-webhook.mjs — não edite aqui.
// A fonte e os testes ficam no projeto privado financas-casal.
// Portão de senha única para o painel.
//
// Duas pessoas, custo zero, ninguém precisa criar conta. O que isso tem de
// fazer bem é só não vazar e não ser contornável:
//
//   - comparação em tempo constante, para não dar pista por timing
//   - cookie assinado com HMAC sobre a expiração, então não é forjável
//     sem a senha; nada de "autenticado=true" no cookie
//   - HttpOnly + Secure + SameSite=Lax: JS da página não lê, e não viaja
//     em requisição de outro site
//   - validade curta renovável, para um cookie vazado não valer para sempre
//
// Não é login individual: os dois usam a mesma senha, então o painel não
// sabe quem está olhando. Para o painel (só leitura) isso basta; quando
// virar escrita, troque por Supabase Auth, que o schema já suporta.
import crypto from 'node:crypto';

export const COOKIE = 'financas_sessao';
const VALIDADE_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

function segredo() {
  const s = process.env.FINANCAS_SENHA;
  if (!s) throw new Error('FINANCAS_SENHA ausente');
  return s;
}

function assinar(payload) {
  return crypto.createHmac('sha256', segredo()).update(payload).digest('base64url');
}

// Tempo constante mesmo com tamanhos diferentes: timingSafeEqual exige
// buffers do mesmo tamanho, então comparamos os digests.
export function senhaCorreta(tentativa) {
  const a = crypto.createHash('sha256').update(String(tentativa ?? '')).digest();
  const b = crypto.createHash('sha256').update(segredo()).digest();
  return crypto.timingSafeEqual(a, b);
}

export function criarToken(agora = Date.now()) {
  const exp = String(agora + VALIDADE_MS);
  return `${exp}.${assinar(exp)}`;
}

export function tokenValido(token, agora = Date.now()) {
  if (typeof token !== 'string') return false;
  const i = token.indexOf('.');
  if (i <= 0) return false;
  const exp = token.slice(0, i);
  const mac = token.slice(i + 1);
  if (!/^\d+$/.test(exp)) return false;

  const esperado = assinar(exp);
  if (mac.length !== esperado.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(esperado))) return false;

  return Number(exp) > agora;
}

export function lerCookie(req, nome = COOKIE) {
  const cru = req.headers?.cookie;
  if (!cru) return null;
  for (const parte of cru.split(';')) {
    const i = parte.indexOf('=');
    if (i < 0) continue;
    if (parte.slice(0, i).trim() === nome) return decodeURIComponent(parte.slice(i + 1).trim());
  }
  return null;
}

// Path=/ e não /financas: cookie com path restrito não chega em
// /api/financas/*, e isso morderia na primeira rota de dados que eu
// adicionasse. HttpOnly + SameSite já dão o isolamento que importa.
//
// Secure só em produção, senão `next dev` em http://localhost nunca
// recebe o cookie e o login parece quebrado sem estar.
function atributos(maxAge) {
  const a = [`Path=/`, 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`];
  if (process.env.NODE_ENV === 'production') a.push('Secure');
  return a;
}

export function cookieDeSessao(token) {
  return [`${COOKIE}=${encodeURIComponent(token)}`, ...atributos(Math.floor(VALIDADE_MS / 1000))].join('; ');
}

export const cookieVazio = () => [`${COOKIE}=`, ...atributos(0)].join('; ');

export function autenticado(req) {
  return tokenValido(lerCookie(req));
}
