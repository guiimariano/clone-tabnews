// GERADO por financas-casal/scripts/sync-webhook.mjs — não edite aqui.
// A fonte e os testes ficam no projeto privado financas-casal.
// Cliente mínimo da Bot API. Sem SDK: são três endpoints.
const API = () => `https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}`;

async function chamar(metodo, corpo) {
  const r = await fetch(`${API()}/${metodo}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) console.error(`telegram ${metodo} falhou:`, j.description ?? r.status);
  return j;
}

export const responder = (chat_id, text, extra = {}) =>
  chamar('sendMessage', { chat_id, text, parse_mode: 'HTML', ...extra });

export const responderA = (chat_id, message_id, text, extra = {}) =>
  responder(chat_id, text, { reply_to_message_id: message_id, ...extra });

export const editar = (chat_id, message_id, text, extra = {}) =>
  chamar('editMessageText', { chat_id, message_id, text, parse_mode: 'HTML', ...extra });

// Confirma o toque no botão: sem isso o Telegram deixa o spinner girando
export const confirmarBotao = (callback_query_id, text) =>
  chamar('answerCallbackQuery', { callback_query_id, text });

// Teclado de categorias para classificar um lançamento pendente
export function tecladoCategorias(lancamentoId, categorias) {
  const botoes = categorias.map((c) => ({
    text: c.nome,
    callback_data: `cat:${lancamentoId}:${c.id}`,
  }));
  const linhas = [];
  for (let i = 0; i < botoes.length; i += 3) linhas.push(botoes.slice(i, i + 3));
  return { reply_markup: { inline_keyboard: linhas } };
}

// Barra de progresso em texto: verde até 79%, amarelo até 100%, vermelho acima
export function barra(pct) {
  const p = Math.max(0, Math.min(Number(pct ?? 0), 150));
  const cheios = Math.round((Math.min(p, 100) / 100) * 10);
  const cor = p > 100 ? '🔴' : p >= 80 ? '🟡' : '🟢';
  return `${cor} ${'▰'.repeat(cheios)}${'▱'.repeat(10 - cheios)}`;
}
