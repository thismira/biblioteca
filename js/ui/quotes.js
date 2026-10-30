// Trechos favoritos de um livro, com o número da página.
// Fica dentro da página do livro; `getBook()` devolve o livro aberto e
// `save(changes)` grava as mudanças.

import { confirmDialog } from "./dialogs.js";

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

// Em ordem de página, como no livro; trechos sem página vão para o fim.
function sorted(quotes) {
  return [...quotes].sort(
    (a, b) => (a.page ?? Infinity) - (b.page ?? Infinity) || (a.createdAt || "").localeCompare(b.createdAt || "")
  );
}

export function createQuotes(container, { getBook, save }) {
  container.innerHTML = `
    <ul class="quotes-lista"></ul>
    <p class="quotes-vazio">Nenhum trecho guardado ainda. Aquela frase que você sublinhou mora aqui. ✨</p>
    <form class="quote-novo">
      <label for="quote-texto">Novo trecho</label>
      <textarea id="quote-texto" required placeholder="Copie aqui o trecho que você amou…"></textarea>
      <div class="quote-linha">
        <label for="quote-pagina">Página</label>
        <input id="quote-pagina" type="number" min="1" inputmode="numeric">
        <button class="botao" type="submit">Guardar trecho</button>
      </div>
    </form>`;

  const list = container.querySelector(".quotes-lista");
  const form = container.querySelector(".quote-novo");
  const textInput = form.querySelector("textarea");
  const pageInput = form.querySelector("input");
  let editingId = null; // trecho em edição (só um por vez)

  // Página digitada -> número dentro do livro, ou null se vazia.
  function readPage(value) {
    if (value === "") return null;
    const pages = getBook().pages;
    return Math.max(1, Math.min(Number(value), pages || Infinity));
  }

  function render() {
    const quotes = getBook()?.quotes || [];
    container.querySelector(".quotes-vazio").hidden = quotes.length > 0;
    pageInput.max = getBook()?.pages || "";
    list.replaceChildren(...sorted(quotes).map((q) => (q.id === editingId ? editCard(q) : card(q))));
  }

  function card(q) {
    const li = document.createElement("li");
    li.className = "quote";
    li.dataset.id = q.id;
    li.innerHTML = `
      <blockquote></blockquote>
      <div class="quote-rodape">
        <span class="quote-pagina"></span>
        <span class="quote-acoes">
          <button class="link" type="button" data-acao="editar">editar</button>
          <button class="link" type="button" data-acao="apagar">apagar</button>
        </span>
      </div>`;
    li.querySelector("blockquote").textContent = q.text;
    li.querySelector(".quote-pagina").textContent = q.page ? `— p. ${q.page}` : "";
    return li;
  }

  function editCard(q) {
    const li = document.createElement("li");
    li.className = "quote editando";
    li.dataset.id = q.id;
    li.innerHTML = `
      <textarea aria-label="Texto do trecho"></textarea>
      <div class="quote-linha">
        <label>Página <input type="number" min="1" inputmode="numeric"></label>
        <button class="botao" type="button" data-acao="salvar">Salvar</button>
        <button class="botao secundario" type="button" data-acao="cancelar">Cancelar</button>
      </div>`;
    li.querySelector("textarea").value = q.text;
    li.querySelector("input").value = q.page ?? "";
    li.querySelector("input").max = getBook().pages || "";
    return li;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = textInput.value.trim();
    if (!text) return;
    const quote = { id: newId(), text, page: readPage(pageInput.value), createdAt: new Date().toISOString() };
    await save({ quotes: [...(getBook().quotes || []), quote] });
    textInput.value = "";
    pageInput.value = "";
    render();
    // Destaca o trecho novo.
    list.querySelector(`[data-id="${quote.id}"]`)?.classList.add("novo");
  });

  list.addEventListener("click", async (event) => {
    const action = event.target.closest("[data-acao]")?.dataset.acao;
    const li = event.target.closest(".quote");
    if (!action || !li) return;
    const quotes = getBook().quotes || [];
    const quote = quotes.find((q) => q.id === li.dataset.id);

    if (action === "editar") {
      editingId = quote.id;
      render();
      list.querySelector(".editando textarea").focus();
    } else if (action === "cancelar") {
      editingId = null;
      render();
    } else if (action === "salvar") {
      const text = li.querySelector("textarea").value.trim();
      if (!text) return;
      const page = readPage(li.querySelector("input").value);
      editingId = null;
      await save({ quotes: quotes.map((q) => (q.id === quote.id ? { ...q, text, page } : q)) });
      render();
    } else if (action === "apagar") {
      const preview = quote.text.length > 80 ? quote.text.slice(0, 80) + "…" : quote.text;
      const ok = await confirmDialog({
        title: "Apagar este trecho?",
        message: `"${preview}" será apagado. Isso não pode ser desfeito.`,
        confirmText: "Sim, apagar",
        danger: true,
      });
      if (!ok) return;
      await save({ quotes: quotes.filter((q) => q.id !== quote.id) });
      render();
    }
  });

  return {
    render() {
      editingId = null;
      textInput.value = "";
      pageInput.value = "";
      render();
    },
  };
}
