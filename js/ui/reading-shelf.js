// Estante "Lendo agora": os livros em leitura aparecem com a CAPA de frente
// (como os destaques de uma livraria), com uma barrinha de progresso embaixo.
// As prateleiras são calculadas pela largura, como na estante principal.

import { setCoverImage } from "./cover-image.js";
import { spineColor } from "./shelf.js";
import { readableTextColor } from "../utils/color.js";

const TILE_WIDTH = 128; // largura normal de cada capa (px)
const MIN_TILE = 92;    // em telas estreitas a capa encolhe até aqui para caberem 2
const GAP = 22;         // espaço entre as capas (px), igual ao CSS

// "32% · pág. 152" (ou só a página, se o total for desconhecido).
function progressLabel(book) {
  const current = book.currentPage || 0;
  if (!book.pages) return current ? `pág. ${current}` : "começando";
  const pct = Math.min(100, Math.round((current / book.pages) * 100));
  return current ? `${pct}% · pág. ${current}` : "0% · começando";
}

function progressPercent(book) {
  return book.pages ? Math.min(100, Math.round(((book.currentPage || 0) / book.pages) * 100)) : 0;
}

export function createReadingShelf(container, { onOpen }) {
  const elements = new Map(); // id do livro -> elemento da capa
  let books = [];
  let lastWidth = 0;

  container.classList.add("estante", "estante-lendo");

  function createTile(book) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "livro-lendo";
    el.dataset.id = book.id;
    el.innerHTML = `
      <span class="livro-lendo-capa"></span>
      <span class="livro-lendo-barra"><span></span></span>
      <span class="livro-lendo-info"></span>`;
    el.addEventListener("click", () => onOpen(el.dataset.id, el));
    return el;
  }

  // Capa: imagem (com novas tentativas) ou uma capa gerada na cor da lombada.
  function paintCover(el, book) {
    const box = el.querySelector(".livro-lendo-capa");
    const key = `${book.coverUrl}|${spineColor(book)}|${book.title}`;
    if (box.dataset.chave === key) return; // nada mudou: não recarrega a imagem
    box.dataset.chave = key;
    const generated = () => {
      const color = spineColor(book);
      box.style.setProperty("--cor", color);
      box.style.setProperty("--cor-texto", readableTextColor(color));
      box.innerHTML = `<span class="capa-gerada"><strong></strong></span>`;
      box.querySelector("strong").textContent = book.title;
    };
    if (book.coverUrl) {
      box.innerHTML = `<img alt="">`;
      setCoverImage(box.querySelector("img"), book.coverUrl, { onFail: generated });
    } else {
      generated();
    }
  }

  function updateTile(el, book) {
    paintCover(el, book);
    el.querySelector(".livro-lendo-barra span").style.width = progressPercent(book) + "%";
    el.querySelector(".livro-lendo-info").textContent = progressLabel(book);
    el.setAttribute("aria-label", `${book.title}, lendo agora, ${progressLabel(book)}`);
  }

  function makeRow() {
    const row = document.createElement("div");
    row.className = "prateleira";
    container.appendChild(row);
    return row;
  }

  function layout() {
    const firstRow = container.querySelector(".prateleira") || makeRow();
    const cs = getComputedStyle(firstRow);
    const available = firstRow.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    lastWidth = container.clientWidth;
    let perRow = Math.max(1, Math.floor((available + GAP) / (TILE_WIDTH + GAP)));
    let tileWidth = TILE_WIDTH;
    // Tela estreita (celular): capas um pouco menores, duas por prateleira.
    if (perRow < 2 && available >= 2 * MIN_TILE + GAP) {
      perRow = 2;
      tileWidth = Math.floor((available - GAP) / 2);
    }
    container.style.setProperty("--largura-capa", tileWidth + "px");

    // Remove capas de livros que saíram da lista.
    const ids = new Set(books.map((b) => b.id));
    for (const [id, el] of elements) {
      if (!ids.has(id)) {
        el.remove();
        elements.delete(id);
      }
    }

    const rowCount = Math.max(1, Math.ceil(books.length / perRow));
    const rows = [...container.querySelectorAll(".prateleira")];
    while (rows.length < rowCount) rows.push(makeRow());
    rows.slice(rowCount).forEach((r) => r.remove());

    books.forEach((book, i) => {
      let el = elements.get(book.id);
      if (!el) {
        el = createTile(book);
        elements.set(book.id, el);
      }
      updateTile(el, book);
      rows[Math.floor(i / perRow)].appendChild(el);
    });
  }

  // Redistribui quando a largura da janela muda.
  let pending = false;
  new ResizeObserver(() => {
    if (pending || container.clientWidth === lastWidth) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      layout();
    });
  }).observe(container);

  return {
    render(list) {
      books = list;
      layout();
    },
    elements,
  };
}
