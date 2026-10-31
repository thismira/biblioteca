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
// No celular as lombadas ficam 20% menores (cabem mais livros por prateleira);
// a estante se redesenha sozinha ao cruzar esse tamanho de tela.
const compact = window.matchMedia("(max-width: 600px)");
const COMPACT = 0.8;
export function spineSize(book) {
  const pages = book.pages || DEFAULT_PAGES;
  const t = Math.min(Math.max((pages - 100) / 700, 0), 1);
  const jitter = (hashString(book.id) % 13) - 6; // variação fixa de -6 a +6 px
  const height = Math.round(168 + 80 * t + jitter);
  const width = hasPhoto(book) && book.spinePhotoAspect
    ? Math.round(Math.min(Math.max(height * book.spinePhotoAspect, 16), 80))
    : Math.round(Math.min(Math.max(12 + Math.sqrt(pages) * 1.6, 26), 60));
  const k = compact.matches ? COMPACT : 1;
  return { height: Math.round(height * k), width: Math.round(width * k) };
}

// "Régua" do navegador: mede a largura real de um texto numa fonte.
const ruler = document.createElement("canvas").getContext("2d");
function measure(text, font) {
  ruler.font = font;
  return ruler.measureText(text).width;
}

const AUTHOR_GAP = 12;      // respiro entre título e autor (igual ao CSS)
const LINE_HEIGHT = 1.05;  // altura da linha do título (igual ao CSS)
const MAX_LINES = 3;       // o título pode usar até 3 linhas
const TITLE_MAX = 17;      // maior letra do título (px)
const TITLE_MIN = 7;       // menor letra do título (px), só em casos extremos
const AUTHOR_MAX = 10;     // maior letra do autor (px)
const AUTHOR_MIN = 6.5;    // menor letra do autor (px)
const SAFETY = 0.95;       // folga de 5% para diferenças de desenho das letras

// Largura de um texto do título com letra de 1px (a largura cresce
// proporcionalmente ao tamanho da letra).
const titleWidth = (text) => measure(text, '700 100px "Cormorant Garamond"') / 100;
// Autor: maiúsculas com espaçamento de 0,06em entre letras, a 1px.
const authorWidth = (text) =>
  measure(text.toUpperCase(), '700 100px "Nunito Sans"') / 100 + text.length * 0.06;

// Divide as palavras em `n` linhas do jeito mais equilibrado possível
// (a linha mais comprida fica o mais curta possível).
function splitLines(words, n) {
  if (n === 1) {
    const line = words.join(" ");
    return { lines: [line], widest: titleWidth(line) };
  }
  let best = null;
  for (let i = 1; i <= words.length - (n - 1); i++) {
    const first = words.slice(0, i).join(" ");
    const rest = splitLines(words.slice(i), n - 1);
    const widest = Math.max(titleWidth(first), rest.widest);
    if (!best || widest < best.widest) best = { lines: [first, ...rest.lines], widest };
  }
  return best;
}

// Decide como escrever título e autor na lombada SEM CORTAR nada:
// - autor: nome completo se couber, senão sobrenome; a letra diminui se precisar;
// - título: 1, 2 ou 3 linhas, com quebras calculadas aqui, na maior letra
//   que couber no comprimento e na espessura da lombada.
function fitText(book, width, height) {
  // descontando margens, enfeites e a estrelinha (se for favorito)
  const usable = height - 55 - (book.favorite ? STAR_SPACE : 0);

  let author = "";
  let authorSize = AUTHOR_MAX;
  let authorLen = 0;
  if (book.author) {
    let room = usable * 0.36;
    const full = book.author.trim();
    const surname = full.split(/\s+/).pop();
    if (authorWidth(full) * 8.5 <= room) {
      author = full; // nome completo cabe com letra de pelo menos 8,5px
    } else {
      author = surname;
      // Nem o sobrenome cabe com letra mínima: dá um pouco mais de espaço.
      if (authorWidth(surname) * AUTHOR_MIN > room) room = usable * 0.5;
    }
    authorSize = Math.max(AUTHOR_MIN, Math.min(AUTHOR_MAX, room / authorWidth(author)));
    authorLen = authorWidth(author) * authorSize + AUTHOR_GAP;
  }

  // O título usa o espaço que sobra ao lado do autor. No CSS, o espaçador
  // do outro lado encolhe se faltar espaço: assim o título fica o mais
  // centralizado possível, sem nunca encostar no autor.
  const titleSpace = usable - authorLen;
  const words = book.title.trim().split(/\s+/);
  const cap = Math.min(TITLE_MAX, Math.max(11, width * 0.5));
  let best = null;
  for (let n = 1; n <= Math.min(MAX_LINES, words.length); n++) {
    const { lines, widest } = splitLines(words, n);
    const byLength = (titleSpace * SAFETY) / widest;            // cabe no comprimento
    const byThickness = (width - 8) / (n * LINE_HEIGHT);        // cabe na espessura
    const size = Math.min(cap, byLength, byThickness);
    // Só usa mais linhas se a letra ficar visivelmente maior.
    if (!best || size > best.size + 0.5) best = { size, lines };
  }
  return {
    fontSize: Math.max(TITLE_MIN, best.size),
    lines: best.lines,
    author,
    authorSize,
    authorLen,
    titleSpace,
  };
}

// Cor da lombada: a escolhida à mão > a extraída da capa > pastel provisória.
export function spineColor(book) {
  return book.spineColorCustom || book.spineColor || fallbackColor(book.title + book.author);
}

// Acabamento fixo de cada livro (0–3), igual na estante e na miniatura da sala.
export const spineFinish = (book) => hashString(book.id + ":estilo") % 4;

function createSpine(book, onOpen) {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "lombada";
  el.dataset.id = book.id;
  el.dataset.estilo = spineFinish(book); // acabamento fixo por livro
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
  const { fontSize, lines, author, authorSize, authorLen, titleSpace } = fitText(book, width, height);
  el.style.setProperty("--fs-titulo", fontSize + "px");
  el.style.setProperty("--fs-autor", authorSize + "px");
  el.style.setProperty("--autor-len", authorLen + "px");
  el.style.setProperty("--titulo-max", titleSpace + "px");
  // Uma linha por elemento: as quebras foram calculadas no fitText.
  const titleEl = el.querySelector(".lombada-titulo");
  titleEl.replaceChildren(
    ...lines.map((line) => {
      const span = document.createElement("span");
      span.textContent = line;
      return span;
    })
  );
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
