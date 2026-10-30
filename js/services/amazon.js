// Link de busca do livro na Amazon UK (amazon.co.uk).
// É só um link para ela clicar: o site nunca consulta a Amazon nem busca
// preços sozinho.

const BASE = "https://www.amazon.co.uk/s";

// Com ISBN a busca acha a edição exata; sem ISBN, usa título + autor.
// `i=stripbooks` limita a busca à seção de livros.
export function amazonUrl(book) {
  const query = book.isbn || [book.title, book.author].filter(Boolean).join(" ");
  return `${BASE}?k=${encodeURIComponent(query)}&i=stripbooks`;
}
