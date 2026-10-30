// Conversa com a Open Library (catálogo gratuito, sem cadastro nem chave).

const BASE = "https://openlibrary.org";
// Pedimos só os campos necessários. A lista completa de ISBNs pode ter
// milhares de itens, então pegamos só a edição principal de cada obra.
const FIELDS = [
  "key", "title", "author_name", "cover_i", "number_of_pages_median",
  "first_publish_year", "subject", "editions", "editions.isbn",
].join(",");

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
  return {
    workKey: doc.key, // ex.: "/works/OL66554W"
    title: doc.title || "",
    author: (doc.author_name || []).slice(0, 2).join(", "),
    year: doc.first_publish_year || null,
    pages: doc.number_of_pages_median || null,
    coverId: doc.cover_i || null,
    isbn: pickIsbn(doc.editions?.docs?.[0]?.isbn),
    subjects: doc.subject || [],
  };
}

// Busca livros pelo texto digitado (título, autor ou os dois).
// `signal` permite cancelar a busca se ela digitar outra coisa.
export async function searchBooks(query, { signal } = {}) {
  const url = `${BASE}/search.json?q=${encodeURIComponent(query)}&fields=${FIELDS}&limit=12`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Open Library respondeu ${res.status}`);
  const data = await res.json();
  return data.docs.map(toResult);
}

// Quando a edição principal não tem ISBN, procura nas outras edições.
export async function findIsbn(workKey) {
  try {
    const res = await fetch(`${BASE}${workKey}/editions.json?limit=50`);
    if (!res.ok) return "";
    const data = await res.json();
    for (const ed of data.entries || []) {
      const isbn = pickIsbn([...(ed.isbn_13 || []), ...(ed.isbn_10 || [])]);
      if (isbn) return isbn;
    }
  } catch {
    // sem internet ou erro: seguimos sem ISBN, ela pode digitar à mão
  }
  return "";
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
