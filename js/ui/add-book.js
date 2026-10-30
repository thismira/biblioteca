// Janela de cadastro de livro.
// (Etapa 2 acrescenta a busca na Open Library.)

import * as db from "../data/db.js";

let dialog;

function build() {
  dialog = document.createElement("dialog");
  dialog.innerHTML = `
    <form class="janela" method="dialog">
      <h2>Novo livro</h2>
      <div class="campo">
        <label for="novo-titulo">Título</label>
        <input id="novo-titulo" name="title" required autocomplete="off">
      </div>
      <div class="campo">
        <label for="novo-autor">Autor(a)</label>
        <input id="novo-autor" name="author" autocomplete="off">
      </div>
      <div class="campo">
        <label for="novo-paginas">Número de páginas</label>
        <input id="novo-paginas" name="pages" type="number" min="1" inputmode="numeric">
      </div>
      <div class="acoes">
        <button class="botao secundario" type="button" value="cancelar">Cancelar</button>
        <button class="botao" type="submit">Guardar na estante</button>
      </div>
    </form>`;
  document.body.appendChild(dialog);

  const form = dialog.querySelector("form");
  form.querySelector('[value="cancelar"]').addEventListener("click", () => dialog.close());
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    await db.addBook({
      title: data.get("title").trim(),
      author: data.get("author").trim(),
      pages: Number(data.get("pages")) || null,
    });
    dialog.close();
  });
}

export function openAddBook() {
  if (!dialog) build();
  dialog.querySelector("form").reset();
  dialog.showModal();
}
