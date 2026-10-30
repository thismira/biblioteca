// Janela para escolher quais livros ficam numa estante: lista com
// caixinhas de marcar, busca (sem ligar para acentos) e filtros por status,
// categoria e nota. "Marcar todos"/"Desmarcar todos" valem só para os
// livros que aparecem no filtro.

import { spineColor } from "./shelf.js";
import { plain } from "./search.js";

const STATUS = [["quero ler", "Quero ler"], ["lendo", "Lendo"], ["lido", "Lido"]];

// Devolve a lista de ids marcados, ou null se ela cancelar.
export function pickShelfBooks({ title, books, selectedIds }) {
  return new Promise((resolve) => {
    const selected = new Set(selectedIds);
    const categories = [...new Set(books.flatMap((b) => b.categories))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    const dialog = document.createElement("dialog");
    dialog.className = "janela-escolher-livros";
    dialog.innerHTML = `
      <div class="janela">
        <h2></h2>
        <input type="search" class="escolher-busca" placeholder="Procurar por título, autor ou categoria…" aria-label="Procurar livro">
        <div class="escolher-filtros">
          <select data-filtro="status" aria-label="Filtrar por status">
            <option value="">Todos os status</option>
            ${STATUS.map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}
          </select>
          <select data-filtro="categoria" aria-label="Filtrar por categoria">
            <option value="">Todas as categorias</option>
          </select>
          <select data-filtro="nota" aria-label="Filtrar por nota">
            <option value="">Qualquer nota</option>
            ${[5, 4, 3, 2, 1].map((n) => `<option value="${n}">${"★".repeat(n)}</option>`).join("")}
            <option value="0">Sem nota</option>
          </select>
          <label class="so-marcados"><input type="checkbox" data-filtro="marcados"> Só os marcados</label>
        </div>
        <div class="escolher-massa">
          <span class="escolher-visiveis"></span>
          <button class="link" type="button" data-acao="marcar">Marcar todos</button>
          <button class="link" type="button" data-acao="desmarcar">Desmarcar todos</button>
        </div>
        <ul class="escolher-lista"></ul>
        <p class="escolher-nada" hidden>Nenhum livro com esses filtros.</p>
        <div class="acoes">
          <span class="escolher-contagem"></span>
          <button class="botao secundario" type="button" data-acao="cancelar">Cancelar</button>
          <button class="botao" type="button" data-acao="salvar">Salvar</button>
        </div>
      </div>`;
    dialog.querySelector("h2").textContent = title;
    const categorySelect = dialog.querySelector('[data-filtro="categoria"]');
    categorySelect.append(...categories.map((c) => new Option(c, c)));
    const list = dialog.querySelector(".escolher-lista");
    const search = dialog.querySelector(".escolher-busca");
    const count = dialog.querySelector(".escolher-contagem");
    const visibleCount = dialog.querySelector(".escolher-visiveis");
    const filter = (name) => dialog.querySelector(`[data-filtro="${name}"]`);
    document.body.appendChild(dialog);

    const updateCount = () => {
      count.textContent = `${selected.size} livro${selected.size === 1 ? "" : "s"} na estante`;
    };

    const sorted = [...books].sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
    const rows = sorted.map((book) => {
      const li = document.createElement("li");
      li.innerHTML = `
        <label class="escolher-item">
          <input type="checkbox">
          <span class="escolher-lombada"></span>
          <span><strong></strong><small></small></span>
        </label>`;
      li.querySelector(".escolher-lombada").style.backgroundColor = spineColor(book);
      li.querySelector("strong").textContent = book.title;
      const details = [book.author, book.rating ? "★".repeat(book.rating) : ""].filter(Boolean);
      li.querySelector("small").textContent = details.join(" · ");
      const box = li.querySelector("input");
      box.checked = selected.has(book.id);
      box.addEventListener("change", () => {
        if (box.checked) selected.add(book.id);
        else selected.delete(book.id);
        updateCount();
        if (filter("marcados").checked) applyFilters();
      });
      return { li, box, book, text: plain(`${book.title} ${book.author} ${book.categories.join(" ")}`) };
    });
    list.replaceChildren(...rows.map((r) => r.li));

    // Mostra só os livros que passam em todos os filtros escolhidos.
    function applyFilters() {
      const words = plain(search.value).split(/\s+/).filter(Boolean);
      const status = filter("status").value;
      const category = filter("categoria").value;
      const rating = filter("nota").value;
      const onlyChecked = filter("marcados").checked;
      let shown = 0;
      for (const { li, book, text } of rows) {
        const ok =
          words.every((w) => text.includes(w)) &&
          (!status || book.status === status) &&
          (!category || book.categories.includes(category)) &&
          (rating === "" || (book.rating || 0) === Number(rating)) &&
          (!onlyChecked || selected.has(book.id));
        li.hidden = !ok;
        if (ok) shown++;
      }
      visibleCount.textContent = `${shown} livro${shown === 1 ? "" : "s"} aparecendo`;
      dialog.querySelector(".escolher-nada").hidden = shown > 0;
    }

    search.addEventListener("input", applyFilters);
    dialog.querySelectorAll("[data-filtro]").forEach((el) => el.addEventListener("change", applyFilters));

    // Marcar/desmarcar todos os que aparecem no filtro.
    dialog.querySelector(".escolher-massa").addEventListener("click", (event) => {
      const action = event.target.closest("[data-acao]")?.dataset.acao;
      if (!action) return;
      for (const { li, box, book } of rows) {
        if (li.hidden) continue;
        box.checked = action === "marcar";
        if (box.checked) selected.add(book.id);
        else selected.delete(book.id);
      }
      updateCount();
      if (filter("marcados").checked) applyFilters();
    });

    updateCount();
    applyFilters();

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
