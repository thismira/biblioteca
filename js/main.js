// Ponto de partida do site: liga as telas e os botões.

import * as db from "./data/db.js";
import { createShelf } from "./ui/shelf.js";
import { sortBooks } from "./ui/sort.js";
import { openAddBook } from "./ui/add-book.js";
import { flyStar } from "./ui/favorite-star.js";
import { queueSpineColor, SPINE_COLOR_VERSION } from "./services/spine-color.js";

await db.init();

const openBook = (id) => console.log("abrir livro", id); // página do livro: etapa 4

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
// mudou) entram na fila. A cor escolhida à mão nunca é substituída.
function ensureSpineColors() {
  for (const book of db.getBooks()) {
    if (!book.coverUrl || book.spineColorManual) continue;
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

// Livro marcado como favorito: a estrelinha voa até ele na prateleira de favoritos.
document.addEventListener("livro:favoritado", ({ detail }) => {
  const spine = favoritesShelf.elements.get(detail.id);
  if (!spine) return;
  favoritesSection.scrollIntoView({ behavior: "smooth", block: "center" });
  // Espera a rolagem terminar antes de lançar a estrela.
  setTimeout(() => flyStar(detail.fromRect, spine), 450);
});
