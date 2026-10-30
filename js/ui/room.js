// A "sala": as estantes em miniatura, lado a lado. Cada uma mostra a
// plaquinha com o nome, uma prévia das lombadas (ou mini capas, na
// "Lendo agora") e quantos livros tem. Clicar abre a estante.

import { spineSize, spineColor } from "./shelf.js";
import { setCoverImage } from "./cover-image.js";

const PREVIEW_SPINES = 16; // quantas lombadas aparecem na miniatura
const PREVIEW_COVERS = 3;  // quantas mini capas (na "Lendo agora")
const SCALE = 0.3;         // tamanho das lombadas na miniatura

const plural = (n) => `${n} livro${n === 1 ? "" : "s"}`;

export function createRoom(container, { onOpen, onCreate }) {
  const cards = new Map(); // id da estante -> cartão (para as animações)

  function miniSpine(book) {
    const { width, height } = spineSize(book);
    const el = document.createElement("span");
    el.className = "mini-lombada";
    el.style.width = Math.max(4, Math.round(width * SCALE)) + "px";
    el.style.height = Math.round(height * SCALE) + "px";
    el.style.backgroundColor = spineColor(book);
    if (book.spinePhoto && book.format !== "kindle") el.style.backgroundImage = `url("${book.spinePhoto}")`;
    return el;
  }

  function miniCover(book) {
    const el = document.createElement("span");
    el.className = "mini-capa";
    el.style.backgroundColor = spineColor(book);
    if (book.coverUrl) {
      const img = document.createElement("img");
      img.alt = "";
      setCoverImage(img, book.coverUrl, { onFail: () => img.remove() });
      el.appendChild(img);
    }
    return el;
  }

  function card(shelf) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "mini-estante";
    el.dataset.id = shelf.id;
    el.innerHTML = `
      <span class="mini-topo"><span class="mini-placa"></span></span>
      <span class="mini-nicho"></span>
      <span class="mini-base"></span>
      <span class="mini-contagem"></span>`;
    el.querySelector(".mini-placa").textContent = `${shelf.icon ? shelf.icon + " " : ""}${shelf.name}`;
    el.querySelector(".mini-contagem").textContent = plural(shelf.books.length);
    const niche = el.querySelector(".mini-nicho");
    if (shelf.covers) {
      niche.classList.add("com-capas");
      niche.append(...shelf.books.slice(0, PREVIEW_COVERS).map(miniCover));
    } else if (shelf.books.length) {
      niche.append(...shelf.books.slice(0, PREVIEW_SPINES).map(miniSpine));
    } else {
      niche.innerHTML = `<span class="mini-vazia">vazia</span>`;
    }
    el.setAttribute("aria-label", `Abrir a estante ${shelf.name}, ${plural(shelf.books.length)}`);
    el.addEventListener("click", () => onOpen(shelf.id, el));
    return el;
  }

  function newShelfCard() {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "mini-estante nova";
    el.innerHTML = `<span class="nova-mais">+</span><span>Nova estante</span>`;
    el.addEventListener("click", onCreate);
    return el;
  }

  return {
    render(shelves) {
      cards.clear();
      const els = shelves.map((s) => {
        const el = card(s);
        cards.set(s.id, el);
        return el;
      });
      container.replaceChildren(...els, newShelfCard());
    },
    cards,
  };
}
