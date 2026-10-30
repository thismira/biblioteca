// Link de busca do livro na Amazon UK (amazon.co.uk).
// É só um link para ela clicar: o site nunca consulta a Amazon nem busca
// preços sozinho.

const BASE = "https://www.amazon.co.uk/s";

// Busca por título + autor, na seção de livros (`i=stripbooks`).
// Não usa o ISBN: o da Open Library costuma ser de uma edição americana ou
// brasileira que a Amazon UK não vende, e aí a busca volta vazia.
export function amazonUrl(book) {
  const query = [book.title, book.author].filter(Boolean).join(" ");
  return `${BASE}?k=${encodeURIComponent(query)}&i=stripbooks`;
}
