// Conversa com a Open Library (catálogo gratuito, sem cadastro nem chave).

const BASE = "https://openlibrary.org";
// Na busca pedimos só os campos necessários. A lista completa de ISBNs pode
// ter milhares de itens; em vez dela pegamos a edição que bateu com a busca
// (se ela digitou em português, vem a edição em português).
const FIELDS = [
  "key", "title", "author_name", "cover_i", "number_of_pages_median",
  "first_publish_year", "subject",
  "editions", "editions.title", "editions.language", "editions.cover_i",
].join(",");

// Idiomas oferecidos na escolha de edição (código da Open Library -> nome).
export const LANGUAGES = { por: "Português", eng: "Inglês" };

export function coverUrl(coverId, size = "L") {
  return coverId ? `https://covers.openlibrary.org/b/id/${coverId}-${size}.jpg` : "";
}

// Prefere ISBN-13 (978/979…); se não houver, aceita ISBN-10.
function pickIsbn(list = []) {
  const clean = list.map((s) => s.replace(/[^0-9X]/gi, ""));
  return (
    clean.find((s) => s.length === 13 && /^97[89]/.test(s)) ||
    clean.find((s) => s.length === 10) ||
    ""
  );
}

function toResult(doc) {
  const edition = doc.editions?.docs?.[0] || {};
  const editionLang = (edition.language || []).find((l) => LANGUAGES[l]) || null;
  return {
    workKey: doc.key, // ex.: "/works/OL66554W"
    title: doc.title || "",
    // Título da edição que bateu com a busca (ex.: "A menina que roubava livros")
    displayTitle: edition.title || doc.title || "",
    // Só o primeiro nome: a Open Library costuma listar tradutores em seguida.
    author: (doc.author_name || [])[0] || "",
    year: doc.first_publish_year || null,
    pages: doc.number_of_pages_median || null,
    coverId: edition.cover_i || doc.cover_i || null,
    lang: editionLang,
    subjects: doc.subject || [],
  };
}

// Palavras tão comuns que a Open Library recusa buscar só com elas
// (ex.: "the" dá erro 422 e "of the" dá erro 500).
const COMMON_WORDS = new Set([
  "a", "o", "as", "os", "um", "uma", "e", "de", "da", "do", "das", "dos", "em", "no", "na", "que",
  "the", "of", "an", "and", "in", "on", "to", "for", "with", "is", "at", "by",
]);

// Vale a pena buscar? Precisa de 3+ letras e de alguma palavra não tão comum.
export function isSearchable(query) {
  const words = query.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  return words.join("").length >= 3 && words.some((w) => !COMMON_WORDS.has(w));
}

// Busca livros pelo texto digitado (título ou autor, em português ou inglês).
// `signal` permite cancelar a busca se ela digitar outra coisa.
export async function searchBooks(query, { signal } = {}) {
  const url = `${BASE}/search.json?q=${encodeURIComponent(query)}&fields=${FIELDS}&limit=12`;
  const res = await fetch(url, { signal });
  if (!res.ok) {
    // O servidor recusou a busca (não é falta de internet).
    const err = new Error(`Open Library respondeu ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  return data.docs.map(toResult);
}

// Edições de uma obra num idioma. Usa a "Query API", que já filtra o idioma
// no servidor (a lista comum de edições vem misturada e sem ordem).
export async function getEditions(workKey, lang, { signal } = {}) {
  const params = new URLSearchParams({
    type: "/type/edition",
    works: workKey,
    languages: `/languages/${lang}`,
    limit: "100",
  });
  // Campos que queremos de volta (a Query API pede assim: nome=vazio).
  ["key", "title", "number_of_pages", "covers", "isbn_13", "isbn_10", "publishers", "publish_date"]
    .forEach((f) => params.append(f, ""));
  const res = await fetch(`${BASE}/query.json?${params}`, { signal });
  if (!res.ok) throw new Error(`Open Library respondeu ${res.status}`);
  const list = await res.json();

  const editions = list.map((e) => ({
    key: e.key,
    title: e.title || "",
    pages: e.number_of_pages || null,
    coverId: (e.covers || []).find((c) => c > 0) || null,
    isbn: pickIsbn([...(e.isbn_13 || []), ...(e.isbn_10 || [])]),
    publisher: (e.publishers || [])[0] || "",
    year: Number((String(e.publish_date || "").match(/\d{4}/) || [])[0]) || null,
    lang,
  }));

  // Esconde edições "fantasmas" (sem capa e sem páginas), se houver outras.
  const useful = editions.filter((e) => e.coverId || e.pages);
  const shown = useful.length ? useful : editions;
  // Primeiro as mais completas (capa, páginas, ISBN), depois as mais novas.
  const score = (e) => (e.coverId ? 2 : 0) + (e.pages ? 2 : 0) + (e.isbn ? 1 : 0);
  return shown.sort((a, b) => score(b) - score(a) || (b.year || 0) - (a.year || 0));
}

// ---------- Categorias sugeridas ----------
// Os assuntos da Open Library vêm em inglês e bagunçados. Este dicionário
// traduz os mais comuns. Cada categoria lista palavras-chave procuradas.
const CATEGORY_KEYWORDS = [
  ["Fantasia", ["fantasy", "magic", "wizards", "dragons", "fairies"]],
  ["Ficção científica", ["science fiction", "sci-fi", "space opera", "time travel"]],
  ["Romance", ["romance", "love stories", "love story", "romantic"]],
  ["Mistério", ["mystery", "mysteries", "detective"]],
  ["Suspense", ["thriller", "suspense"]],
  ["Policial", ["crime", "murder"]],
  ["Terror", ["horror", "ghost stories", "supernatural"]],
  ["Ficção histórica", ["historical fiction", "fiction, historical"]],
  ["Clássicos", ["classic", "classics"]],
  ["Distopia", ["dystopia", "dystopian", "totalitarian"]],
  ["Aventura", ["adventure"]],
  ["Jovem adulto", ["young adult", "juvenile fiction", "teen"]],
  ["Infantil", ["children's", "juvenile literature", "picture books"]],
  ["Biografia", ["biography", "autobiography", "memoir"]],
  ["Poesia", ["poetry", "poems"]],
  ["Contos", ["short stories"]],
  ["Teatro", ["plays", "theater", "theatre"]], // "drama" aqui costuma ser gênero, não peça
  ["Humor", ["humor", "humour", "comedy"]],
  ["Quadrinhos", ["comics", "graphic novel", "manga"]],
  ["Filosofia", ["philosophy"]],
  ["Psicologia", ["psychology"]],
  ["Autoajuda", ["self-help", "self-actualization", "personal development"]],
  ["História", ["history"]],
  ["Espiritualidade", ["spirituality", "religion"]],
  ["Literatura brasileira", ["brazilian", "brazil"]],
];

// Devolve até 3 categorias, as que mais aparecem nos assuntos.
export function suggestCategories(subjects = []) {
  const text = subjects.map((s) => s.toLowerCase());
  const scored = CATEGORY_KEYWORDS.map(([name, keys]) => [
    name,
    text.filter((s) => keys.some((k) => s.includes(k))).length,
  ])
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name]) => name);
  if (!scored.length && text.some((s) => s.includes("fiction"))) return ["Ficção"];
  return scored;
}
