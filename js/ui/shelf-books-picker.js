// Janela para escolher quais livros ficam numa estante: lista com
// caixinhas de marcar e um campo de busca.

import { spineColor } from "./shelf.js";

// Devolve a lista de ids marcados, ou null se ela cancelar.
export function pickShelfBooks({ title, books, selectedIds }) {
  return new Promise((resolve) => {
    const selected = new Set(selectedIds);
    const dialog = document.createElement("dialog");
    dialog.className = "janela-escolher-livros";
    dialog.innerHTML = `
      <div class="janela">
        <h2></h2>
        <input type="search" class="escolher-busca" placeholder="Procurar por título ou autor…" aria-label="Procurar livro">
        <ul class="escolher-lista"></ul>
        <div class="acoes">
          <span class="escolher-contagem"></span>
          <button class="botao secundario" type="button" data-acao="cancelar">Cancelar</button>
          <button class="botao" type="button" data-acao="salvar">Salvar</button>
        </div>
      </div>`;
    dialog.querySelector("h2").textContent = title;
    const list = dialog.querySelector(".escolher-lista");
    const search = dialog.querySelector(".escolher-busca");
    const count = dialog.querySelector(".escolher-contagem");
    document.body.appendChild(dialog);

    const updateCount = () => {
      count.textContent = `${selected.size} livro${selected.size === 1 ? "" : "s"} na estante`;
    };

    const sorted = [...books].sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
    list.replaceChildren(
      ...sorted.map((book) => {
        const li = document.createElement("li");
        li.innerHTML = `
          <label class="escolher-item">
            <input type="checkbox">
            <span class="escolher-lombada"></span>
            <span><strong></strong><small></small></span>
          </label>`;
        li.dataset.busca = `${book.title} ${book.author}`.toLowerCase();
        li.querySelector(".escolher-lombada").style.backgroundColor = spineColor(book);
        li.querySelector("strong").textContent = book.title;
        li.querySelector("small").textContent = book.author;
        const box = li.querySelector("input");
        box.checked = selected.has(book.id);
        box.addEventListener("change", () => {
          if (box.checked) selected.add(book.id);
          else selected.delete(book.id);
          updateCount();
        });
        return li;
      })
    );
    updateCount();

    search.addEventListener("input", () => {
      const q = search.value.trim().toLowerCase();
      list.querySelectorAll("li").forEach((li) => (li.hidden = q && !li.dataset.busca.includes(q)));
    });

    let answer = null;
    dialog.querySelector('[data-acao="salvar"]').addEventListener("click", () => {
      answer = [...selected];
      dialog.close();
    });
    dialog.querySelector('[data-acao="cancelar"]').addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => {
      resolve(answer);
      dialog.remove();
    });
    dialog.showModal();
    search.focus();
  });
}
