// Conversa com a Open Library (catálogo gratuito, sem cadastro nem chave).

const BASE = "https://openlibrary.org";
// Na busca pedimos só os campos necessários. A lista completa de ISBNs pode
// ter milhares de itens; em vez dela pegamos a edição que bateu com a busca
// (se ela digitou em português, vem a edição em português).
const QUICK_FIELDS = [
  "key", "title", "author_name", "cover_i", "number_of_pages_median",
  "first_publish_year", "subject",
];
const FIELDS = [...QUICK_FIELDS, "editions", "editions.title", "editions.language", "editions.cover_i"];

// ---------- Pedidos à Open Library (com memória e "segunda tentativa") ----------
// A Open Library às vezes demora muito para responder um pedido que, repetido,
// volta em 1–2 s. Então: se um pedido passar de HEDGE_AFTER sem resposta,
// fazemos o mesmo pedido de novo e ficamos com o que chegar primeiro.
// As respostas ficam guardadas na memória: repetir uma busca, voltar para os
// resultados ou reabrir as edições de um livro é instantâneo.
const HEDGE_AFTER = 4000; // ms
const MAX_CACHE = 80;     // quantas respostas guardar
const cache = new Map();  // url -> Promise com o JSON

function requestJson(url) {
  return new Promise((resolve, reject) => {
    const controllers = [];
    let running = 0;
    let settled = false;
    let hedge;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(hedge);
      controllers.forEach((c) => c.abort()); // cancela a tentativa que perdeu
      fn(value);
    };
    const attempt = () => {
      const controller = new AbortController();
      controllers.push(controller);
      running++;
      fetch(url, { signal: controller.signal })
        .then((res) => {
          if (!res.ok) {
            // O servidor recusou o pedido (não é falta de internet).
            const err = new Error(`Open Library respondeu ${res.status}`);
            err.status = res.status;
            throw err;
          }
          return res.json();
        })
        .then((data) => finish(resolve, data), (err) => {
          running--;
          if (settled) return;
          // Erro de rede ou do servidor (5xx): tenta mais uma vez.
          const retry = controllers.length < 2 && !(err.status >= 400 && err.status < 500);
          if (retry) attempt();
          else if (!running) finish(reject, err);
        });
    };
    attempt();
    hedge = setTimeout(() => controllers.length < 2 && attempt(), HEDGE_AFTER);
  });
}

// Mesmo pedido = mesma resposta (e o mesmo pedido em andamento é reaproveitado).
// `signal` só cancela a espera de quem pediu: o pedido continua e fica guardado.
function getJson(url, { signal } = {}) {
  let promise = cache.get(url);
  if (!promise) {
    promise = requestJson(url);
    cache.set(url, promise);
    promise.catch(() => cache.delete(url)); // erro não fica guardado
    if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
  }
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException("Cancelado", "AbortError"));
    if (signal.aborted) return abort();
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

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
// `quick: true` pula a edição que bateu com a busca: responde bem mais rápido,
// mas o título vem no idioma original (ex.: "The Book Thief" em vez de
// "A menina que roubava livros"). O cadastro pede as duas versões juntas e
// troca a rápida pela completa quando ela chega.
// `signal` permite cancelar a busca se ela digitar outra coisa.
export async function searchBooks(query, { signal, quick = false } = {}) {
  const fields = (quick ? QUICK_FIELDS : FIELDS).join(",");
  const url = `${BASE}/search.json?q=${encodeURIComponent(query)}&fields=${fields}&limit=12`;
  const data = await getJson(url, { signal });
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
  const list = await getJson(`${BASE}/query.json?${params}`, { signal });

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

// Acha um livro já conhecido (ex.: vindo do Goodreads) para pegar capa,
// páginas e assuntos: pelo ISBN (edição exata) ou por título + autor.
export async function findBook({ isbn, title, author }, { signal } = {}) {
  const tries = [];
  if (isbn) tries.push(`isbn=${encodeURIComponent(isbn)}`);
  if (title) tries.push(`title=${encodeURIComponent(title)}${author ? `&author=${encodeURIComponent(author)}` : ""}`);
  let found = null;
  for (const query of tries) {
    const data = await getJson(`${BASE}/search.json?${query}&fields=${FIELDS.join(",")}&limit=1`, { signal });
    if (!data.docs.length) continue;
    const result = toResult(data.docs[0]);
    if (result.coverId) return result;
    found ||= result; // achou, mas sem capa: tenta o próximo jeito
  }
  return found;
}

// Começa a buscar as edições antes do clique (ao passar o mouse ou focar um
// resultado). Quando ela clicar, a resposta já está chegando ou guardada.
export function prefetchEditions(workKey) {
  for (const lang of Object.keys(LANGUAGES)) getEditions(workKey, lang).catch(() => {});
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
