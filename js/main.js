// Ponto de partida do site: liga as telas e os botões.

import * as db from "./data/db.js";
import { createShelf } from "./ui/shelf.js";
import { sortBooks } from "./ui/sort.js";
import { openAddBook } from "./ui/add-book.js";

await db.init();

const emptyMessage = document.getElementById("estante-vazia");
const shelf = createShelf(document.getElementById("estante"), {
  onOpen: (id) => console.log("abrir livro", id), // página do livro: etapa 4
});

function refresh() {
  const onShelf = db.getBooks().filter((b) => b.location === "estante");
  emptyMessage.hidden = onShelf.length > 0;
  shelf.render(sortBooks(onShelf, db.getSettings()));
}

db.subscribe(refresh);
refresh();

document.getElementById("btn-adicionar").addEventListener("click", openAddBook);
