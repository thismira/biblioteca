// Desenha a estante: cria as lombadas e distribui nas prateleiras.
//
// A estante é UMA lista de livros em ordem. As prateleiras são calculadas
// conforme a largura disponível: enchemos da esquerda para a direita e
// passamos para a próxima quando não cabe mais.
//
// Cada livro tem um elemento que é reaproveitado entre um desenho e outro
// (só muda de lugar). Isso é o que permite animar a troca de posição.

import { readableTextColor, fallbackColor, hashString } from "../utils/color.js";

const GAP = 3;            // espaço entre lombadas (px), igual ao CSS
const MIN_SHELVES = 3;    // a estante sempre mostra pelo menos 3 prateleiras
const DEFAULT_PAGES = 300;

// Altura e espessura da lombada a partir do número de páginas.
export function spineSize(book) {
  const pages = book.pages || DEFAULT_PAGES;
  const t = Math.min(Math.max((pages - 100) / 700, 0), 1);
  const jitter = (hashString(book.id) % 13) - 6; // variação fixa de -6 a +6 px
  return {
    height: Math.round(150 + 80 * t + jitter),
    width: Math.round(Math.min(Math.max(12 + Math.sqrt(pages) * 1.6, 22), 60)),
  };
}

// Estima quanto texto cabe na lombada e escolhe tamanho da letra,
// número de linhas do título e se o autor aparece completo ou só o sobrenome.
// (Estimativa: cada letra ocupa ~0,52 do tamanho da fonte na Cormorant
// e ~0,55 na Nunito.)
function fitText(book, width, height) {
  const usable = height - 44; // descontando margens e filetes
  const authorMax = usable * 0.38;
  let author = book.author || "";
  if (author.length * 10 * 0.55 > authorMax) author = author.split(/\s+/).pop();
  const authorLen = Math.min(author.length * 10 * 0.55, authorMax);
  const titleSpace = usable - authorLen;

  // Calcula o maior tamanho de letra possível em 1 linha e em 2 linhas
  // e fica com o jeito que deixa a letra maior.
  const base = Math.min(Math.max(width * 0.42, 11), 17);
  const perChar = book.title.length * 0.52;
  const oneLine = Math.max(11, Math.min(base, titleSpace / perChar));
  const twoLines = Math.min(base, (width - 8) / 2.2, (2 * titleSpace) / perChar);
  const oneLineFits = titleSpace / perChar >= 11;
  if (twoLines >= 10 && (twoLines > oneLine || !oneLineFits)) {
    return { fontSize: twoLines, lines: 2, author };
  }
  return { fontSize: oneLine, lines: 1, author };
}

export function spineColor(book) {
  return book.spineColor || fallbackColor(book.title + book.author);
}

function createSpine(book, onOpen) {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "lombada";
  el.dataset.id = book.id;
  el.innerHTML = `<span class="lombada-texto"><span class="lombada-titulo"></span><span class="lombada-autor"></span></span>`;
  el.addEventListener("click", () => onOpen(el.dataset.id));
  return el;
}

function updateSpine(el, book) {
  const { width, height } = spineSize(book);
  const bg = spineColor(book);
  el.style.width = width + "px";
  el.style.height = height + "px";
  el.style.setProperty("--cor", bg);
  el.style.setProperty("--cor-texto", readableTextColor(bg));
  const { fontSize, lines, author } = fitText(book, width, height);
  el.style.setProperty("--fs-titulo", fontSize + "px");
  el.style.setProperty("--linhas", lines);
  el.querySelector(".lombada-titulo").textContent = book.title;
  el.querySelector(".lombada-autor").textContent = author;
  el.setAttribute("aria-label", `${book.title}${book.author ? ", de " + book.author : ""}`);
}

export function createShelf(container, { onOpen }) {
  const elements = new Map(); // id do livro -> elemento da lombada
  let books = [];
  let lastWidth = 0;

  container.classList.add("estante");

  function makeRow() {
    const row = document.createElement("div");
    row.className = "prateleira";
    container.appendChild(row);
    return row;
  }

  function availableWidth() {
    const row = container.querySelector(".prateleira") || makeRow();
    const cs = getComputedStyle(row);
    return row.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  }

  // Divide os livros em prateleiras conforme a largura.
  function pack(list, maxWidth) {
    const rows = [];
    let current = [];
    let used = 0;
    for (const book of list) {
      const w = spineSize(book).width;
      if (current.length && used + GAP + w > maxWidth) {
        rows.push(current);
        current = [];
        used = 0;
      }
      used += (current.length ? GAP : 0) + w;
      current.push(book);
    }
    if (current.length) rows.push(current);
    return rows;
  }

  function layout() {
    const maxWidth = availableWidth();
    lastWidth = container.clientWidth;
    const rows = pack(books, maxWidth);

    // Remove lombadas de livros que saíram da lista.
    const ids = new Set(books.map((b) => b.id));
    for (const [id, el] of elements) {
      if (!ids.has(id)) {
        el.remove();
        elements.delete(id);
      }
    }

    // Garante a quantidade de prateleiras.
    const rowEls = [...container.querySelectorAll(".prateleira")];
    const needed = Math.max(rows.length, MIN_SHELVES);
    while (rowEls.length < needed) rowEls.push(makeRow());
    rowEls.slice(needed).forEach((r) => r.remove());

    // Coloca cada lombada (nova ou reaproveitada) na prateleira certa.
    rows.forEach((rowBooks, i) => {
      rowBooks.forEach((book) => {
        let el = elements.get(book.id);
        if (!el) {
          el = createSpine(book, onOpen);
          elements.set(book.id, el);
        }
        updateSpine(el, book);
        rowEls[i].appendChild(el);
      });
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
