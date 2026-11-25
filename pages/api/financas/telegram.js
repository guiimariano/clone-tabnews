// GERADO por financas-casal/scripts/sync-webhook.mjs — não edite aqui.
// A fonte e os testes ficam no projeto privado financas-casal.
// Webhook do bot. Função serverless na Vercel.
//
// SÓ CONSULTA desde 25/11/2026: os gastos entram pela Pluggy (Open
// Finance). O bot responde /resumo, /faturas, /saldo, /metas, classifica
// pendentes (/classificar e botões) e registra APORTE em meta (#meta valor)
// — aporte não é gasto, e o banco não sabe para qual meta foi o dinheiro.
//
// Responde 200 SEMPRE: o Telegram reentrega o update quando recebe erro, e
// reentrega é duplicata. Devolver 200 evita a tentativa.
import { q, brl, hojeSP, mesRefSP } from '../../../lib/financas/pg.js';
import { parse } from '../../../lib/financas/parser.js';
import { dashboard } from '../../../lib/financas/dados.js';
import {
  responderA, responder, editar, confirmarBotao, tecladoCategorias, barra,
} from '../../../lib/financas/telegram.js';

export default async function handler(req, res) {
  // 1. autenticidade: segredo combinado no setWebhook
  if (req.headers['x-telegram-bot-api-secret-token'] !== process.env.TELEGRAM_SECRET) {
    return res.status(401).json({ ok: false });
  }
  if (req.method !== 'POST') return res.status(405).json({ ok: false });

  // A Vercel entrega req.body já parseado para application/json, mas se o
  // content-type vier diferente chega string. Aceitar os dois evita uma
  // falha opaca em produção que o teste local não pega.
  let body = req.body ?? {};
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }

  try {
    await tratar(body);
  } catch (e) {
    console.error('erro ao tratar update:', e);
  }
  return res.status(200).json({ ok: true });
}

async function tratar(update) {
  if (update.callback_query) return tratarBotao(update.callback_query);

  const msg = update.message ?? update.edited_message;
  if (!msg?.text) return;

  // 2. só o grupo do casal
  const chatPermitido = String(process.env.TELEGRAM_CHAT_ID ?? '');
  if (chatPermitido && String(msg.chat.id) !== chatPermitido) {
    console.warn('chat não autorizado:', msg.chat.id);
    return;
  }

  // 3. quem lançou
  const u = await q('select id, apelido from public.usuarios where telegram_user_id = $1 and ativo',
    [msg.from.id]);
  if (!u.rowCount) {
    return responderA(msg.chat.id, msg.message_id,
      `Não reconheço este usuário do Telegram (id <code>${msg.from.id}</code>).\n` +
      `Cadastre em <code>usuarios.telegram_user_id</code>.`);
  }
  const usuario = u.rows[0];

  // 4. vocabulário e metas, do banco
  const [aliases, metas] = await Promise.all([
    q(`select a.alias, a.categoria_id from public.categoria_aliases a
         join public.categorias c on c.id = a.categoria_id where c.ativo`),
    q(`select slug, id from public.metas where ativo and concluida_em is null`),
  ]);
  const mapaAliases = new Map(aliases.rows.map((r) => [r.alias, r.categoria_id]));
  const mapaMetas = new Map(metas.rows.map((r) => [r.slug, r.id]));

  const r = parse(msg.text, mapaAliases, mapaMetas);

  switch (r.tipo) {
    case 'comando':   return comando(msg, r);
    case 'aporte':    return aporte(msg, r, usuario);
    case 'lancamento':return avisoConsulta(msg, r);
    case 'erro':
      // Mensagem sem número é conversa, não lançamento malfeito: fica calado.
      if (r.erro === 'sem_valor') return;
      return responderA(msg.chat.id, msg.message_id, '🤔 Não entendi o valor.');
    default:
      return;
  }
}

// ---------- lançamento: não grava mais ----------
// Só avisa quando a intenção é clara (categoria reconhecida ou entrada com
// +). Número solto no meio da conversa continua sem resposta.
const PAINEL = 'https://guimariano.com.br/financas';
async function avisoConsulta(msg, r) {
  if (!r.categoria_id && r.intencao !== 'entrada') return;
  return responderA(msg.chat.id, msg.message_id,
    '📊 Não precisa mais lançar: os gastos entram sozinhos pela Pluggy (Open Finance).\n' +
    '/resumo · /faturas · /saldo · /metas\n' +
    `Painel: ${PAINEL}`);
}

// ---------- aporte em meta ----------
async function aporte(msg, r, usuario) {
  if (r.erro === 'sem_valor') {
    return responderA(msg.chat.id, msg.message_id, '🤔 Faltou o valor do aporte.');
  }
  if (r.erro === 'meta_desconhecida') {
    const ms = await q('select slug from public.metas where ativo and concluida_em is null order by prioridade');
    return responderA(msg.chat.id, msg.message_id,
      `Não conheço a meta <code>${r.meta_slug ?? '?'}</code>.\n` +
      `Metas: ${ms.rows.map((x) => `<code>${x.slug}</code>`).join(', ')}`);
  }

  await q(
    `insert into public.meta_aportes (meta_id, mes_ref, data, valor, usuario_id, observacao)
     values ($1,$2,$3,$4,$5,$6)`,
    [r.meta_id, mesRefSP(0), hojeSP(), r.valor, usuario.id, r.descricao]
  );

  const m = await q(
    `select nome, acumulado, valor_alvo, falta, pct, aporte_mensal_necessario
       from public.vw_metas where id = $1`, [r.meta_id]);
  const x = m.rows[0];
  return responderA(msg.chat.id, msg.message_id,
    `🎯 <b>R$ ${brl(r.valor)}</b> em ${x.nome} · ${usuario.apelido}\n` +
    `${barra(x.pct)} ${brl(x.acumulado)} de ${brl(x.valor_alvo)} (${x.pct}%)\n` +
    `Falta R$ ${brl(x.falta)}` +
    (x.aporte_mensal_necessario ? ` · ritmo R$ ${brl(x.aporte_mensal_necessario)}/mês` : ''));
}

// ---------- comandos ----------
async function comando(msg, r) {
  const chat = msg.chat.id;

  if (r.comando === 'resumo') {
    const d = await dashboard();
    const soma = (tipo) => d.totais.filter((t) => t.mes_ref === d.mes && t.tipo === tipo)
      .reduce((a, t) => a + t.valor, 0);
    const rec = soma('entrada'), desp = soma('saida');
    const ponto = d.curva[d.hoje - 1];
    const ritmo = ponto && ponto.mediana !== null
      ? `${ponto.mes > ponto.mediana ? '🔺' : '🔹'} R$ ${brl(Math.abs(ponto.mes - ponto.mediana))} ` +
        `${ponto.mes > ponto.mediana ? 'acima' : 'abaixo'} da mediana até o dia ${d.hoje}\n`
      : '';
    const top = d.porCategoria.slice(0, 5).map((c) => `  ${c.nome}: R$ ${brl(c.valor)}`).join('\n');
    const aberto = d.abertas.reduce((a, x) => a + x.valor, 0);
    return responder(chat,
      `<b>Resumo do mês</b> (dia ${d.hoje} de ${d.diasMes})\n\n` +
      `Receitas: R$ ${brl(rec)}\nDespesas: R$ ${brl(desp)}\n` +
      `Resultado: <b>R$ ${brl(rec - desp)}</b>\n${ritmo}\n` +
      `<b>Maiores gastos</b>\n${top}\n\n` +
      `Faturas em aberto: R$ ${brl(aberto)} · /faturas` +
      (d.pendentes.n ? `\nSem categoria: ${d.pendentes.n} (R$ ${brl(d.pendentes.valor)}) · /classificar` : '') +
      `\n\n${PAINEL}`);
  }

  if (r.comando === 'faturas') {
    const d = await dashboard();
    if (!d.abertas.length) return responder(chat, '✨ Nenhuma fatura em aberto.');
    const dt = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—');
    const linhas = d.abertas.map((a) =>
      `💳 <b>${a.nome}</b>\n     R$ ${brl(a.valor)} · vence ${dt(a.vence)}` +
      (a.previsao ? ' (saldo do cartão)' : ` · ${a.n} compras`));
    const total = d.abertas.reduce((s, a) => s + a.valor, 0);
    return responder(chat, `<b>Faturas em aberto</b>\n\n${linhas.join('\n')}\n\nTotal: <b>R$ ${brl(total)}</b>`);
  }

  if (r.comando === 'saldo' && r.args.length) {
    const cat = await q(
      `select categoria_id from public.categoria_aliases where alias = $1`, [r.args[0]]);
    if (!cat.rowCount) return responderA(chat, msg.message_id, `Não conheço "${r.args[0]}".`);
    return responder(chat, await textoSaldo(cat.rows[0].categoria_id));
  }

  if (r.comando === 'saldo') {
    const o = await q(
      `select nome, gasto, limite, pct from public.orcamento()
        where limite is not null and limite > 0 order by pct desc nulls last`);
    const linhas = o.rows.map(
      (x) => `${barra(x.pct)} <b>${x.nome}</b>\n     ${brl(x.gasto)} de ${brl(x.limite)} · ${x.pct ?? 0}%`);
    const p = await q('select * from public.plano_mensal()');
    const pl = p.rows[0];
    return responder(chat,
      `<b>Orçamento do mês</b>\n\n${linhas.join('\n')}\n\n` +
      `Disponível para variáveis: R$ ${brl(pl.disponivel_variaveis)}\n` +
      `Folga: R$ ${brl(pl.folga)}`);
  }

  if (r.comando === 'metas') {
    const m = await q(
      `select nome, acumulado, valor_alvo, pct, status, aporte_mensal_necessario
         from public.vw_metas order by prioridade`);
    return responder(chat, '<b>Metas</b>\n\n' + m.rows.map(
      (x) => `${barra(x.pct)} <b>${x.nome}</b>\n     ${brl(x.acumulado)} de ${brl(x.valor_alvo)}` +
             (x.aporte_mensal_necessario ? ` · R$ ${brl(x.aporte_mensal_necessario)}/mês` : '')
    ).join('\n'));
  }

  if (r.comando === 'pendentes') {
    const p = await q(
      `select id, valor, descricao, data_compra from public.lancamentos
        where categoria_id is null and tipo = 'saida'
        order by created_at desc limit 10`);
    if (!p.rowCount) return responder(chat, '✨ Nada pendente.');
    return responder(chat, '<b>Sem categoria</b>\n\n' + p.rows.map(
      (x) => `R$ ${brl(x.valor)} · ${x.descricao ?? '(sem descrição)'}`).join('\n') +
      '\n\nUse /classificar para resolver um por um.');
  }

  if (r.comando === 'classificar') {
    const p = await q(
      `select id, valor, descricao from public.lancamentos
        where categoria_id is null and tipo = 'saida'
        order by created_at limit 1`);
    if (!p.rowCount) return responder(chat, '✨ Nada pendente.');
    const x = p.rows[0];
    const cats = await q(
      `select id, nome from public.categorias where ativo and tipo = 'variavel' order by ordem limit 9`);
    return responder(chat, `❓ R$ ${brl(x.valor)} · ${x.descricao ?? '(sem descrição)'}\nQual categoria?`,
      tecladoCategorias(x.id, cats.rows));
  }

  return responder(chat,
    '<b>Como usar</b>\n\n' +
    'Os gastos entram sozinhos pela Pluggy. Aqui é para consultar:\n\n' +
    '/resumo — o mês até agora\n' +
    '/faturas — cartões em aberto e vencimento\n' +
    '/saldo · /saldo mercado — tetos do orçamento\n' +
    '/metas — progresso das metas\n' +
    '/pendentes · /classificar — compras sem categoria\n\n' +
    '<code>#reserva_emergencia 1500</code> — registrar aporte em meta\n\n' +
    `Painel completo: ${PAINEL}`);
}

// ---------- botão de categoria ----------
async function tratarBotao(cb) {
  const m = /^cat:([0-9a-f-]+):(\d+)$/.exec(cb.data ?? '');
  if (!m) return confirmarBotao(cb.id, 'Botão inválido');
  const [, lancamentoId, categoriaId] = m;

  const upd = await q(
    `update public.lancamentos set categoria_id = $2, updated_at = now()
      where id = $1 and categoria_id is null
      returning valor, descricao`,
    [lancamentoId, Number(categoriaId)]);

  if (!upd.rowCount) return confirmarBotao(cb.id, 'Já estava classificado');

  const l = upd.rows[0];
  const c = await q('select nome from public.categorias where id = $1', [Number(categoriaId)]);
  await confirmarBotao(cb.id, c.rows[0].nome);

  const saldo = await textoSaldo(Number(categoriaId));
  return editar(cb.message.chat.id, cb.message.message_id,
    `✅ <b>R$ ${brl(l.valor)}</b>${l.descricao ? ` · ${l.descricao}` : ''} → ${c.rows[0].nome}\n${saldo}`);
}

// ---------- saldo de uma categoria ----------
async function textoSaldo(categoriaId) {
  if (!categoriaId) return '';
  const o = await q(
    `select nome, gasto, limite, saldo, pct from public.orcamento() where id = $1`, [categoriaId]);
  if (!o.rowCount) return '';
  const x = o.rows[0];
  if (!x.limite) return `${x.nome}: R$ ${brl(x.gasto)} este mês (sem limite)`;
  return `${barra(x.pct)} ${x.nome}: ${brl(x.gasto)} de ${brl(x.limite)}` +
         (Number(x.saldo) >= 0 ? ` · resta R$ ${brl(x.saldo)}` : ` · <b>passou do teto em R$ ${brl(-x.saldo)}</b>`);
}
