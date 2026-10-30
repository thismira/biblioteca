// Busca na sala: procurar um livro já cadastrado.
// Olha título, autor, categorias e os nomes das estantes dela, sem ligar
// para acentos ("solidao" acha "Solidão"). Clicar num resultado abre a
// página do livro; sem resultado, oferece cadastrar o livro.

import * as db from "../data/db.js";
import { spineColor } from "./shelf.js";
import { setCoverImage } from "./cover-image.js";

const MAX_RESULTS = 8;
const CLOSE_DELAY = 400; // ms até fechar a lista depois de abrir um livro
const STATUS = { "quero ler": "Quero ler", lendo: "Lendo", lido: "Lido" };

// Minúsculas e sem acentos.
const plain = (text) => String(text || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

function statusText(book) {
  if (book.status === "lendo" && book.pages) {
    return `Lendo · ${Math.min(100, Math.round(((book.currentPage || 0) / book.pages) * 100))}%`;
  }
  return STATUS[book.status] || "";
}

// Procura e ordena: título que começa com o texto > título que contém >
// autor > o resto (categorias, estantes).
export function searchLibrary(query) {
  const words = plain(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const shelves = db.getShelves();
  const results = [];
  for (const book of db.getBooks()) {
    if (book.location !== "estante") continue;
    const title = plain(book.title);
    const author = plain(book.author);
    const extra = plain([...book.categories, ...shelves.filter((s) => s.bookIds.includes(book.id)).map((s) => s.name)].join(" "));
    const all = `${title} ${author} ${extra}`;
    if (!words.every((w) => all.includes(w))) continue;
    const q = words.join(" ");
    const score = title.startsWith(q) ? 0 : title.includes(q) ? 1 : author.includes(q) ? 2 : 3;
    results.push({ book, score });
  }
  return results
    .sort((a, b) => a.score - b.score || a.book.title.localeCompare(b.book.title, "pt-BR"))
    .map((r) => r.book);
}

export function createSearch({ input, list, onOpen, onAdd }) {
  function thumb(book) {
    const el = document.createElement("span");
    el.className = "busca-capinha";
    el.style.backgroundColor = spineColor(book);
    if (book.coverUrl) {
      const img = document.createElement("img");
      img.alt = "";
      setCoverImage(img, book.coverUrl, { onFail: () => img.remove() });
      el.appendChild(img);
    }
    return el;
  }

  function item(book) {
    const li = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "busca-item";
    const cover = thumb(book);
    const text = document.createElement("span");
    text.className = "busca-texto";
    text.innerHTML = `<strong></strong><small></small>`;
    text.querySelector("strong").textContent = book.title;
    const details = [book.author, statusText(book), book.rating ? "★".repeat(book.rating) : ""].filter(Boolean);
    text.querySelector("small").textContent = details.join(" · ");
    button.append(cover, text);
    // A página do livro abre "saindo" da capinha: a lista só fecha depois
    // que a animação já pegou a capinha como ponto de partida.
    button.addEventListener("click", () => {
      onOpen(book.id, cover);
      setTimeout(close, CLOSE_DELAY);
    });
    li.appendChild(button);
    return li;
  }

  function render() {
    const query = input.value.trim();
    if (!query) return close();
    const results = searchLibrary(query);
    list.replaceChildren(...results.slice(0, MAX_RESULTS).map(item));
    if (results.length > MAX_RESULTS) {
      const more = document.createElement("li");
      more.className = "busca-mais";
      more.textContent = `+ ${results.length - MAX_RESULTS} outros — escreva mais para afinar a busca`;
      list.appendChild(more);
    }
    if (!results.length) {
      const empty = document.createElement("li");
      empty.className = "busca-nada";
      empty.innerHTML = `<span>Nenhum livro seu com esse nome.</span>
        <button type="button" class="botao secundario">+ Adicionar este livro</button>`;
      empty.querySelector("button").addEventListener("click", () => {
        const text = input.value.trim();
        close();
        onAdd(text);
      });
      list.appendChild(empty);
    }
    list.hidden = false;
  }

  function close() {
    list.hidden = true;
    list.replaceChildren();
  }

  input.addEventListener("input", render);
  input.addEventListener("focus", () => input.value.trim() && render());
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      input.value = "";
      close();
    }
    // Enter abre o primeiro resultado.
    if (event.key === "Enter") list.querySelector(".busca-item")?.click();
  });
  // Clicar fora fecha a lista.
  document.addEventListener("pointerdown", (event) => {
    if (!list.hidden && !list.contains(event.target) && event.target !== input) close();
  });

  return { close, refresh: () => !list.hidden && render() };
}
