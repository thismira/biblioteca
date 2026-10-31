// Lê livros do Goodreads de dois jeitos:
//  - a página "lista de livros" salva pelo navegador (Cmd+S), em modo
//    impressão (`/review/list/<id>?print=true`). Serve para a lista de um
//    amigo, que não dá para exportar. Pode vir em várias páginas.
//  - a planilha oficial (`goodreads_library_export.csv`, em My Books →
//    Import and export → Export Library), que só a dona da conta baixa.
// Devolve livros no formato do site (sem capa: a capa vem depois, da Open
// Library) e nunca acessa o Goodreads pela internet.

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n) => String(n).padStart(2, "0");

// "Sep 20, 2026" / "Sep 2026" / "2026" / "2026/09/20" -> "2026-09-20" (ou "").
function parseDate(text = "") {
  const t = text.trim();
  let m = t.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = t.match(/(?:([A-Za-z]{3})[a-z]*\s+)?(?:(\d{1,2}),\s*)?(\d{4})/);
  if (!m) return "";
  const month = m[1] ? MONTHS[m[1].toLowerCase()] || 1 : 1;
  return `${m[3]}-${pad(month)}-${pad(m[2] || 1)}`;
}

// "Tomforde, Liz" -> "Liz Tomforde"
function authorName(text = "") {
  const t = text.replace(/\s+/g, " ").trim();
  const [last, first] = t.split(/,\s*/);
  return first ? `${first} ${last}` : t;
}

// Tira o subtítulo ("Tuesdays with Morrie: An Old Man…" -> "Tuesdays with
// Morrie"): na lombada, título longo vira letra minúscula.
function mainTitle(text = "") {
  const t = text.replace(/\s+/g, " ").trim();
  const i = t.indexOf(": ");
  return i >= 2 ? t.slice(0, i) : t;
}

const isKindle = (binding = "") => /kindle|ebook|e-book|nook|digital/i.test(binding);
const cleanIsbn = (text = "") => text.replace(/[^0-9X]/gi, "");

// Status a partir do que o Goodreads guarda.
// Na página salva não vêm as estantes, então deduzimos: começou e não
// terminou = lendo; leu (ou deu nota) = lido; senão = quero ler.
function guessStatus({ shelf, started, finished, readCount, rating }) {
  if (shelf === "currently-reading") return "lendo";
  if (shelf === "read") return "lido";
  if (shelf === "to-read") return "quero ler";
  if (started && !finished) return "lendo";
  if (readCount > 0 || finished || rating > 0) return "lido";
  return "quero ler";
}

function toBook(g) {
  const status = guessStatus(g);
  const book = {
    goodreadsId: g.id,
    title: mainTitle(g.title),
    author: g.author,
    pages: g.pages || null,
    isbn: g.isbn,
    format: isKindle(g.binding) ? "kindle" : "fisico",
    status,
    rating: g.rating || 0,
    review: g.review || "",
    startDate: g.started || "",
    endDate: status === "lido" ? g.finished || "" : "",
    currentPage: status === "lido" && g.pages ? g.pages : 0,
    favorite: (g.shelves || []).some((s) => /favou?rite/i.test(s)),
    shelves: (g.shelves || []).filter((s) => !["read", "to-read", "currently-reading"].includes(s) && !/favou?rite/i.test(s)),
  };
  // Data em que ela adicionou no Goodreads vira a data de cadastro.
  if (g.added) book.createdAt = new Date(g.added + "T12:00:00").toISOString();
  return book;
}

// ---------- Página salva (HTML) ----------

function parseListPage(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const rows = [...doc.querySelectorAll("tr.bookalike.review, tr[id^='review_']")];
  return rows.map((row) => {
    const value = (name) => row.querySelector(`td.field.${name} .value`);
    const text = (name) => (value(name)?.textContent || "").replace(/\s+/g, " ").trim();
    const link = value("title")?.querySelector("a");
    // Título sem a série ("(Windy City, #2)" fica num <span> à parte).
    const titleEl = link?.cloneNode(true);
    titleEl?.querySelectorAll("span").forEach((s) => s.remove());
    // Releituras têm várias datas: fica a mais recente.
    const latest = (selector) => [...row.querySelectorAll(selector)].map((el) => parseDate(el.textContent)).filter(Boolean).sort().pop() || "";
    const pages = Number((text("num_pages").match(/\d[\d,]*/) || [""])[0].replace(/,/g, "")) || null;
    const added = value("date_added")?.querySelector("[title]")?.getAttribute("title") || text("date_added");
    return {
      id: row.id.replace("review_", ""),
      title: titleEl?.textContent || link?.getAttribute("title") || "",
      author: authorName(value("author")?.querySelector("a")?.textContent || ""),
      isbn: cleanIsbn(text("isbn13")) || cleanIsbn(text("isbn")),
      pages,
      binding: text("format"),
      rating: value("rating")?.querySelectorAll(".readOnlyStar.full, .staticStar.p10").length || 0,
      readCount: Number(text("read_count")) || 0,
      started: latest(".date_started_value"),
      finished: latest(".date_read_value"),
      added: parseDate(added),
    };
  });
}

// ---------- Planilha oficial (CSV) ----------

// Lê CSV com aspas ("…, …") e quebras de linha dentro das aspas.
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [header, ...data] = rows;
  return data.filter((r) => r.length > 1).map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] || "").trim()])));
}

function parseExport(text) {
  return parseCsv(text).map((r) => ({
    id: r["Book Id"],
    title: r["Title"],
    author: r["Author"],
    isbn: cleanIsbn(r["ISBN13"]) || cleanIsbn(r["ISBN"]), // vêm como ="978…"
    pages: Number(r["Number of Pages"]) || null,
    binding: r["Binding"],
    rating: Number(r["My Rating"]) || 0,
    readCount: Number(r["Read Count"]) || 0,
    review: (r["My Review"] || "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, ""),
    finished: parseDate(r["Date Read"]),
    added: parseDate(r["Date Added"]),
    shelf: r["Exclusive Shelf"],
    shelves: (r["Bookshelves"] || "").split(",").map((s) => s.trim()).filter(Boolean),
  }));
}

// Recebe os arquivos escolhidos (páginas .html e/ou .csv) e devolve os livros
// (sem repetir, se a mesma página foi escolhida duas vezes).
export async function readGoodreadsFiles(files) {
  const seen = new Set();
  const books = [];
  for (const file of files) {
    const text = await file.text();
    const isCsv = /\.csv$/i.test(file.name) || /^﻿?Book Id,/.test(text);
    const list = isCsv ? parseExport(text) : parseListPage(text);
    for (const g of list) {
      if (!g.title || seen.has(g.id)) continue;
      seen.add(g.id);
      books.push(toBook(g));
    }
  }
  return books;
}
