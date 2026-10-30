// Ponto de partida do site: liga as telas e os botões.

import * as db from "./data/db.js";
import { createShelf } from "./ui/shelf.js";
import { createReadingShelf } from "./ui/reading-shelf.js";
import { sortBooks } from "./ui/sort.js";
import { openAddBook } from "./ui/add-book.js";
import { flyStar } from "./ui/favorite-star.js";
import { openBookDetail, closeBookDetail, isBookDetailOpen } from "./ui/book-detail.js";
import { flyIntoShelf, reducedMotion } from "./ui/fly-book.js";
import { queueSpineColor, SPINE_COLOR_VERSION } from "./services/spine-color.js";

await db.init();

// ---------- Rotas ----------
// Cada livro tem um endereço próprio (#/livro/<id>). Clicar numa lombada muda
// o endereço; o site abre/fecha a página do livro conforme o endereço. Assim
// o botão "voltar" do navegador fecha a página e o link de um livro funciona.
let clickedSpine = null;
let openedFromShelf = false;

const openBook = (id, spine) => {
  clickedSpine = spine;
  openedFromShelf = true;
  location.hash = `#/livro/${id}`;
};

function requestClose() {
  if (openedFromShelf) history.back(); // volta ao endereço da estante
  else {
    history.replaceState(null, "", location.pathname + location.search);
    route();
  }
}

async function route() {
  const match = location.hash.match(/^#\/livro\/([\w-]+)$/);
  const spine = clickedSpine;
  clickedSpine = null;
  if (match) {
    const ok = await openBookDetail(match[1], {
      spine: spine || findPlace(match[1]),
      find: findPlace,
      requestClose,
    });
    // Livro que não existe mais (ex.: link antigo): volta para a estante.
    if (!ok && !isBookDetailOpen()) history.replaceState(null, "", location.pathname + location.search);
  } else {
    openedFromShelf = false;
    closeBookDetail();
  }
}

const emptyMessage = document.getElementById("estante-vazia");
const readingSection = document.getElementById("secao-lendo");
const readingShelf = createReadingShelf(document.getElementById("estante-lendo"), { onOpen: openBook });
const favoritesSection = document.getElementById("secao-favoritos");
const favoritesShelf = createShelf(document.getElementById("estante-favoritos"), {
  onOpen: openBook,
  minShelves: 1,
});
const shelf = createShelf(document.getElementById("estante"), { onOpen: openBook });

// Onde o livro está na tela: na "Lendo agora" (capa) ou na estante (lombada).
const findPlace = (id) => readingShelf.elements.get(id) || shelf.elements.get(id);

// Última vez que ela mexeu na leitura (para a "Lendo agora" mostrar
// primeiro o livro mais recente).
const lastActivity = (b) => b.progressLog?.at(-1)?.date || b.startDate || b.createdAt;

function refresh() {
  const settings = db.getSettings();
  const onShelf = sortBooks(db.getBooks().filter((b) => b.location === "estante"), settings);
  // Livros em leitura saem da estante e vão para a "Lendo agora"
  // (como levar o livro para a mesinha de cabeceira).
  const reading = onShelf
    .filter((b) => b.status === "lendo")
    .sort((a, b) => lastActivity(b).localeCompare(lastActivity(a)));
  const others = onShelf.filter((b) => b.status !== "lendo");
  const favorites = onShelf.filter((b) => b.favorite);

  emptyMessage.hidden = onShelf.length > 0;
  // Mostra cada estante de destaque antes de desenhar (para medir a largura).
  readingSection.hidden = reading.length === 0;
  readingShelf.render(reading);
  favoritesSection.hidden = favorites.length === 0;
  favoritesShelf.render(favorites);
  shelf.render(others);
  ensureSpineColors();
}

// Livros com capa e sem cor extraída (ou cuja capa ou regra de extração
// mudou) entram na fila. A cor escolhida à mão fica em outro campo
// (spineColorCustom) e tem prioridade, então nunca é substituída.
function ensureSpineColors() {
  for (const book of db.getBooks()) {
    if (!book.coverUrl) continue;
    const source = `v${SPINE_COLOR_VERSION}:${book.coverUrl}`;
    if (book.spineColorSource === source) continue;
    queueSpineColor(book.coverUrl, (color) =>
      db.updateBook(book.id, { spineColor: color, spineColorSource: source })
    );
  }
}

db.subscribe(refresh);
refresh();

document.getElementById("btn-adicionar").addEventListener("click", openAddBook);

window.addEventListener("hashchange", route);
route();

// Espera a rolagem suave terminar (com tempo máximo, se o navegador não avisar).
function scrollToCenter(el) {
  return new Promise((resolve) => {
    const finish = () => setTimeout(resolve, 60);
    const timer = setTimeout(finish, 900);
    window.addEventListener("scrollend", () => { clearTimeout(timer); finish(); }, { once: true });
    el.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "center" });
  });
}

// Livro novo: a capa voa da janela de cadastro até o lugar dele (lombada na
// estante, ou capa na "Lendo agora"). Se for favorito, depois a estrelinha
// voa até os favoritos.
document.addEventListener("livro:adicionado", async ({ detail }) => {
  const book = db.getBook(detail.id);
  const spine = findPlace(detail.id);
  if (!book || !spine) return;
  spine.style.visibility = "hidden"; // escondida até o livro "chegar"
  await scrollToCenter(spine);
  if (reducedMotion()) spine.style.visibility = "";
  else await flyIntoShelf(detail.coverRect, book, spine);

  const favoriteSpine = detail.favorite && favoritesShelf.elements.get(detail.id);
  if (favoriteSpine) {
    const from = spine.getBoundingClientRect();
    await scrollToCenter(favoritesSection);
    flyStar(spine.isConnected ? spine.getBoundingClientRect() : from, favoriteSpine);
  }
});
