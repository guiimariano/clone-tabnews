// GERADO por financas-casal/scripts/sync-webhook.mjs — não edite aqui.
// A fonte e os testes ficam no projeto privado financas-casal.
// Webhook do bot. Função serverless na Vercel.
//
// Responde 200 SEMPRE: o Telegram reentrega o update quando recebe erro, e
// reentrega é duplicata. A idempotência real vem de
// origem_ref = 'tg:<update_id>' com unique (origem, origem_ref) no banco,
// mas devolver 200 evita a tentativa.
import { randomUUID } from 'node:crypto';
import { q, brl, hojeSP, mesRefSP } from '../../../lib/financas/pg.js';
import { parse, dividirParcelas } from '../../../lib/financas/parser.js';
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
    case 'lancamento':return lancar(msg, r, usuario, update.update_id);
    case 'erro':
      // Mensagem sem número é conversa, não lançamento malfeito: fica calado.
      if (r.erro === 'sem_valor') return;
      return responderA(msg.chat.id, msg.message_id, '🤔 Não entendi o valor.');
    default:
      return;
  }
}

// ---------- lançamento ----------
async function lancar(msg, r, usuario, updateId) {
  const parcelas = dividirParcelas(r.valor, r.parcelas);
  const grupo = r.parcelas > 1 ? randomUUID() : null;
  const hoje = hojeSP();
  let primeiroId = null;

  for (let i = 0; i < parcelas.length; i++) {
    const ins = await q(
      `insert into public.lancamentos
         (data_compra, mes_ref, valor, tipo, categoria_id, descricao,
          usuario_id, pagador_id, origem, origem_ref, texto_original,
          parcela_grupo_id, parcela_num, parcela_total)
       values ($1,$2,$3,$4,$5,$6,$7,$7,'telegram',$8,$9,$10,$11,$12)
       on conflict (origem, origem_ref) do nothing
       returning id`,
      [
        hoje, mesRefSP(i), parcelas[i],
        r.intencao, r.categoria_id, r.descricao,
        usuario.id,
        `tg:${updateId}:${i}`, r.texto,
        grupo, i + 1, r.parcelas,
      ]
    );
    if (i === 0) primeiroId = ins.rows[0]?.id ?? null;
  }

  // reentrega do mesmo update: já estava gravado, não responde de novo
  if (!primeiroId) return;

  const sinal = r.intencao === 'entrada' ? '💰' : '✅';
  const parc = r.parcelas > 1 ? ` em ${r.parcelas}x de R$ ${brl(parcelas[1] ?? parcelas[0])}` : '';
  const desc = r.descricao ? ` · ${r.descricao}` : '';

  // sem categoria: pergunta com botões em vez de chutar
  if (!r.categoria_id && r.intencao === 'saida') {
    const cats = await q(
      `select id, nome from public.categorias
        where ativo and tipo = 'variavel' order by ordem limit 9`);
    return responderA(
      msg.chat.id, msg.message_id,
      `❓ R$ ${brl(r.valor)}${desc}${parc}\nQual categoria?`,
      tecladoCategorias(primeiroId, cats.rows)
    );
  }

  const saldo = await textoSaldo(r.categoria_id);
  return responderA(
    msg.chat.id, msg.message_id,
    `${sinal} <b>R$ ${brl(r.valor)}</b>${desc}${parc} · ${usuario.apelido}\n${saldo}`
  );
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
    '<code>mercado 20 arroz</code> — lançamento\n' +
    '<code>20 mercado arroz</code> — ordem livre\n' +
    '<code>casa 2400 12x geladeira</code> — parcelado\n' +
    '<code>+salario 7200</code> — entrada\n' +
    '<code>#reserva 1500</code> — aporte em meta\n\n' +
    '/saldo · /saldo mercado · /metas · /pendentes · /classificar');
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
         (Number(x.saldo) >= 0 ? ` · resta R$ ${brl(x.saldo)}` : ` · <b>estourou R$ ${brl(-x.saldo)}</b>`);
}
