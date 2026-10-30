// Ponto de partida do site: liga as telas e os botões.

import * as db from "./data/db.js";
import { createShelf } from "./ui/shelf.js";
import { sortBooks } from "./ui/sort.js";
import { openAddBook } from "./ui/add-book.js";
import { flyStar } from "./ui/favorite-star.js";
import { openBookDetail, closeBookDetail, isBookDetailOpen } from "./ui/book-detail.js";
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
      spine: spine || shelf.elements.get(match[1]),
      find: (id) => shelf.elements.get(id),
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
const favoritesSection = document.getElementById("secao-favoritos");
const favoritesShelf = createShelf(document.getElementById("estante-favoritos"), {
  onOpen: openBook,
  minShelves: 1,
});
const shelf = createShelf(document.getElementById("estante"), { onOpen: openBook });

function refresh() {
  const settings = db.getSettings();
  const onShelf = sortBooks(db.getBooks().filter((b) => b.location === "estante"), settings);
  const favorites = onShelf.filter((b) => b.favorite);

  emptyMessage.hidden = onShelf.length > 0;
  // Mostra a prateleira de favoritos antes de desenhar (para medir a largura).
  favoritesSection.hidden = favorites.length === 0;
  favoritesShelf.render(favorites);
  shelf.render(onShelf);
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

// Livro marcado como favorito: a estrelinha voa até ele na prateleira de favoritos.
document.addEventListener("livro:favoritado", ({ detail }) => {
  const spine = favoritesShelf.elements.get(detail.id);
  if (!spine) return;
  favoritesSection.scrollIntoView({ behavior: "smooth", block: "center" });
  // Espera a rolagem terminar antes de lançar a estrela.
  setTimeout(() => flyStar(detail.fromRect, spine), 450);
});
