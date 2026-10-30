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
const DEFAULT_PAGES = 300;
const STAR_SPACE = 14;    // espaço da estrelinha de favorito no topo da lombada

// Foto da lombada vale só para livros físicos.
const hasPhoto = (book) => Boolean(book.spinePhoto) && book.format !== "kindle";

// Altura e espessura da lombada a partir do número de páginas.
// Com foto, a espessura segue a proporção da foto (para não esticar).
export function spineSize(book) {
  const pages = book.pages || DEFAULT_PAGES;
  const t = Math.min(Math.max((pages - 100) / 700, 0), 1);
  const jitter = (hashString(book.id) % 13) - 6; // variação fixa de -6 a +6 px
  const height = Math.round(160 + 80 * t + jitter);
  const width = hasPhoto(book) && book.spinePhotoAspect
    ? Math.round(Math.min(Math.max(height * book.spinePhotoAspect, 16), 80))
    : Math.round(Math.min(Math.max(12 + Math.sqrt(pages) * 1.6, 22), 60));
  return { height, width };
}

// "Régua" do navegador: mede a largura real de um texto numa fonte.
const ruler = document.createElement("canvas").getContext("2d");
function measure(text, font) {
  ruler.font = font;
  return ruler.measureText(text).width;
}

const AUTHOR_GAP = 12; // respiro entre título e autor (igual ao CSS)
const TITLE_FONT = (size) => `700 ${size}px "Cormorant Garamond"`;
// Autor: maiúsculas de 10px com espaçamento de 0,06em entre letras.
const authorWidth = (text) =>
  measure(text.toUpperCase(), '700 10px "Nunito Sans"') + text.length * 0.6;

// Largura da linha mais longa quando o título é dividido em 2 linhas
// do jeito mais equilibrado possível (medido no tamanho `size`).
function longestOfTwoLines(title, size) {
  const words = title.split(/\s+/);
  if (words.length < 2) return measure(title, TITLE_FONT(size));
  let best = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = measure(words.slice(0, i).join(" "), TITLE_FONT(size));
    const b = measure(words.slice(i).join(" "), TITLE_FONT(size));
    best = Math.min(best, Math.max(a, b));
  }
  return best;
}

// Decide o tamanho da letra, o número de linhas do título e se o autor
// aparece completo ou só o sobrenome, medindo o texto de verdade.
function fitText(book, width, height, framed) {
  // descontando margens, enfeites e a estrelinha (se for favorito)
  const usable = height - 50 - (book.favorite ? STAR_SPACE : 0);
  const authorMax = usable * 0.36;
  let author = book.author || "";
  if (authorWidth(author) > authorMax) author = author.split(/\s+/).pop();
  const authorLen = author ? Math.min(authorWidth(author), authorMax) + AUTHOR_GAP : 0;
  // O título usa o espaço que sobra ao lado do autor. No CSS, o espaçador
  // do outro lado encolhe se faltar espaço: assim o título fica o mais
  // centralizado possível, sem nunca encostar no autor.
  // A moldura do acabamento 3 ocupa 7px de cada lado do título.
  const titleSpace = usable - authorLen - (framed ? 14 : 0);

  // Maior letra possível em 1 linha e em 2 linhas; fica com a maior,
  // mas prefere 2 linhas quando 1 linha não cabe nem com letra mínima.
  const base = Math.min(Math.max(width * 0.42, 11), 17);
  const oneLineIdeal = base * (titleSpace / measure(book.title, TITLE_FONT(base)));
  const oneLine = Math.max(11, Math.min(base, oneLineIdeal));
  const twoLines = Math.min(
    base,
    (width - 8) / 2.2,
    base * (titleSpace / longestOfTwoLines(book.title, base))
  );
  if (twoLines >= 10 && (twoLines > oneLine || oneLineIdeal < 11)) {
    return { fontSize: twoLines, lines: 2, author, authorLen, titleSpace };
  }
  return { fontSize: oneLine, lines: 1, author, authorLen, titleSpace };
}

// Cor da lombada: a escolhida à mão > a extraída da capa > pastel provisória.
export function spineColor(book) {
  return book.spineColorCustom || book.spineColor || fallbackColor(book.title + book.author);
}

function createSpine(book, onOpen) {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "lombada";
  el.dataset.id = book.id;
  el.dataset.estilo = hashString(book.id + ":estilo") % 4; // acabamento fixo por livro
  el.innerHTML = `<span class="lombada-estrela" aria-hidden="true">★</span><span class="lombada-texto"><span class="lombada-espaco"></span><span class="lombada-titulo"></span><span class="lombada-autor"></span></span>`;
  el.addEventListener("click", () => onOpen(el.dataset.id, el));
  return el;
}

function updateSpine(el, book) {
  const { width, height } = spineSize(book);
  const bg = spineColor(book);
  el.style.width = width + "px";
  el.style.height = height + "px";
  el.style.setProperty("--alt", height + "px");   // a caixa de texto gira 90°,
  el.style.setProperty("--larg", width + "px");   // então largura e altura trocam
  el.style.setProperty("--cor", bg);
  el.style.setProperty("--cor-texto", readableTextColor(bg));
  const framed = el.dataset.estilo === "3";
  const { fontSize, lines, author, authorLen, titleSpace } = fitText(book, width, height, framed);
  el.style.setProperty("--fs-titulo", fontSize + "px");
  el.style.setProperty("--linhas", lines);
  el.style.setProperty("--autor-len", authorLen + "px");
  el.style.setProperty("--titulo-max", titleSpace + (framed ? 14 : 0) + "px");
  el.querySelector(".lombada-titulo").textContent = book.title;
  el.querySelector(".lombada-autor").textContent = author;
  el.toggleAttribute("data-favorito", Boolean(book.favorite));
  // Foto da lombada: substitui a cor e o texto (a foto já tem o título).
  el.toggleAttribute("data-foto", hasPhoto(book));
  if (hasPhoto(book)) el.style.setProperty("--foto", `url("${book.spinePhoto}")`);
  else el.style.removeProperty("--foto");
  el.setAttribute(
    "aria-label",
    `${book.title}${book.author ? ", de " + book.author : ""}${book.favorite ? ", favorito" : ""}`
  );
}

// `minShelves`: quantas prateleiras aparecem mesmo vazias.
export function createShelf(container, { onOpen, minShelves = 3 }) {
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
    const needed = Math.max(rows.length, minShelves);
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

  // As fontes do Google chegam depois da página: recalcula quando carregarem.
  document.fonts.ready.then(() => layout());

  return {
    render(list) {
      books = list;
      layout();
    },
    elements,
  };
}
