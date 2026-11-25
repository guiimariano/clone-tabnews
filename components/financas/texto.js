// GERADO por financas-casal/scripts/sync-webhook.mjs — não edite aqui.
// A fonte e os testes ficam no projeto privado financas-casal.
// Funções de texto sem JSX: importáveis pelo node --test.

// "DROGASIL 4603" -> "drogasil"; "MP*FMBORRACHARIA" fica. Tira números
// soltos do fim (loja, terminal, documento), que mudam a cada compra e
// fariam a regra casar com uma linha só.
export function padraoSugerido(desc) {
  let p = String(desc ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  p = p.replace(/(\s+[\w*.-]*\d[\w*.-]*)+$/, '').trim();
  return p.length >= 3 ? p : String(desc ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}
