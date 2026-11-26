// GERADO por financas-casal/scripts/sync-webhook.mjs — não edite aqui.
// A fonte e os testes ficam no projeto privado financas-casal.
// Parser das mensagens do grupo. Função pura: recebe texto e o mapa de
// aliases, devolve a intenção. Sem banco, sem rede — testável isolado.
//
// A gramática é consequência do schema: o primeiro número é o valor, um
// alias resolve a categoria, o resto é descrição. Ordem livre, porque o
// parser procura o número e o alias, não posições fixas.

// "mercado" e "mercadão" têm de bater no mesmo alias
export function normalizar(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Valor em pt-BR. Aceita 20 | 20,50 | 1.234,56 | 1234.56 | R$ 20
// Devolve null quando o token não é dinheiro.
export function valorBR(token) {
  const t = normalizar(token).replace(/^r\$\s*/, '').replace(/\s/g, '');
  if (!t) return null;

  // 1.234,56 — ponto de milhar em grupos de 3, vírgula decimal
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(t)) {
    return Number(t.replace(/\./g, '').replace(',', '.'));
  }
  // 20,50
  if (/^\d+,\d{1,2}$/.test(t)) return Number(t.replace(',', '.'));
  // 20 | 1234.56 | 2.40
  if (/^\d+(\.\d{1,2})?$/.test(t)) return Number(t);
  return null;
}

// Procura o alias mais longo (até 3 palavras) a partir de cada posição.
// "comer fora 30" tem de achar "comer fora", não "comer".
function acharAlias(tokens, aliases) {
  for (let n = Math.min(3, tokens.length); n >= 1; n--) {
    for (let i = 0; i + n <= tokens.length; i++) {
      const chave = tokens.slice(i, i + n).join(' ');
      const cat = aliases.get(chave);
      if (cat !== undefined) return { categoria_id: cat, alias: chave, de: i, ate: i + n };
    }
  }
  return null;
}

/**
 * @param texto   mensagem crua do Telegram
 * @param aliases Map alias normalizado -> categoria_id
 * @param metas   Map slug de meta -> meta_id (para aporte com '#')
 */
export function parse(texto, aliases = new Map(), metas = new Map()) {
  const cru = String(texto ?? '').trim();
  if (!cru) return { tipo: 'vazio' };

  // comando: /saldo, /pendentes, /saldo@nomedobot
  if (cru.startsWith('/')) {
    const [cmd, ...resto] = normalizar(cru.slice(1)).split(' ');
    // bruto: o texto depois do comando como foi digitado (o /boleto guarda
    // a descrição com maiúscula e acento)
    const bruto = cru.replace(/^\/\S+\s*/, '');
    return { tipo: 'comando', comando: cmd.split('@')[0], args: resto.filter(Boolean), bruto };
  }

  let s = normalizar(cru);
  let intencao = 'saida';

  if (s.startsWith('+')) { intencao = 'entrada'; s = s.slice(1).trim(); }
  else if (s.startsWith('#')) { intencao = 'aporte'; s = s.slice(1).trim(); }

  const tokens = s.split(' ').filter(Boolean);
  if (!tokens.length) return { tipo: 'vazio' };

  // parcelas: token "12x"
  let parcelas = 1;
  const iParc = tokens.findIndex((t) => /^\d{1,2}x$/.test(t));
  if (iParc >= 0) {
    parcelas = Number(tokens[iParc].slice(0, -1));
    tokens.splice(iParc, 1);
  }

  // valor: primeiro token que seja dinheiro
  let valor = null;
  for (let i = 0; i < tokens.length; i++) {
    const v = valorBR(tokens[i]);
    if (v !== null) { valor = v; tokens.splice(i, 1); break; }
  }

  // aporte em meta: '#reserva 1500'
  if (intencao === 'aporte') {
    const slug = tokens.shift() ?? null;
    const meta_id = slug === null ? undefined : metas.get(slug);
    return {
      tipo: 'aporte',
      meta_id: meta_id ?? null,
      meta_slug: slug,
      valor,
      descricao: tokens.join(' ') || null,
      erro: valor === null ? 'sem_valor' : meta_id === undefined ? 'meta_desconhecida' : null,
      texto: cru,
    };
  }

  const achado = acharAlias(tokens, aliases);
  if (achado) tokens.splice(achado.de, achado.ate - achado.de);

  if (valor === null) return { tipo: 'erro', erro: 'sem_valor', texto: cru };
  if (valor <= 0) return { tipo: 'erro', erro: 'valor_invalido', texto: cru };
  if (parcelas < 1 || parcelas > 48) return { tipo: 'erro', erro: 'parcelas_invalidas', texto: cru };

  return {
    tipo: 'lancamento',
    intencao,                                  // 'saida' | 'entrada'
    categoria_id: achado ? achado.categoria_id : null,
    alias: achado ? achado.alias : null,
    valor,
    parcelas,
    descricao: tokens.join(' ') || null,
    texto: cru,
  };
}

// Divide o total em parcelas fechando a soma exata: o resto de
// arredondamento vai na primeira, não se perde nem sobra centavo.
export function dividirParcelas(total, n) {
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / n);
  const resto = cents - base * n;
  return Array.from({ length: n }, (_, i) => (base + (i === 0 ? resto : 0)) / 100);
}
