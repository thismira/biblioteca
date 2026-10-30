// A "sala": as estantes em miniatura, lado a lado. Cada uma mostra a
// plaquinha com o nome, uma prévia das lombadas (ou mini capas, na
// "Lendo agora") e quantos livros tem. Clicar abre a estante.

import { spineSize, spineColor, spineFinish } from "./shelf.js";
import { setCoverImage } from "./cover-image.js";
import { readableTextColor, hashString } from "../utils/color.js";

const PREVIEW_SPINES = 16; // quantas lombadas aparecem na miniatura
const LYING = 3;           // estante cheia: os últimos ficam deitados numa pilha
const LEAN_MAX = PREVIEW_SPINES - 1; // cabem todos com folga: o último fica inclinado
const LEAN = 10;           // inclinação do livro encostado (graus)
const PREVIEW_COVERS = 3;  // quantas mini capas (na "Lendo agora")
const SCALE = 0.3;         // tamanho das lombadas na miniatura

const plural = (n) => `${n} livro${n === 1 ? "" : "s"}`;

export function createRoom(container, { onOpen, onCreate }) {
  const cards = new Map(); // id da estante -> cartão (para as animações)

  // Lombadinha: uma versão pequena da lombada grande (mesma cor, volume e
  // acabamento), com risquinhos no lugar do título e do autor.
  function miniSpine(book, index) {
    const { width, height } = spineSize(book);
    const w = Math.max(5, Math.round(width * SCALE));
    const h = Math.round(height * SCALE);
    const el = document.createElement("span");
    el.className = w >= 12 ? "mini-lombada grossa" : "mini-lombada";
    el.style.width = w + "px";
    el.style.height = h + "px";
    el.style.setProperty("--alt", h + "px");
    el.style.setProperty("--i", index);
    const color = spineColor(book);
    el.style.setProperty("--cor", color);
    el.style.setProperty("--cor-texto", readableTextColor(color));
    if (book.spinePhoto && book.format !== "kindle") {
      el.dataset.foto = "";
      el.style.backgroundImage = `url("${book.spinePhoto}")`;
    } else {
      el.dataset.estilo = spineFinish(book);
      el.innerHTML = `<span class="mini-titulo"></span><span class="mini-autor"></span>`;
    }
    if (book.favorite) el.insertAdjacentHTML("beforeend", `<span class="mini-estrela"></span>`);
    return el;
  }

  // Pilha de livros deitados no fim da prateleira (a lombada fica de frente).
  function lyingStack(books, start) {
    const stack = document.createElement("span");
    stack.className = "mini-pilha";
    stack.books = books; // para virar livros em pé, se a miniatura for estreita
    stack.start = start;
    books.forEach((book, i) => {
      const spine = miniSpine(book, start + i);
      const w = parseFloat(spine.style.width);
      const h = parseFloat(spine.style.height);
      const lying = document.createElement("span");
      lying.className = "mini-deitado";
      lying.style.width = h + "px";
      lying.style.height = w + "px";
      lying.style.setProperty("--i", start + i);
      // cada livro um pouquinho para o lado, como numa pilha de verdade
      lying.style.marginLeft = (hashString(book.id) % 7) - 3 + "px";
      spine.style.left = (h - w) / 2 + "px";
      spine.style.top = (w - h) / 2 + "px";
      lying.appendChild(spine);
      stack.prepend(lying); // o primeiro fica embaixo
    });
    return stack;
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
    } else if (shelf.books.length > PREVIEW_SPINES) {
      // Cheia: livros em pé e, no fim, uma pilha de deitados.
      const upright = PREVIEW_SPINES - LYING;
      niche.append(
        ...shelf.books.slice(0, upright).map(miniSpine),
        lyingStack(shelf.books.slice(upright, PREVIEW_SPINES), upright)
      );
    } else if (shelf.books.length) {
      niche.append(...shelf.books.map(miniSpine));
      // Não está cheia: o último livro fica inclinado, encostado no vizinho.
      if (shelf.books.length >= 2 && shelf.books.length <= LEAN_MAX) niche.lastElementChild.classList.add("inclinada");
    } else {
      niche.innerHTML = `<span class="mini-vazia">vazia</span>`;
    }
    el.setAttribute("aria-label", `Abrir a estante ${shelf.name}, ${plural(shelf.books.length)}`);
    el.addEventListener("click", () => onOpen(shelf.id, el));
    return el;
  }

  // Cartão da lista de desejos: um cartãozinho com fita e mini capas.
  function wishlistCard(books) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "mini-estante mini-desejos";
    el.dataset.id = "desejos";
    el.innerHTML = `
      <span class="desejos-fita"></span>
      <span class="desejos-titulo">♡ Lista de desejos</span>
      <span class="desejos-capas"></span>
      <span class="mini-contagem"></span>`;
    const capas = el.querySelector(".desejos-capas");
    if (books.length) capas.append(...books.slice(0, PREVIEW_COVERS).map(miniCover));
    else capas.innerHTML = `<span class="mini-vazia">aqui moram os livros que você quer</span>`;
    el.querySelector(".mini-contagem").textContent = plural(books.length);
    el.setAttribute("aria-label", `Abrir a lista de desejos, ${plural(books.length)}`);
    el.addEventListener("click", () => onOpen("desejos", el));
    return el;
  }

  // Se não couber na miniatura (tela estreita): capas saem do fim; numa
  // miniatura estreita a pilha deitada vira livros em pé (deitados ocupam
  // muito espaço); o inclinado fica em pé; e saem livros do fim até caber.
  function fitNiche(niche) {
    const overflows = () => niche.scrollWidth > niche.clientWidth + 1;
    if (!overflows()) return;
    if (niche.classList.contains("com-capas")) {
      const covers = [...niche.children];
      while (overflows() && covers.length > 1) covers.pop().remove();
      return;
    }
    const stack = niche.querySelector(".mini-pilha");
    if (stack && niche.clientWidth < 200) {
      stack.replaceWith(...stack.books.map((book, i) => miniSpine(book, stack.start + i)));
    }
    niche.querySelector(".inclinada")?.classList.remove("inclinada");
    const upright = [...niche.querySelectorAll(":scope > .mini-lombada")];
    while (overflows() && upright.length > 1) upright.pop().remove();
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
    render(shelves, wishes = []) {
      cards.clear();
      const els = shelves.map((s) => {
        const el = card(s);
        cards.set(s.id, el);
        return el;
      });
      const wishEl = wishlistCard(wishes);
      cards.set("desejos", wishEl);
      container.replaceChildren(...els, wishEl, newShelfCard());
      els.forEach((el) => fitNiche(el.querySelector(".mini-nicho")));
    },
    cards,
  };
}
