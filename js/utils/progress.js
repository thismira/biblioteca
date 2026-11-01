// Progresso de leitura. Livros físicos contam por página; no Kindle ela vê
// só a porcentagem (o Kindle não mostra páginas), então guardamos
// `progressPercent` e, se o total de páginas for conhecido, uma página
// aproximada em `currentPage`.

export const isKindle = (book) => book.format === "kindle";

const clampPercent = (n) => Math.max(0, Math.min(100, Math.round(n)));

// Quanto do livro já foi lido (0–100), ou null se não dá para saber.
export function readPercent(book) {
  if (isKindle(book) && book.progressPercent != null) return clampPercent(book.progressPercent);
  if (!book.pages) return null;
  return clampPercent(((book.currentPage || 0) / book.pages) * 100);
}

// Porcentagem de uma entrada do histórico ({ date, page, percent? }).
export function entryPercent(entry, pages) {
  if (entry.percent != null) return entry.percent;
  return pages ? clampPercent((entry.page / pages) * 100) : null;
}

// Página aproximada de uma porcentagem (0 se o total for desconhecido).
export const pageAt = (percent, pages) => (pages ? Math.round((percent / 100) * pages) : 0);

// Mudanças para registrar que ela está em `percent`% (Kindle).
export function percentProgress(book, percent, date = new Date().toISOString()) {
  const p = clampPercent(percent);
  const page = pageAt(p, book.pages);
  return {
    progressPercent: p,
    currentPage: page,
    progressLog: [...(book.progressLog || []), { date, page, percent: p }],
  };
}
