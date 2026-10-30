// Janela de cadastro de livro, em dois passos:
//   1. Buscar na Open Library e escolher um resultado
//   2. Revisar os dados (tudo editável) e guardar
// Também dá para pular a busca e cadastrar à mão.

import * as db from "../data/db.js";
import { searchBooks, findIsbn, coverUrl, suggestCategories } from "../services/openlibrary.js";
import { createCategoryPicker } from "./category-picker.js";

const SEARCH_DELAY = 450; // espera ela parar de digitar (ms)

let dialog, searchStep, reviewForm, searchInput, statusEl, resultsEl, coverImg;
let picker;
let searchTimer;
let searchController;

function build() {
  dialog = document.createElement("dialog");
  dialog.className = "janela-cadastro";
  dialog.innerHTML = `
    <div class="janela">
      <section class="passo-busca">
        <h2>Novo livro</h2>
        <form class="busca" role="search">
          <input type="search" name="q" placeholder="Busque pelo título ou autor…" autocomplete="off" aria-label="Buscar livro">
          <button class="botao" type="submit">Buscar</button>
        </form>
        <p class="busca-status" aria-live="polite"></p>
        <ul class="resultados"></ul>
        <div class="acoes">
          <button class="botao secundario" type="button" data-acao="manual">Não achei, cadastrar à mão</button>
          <button class="botao secundario" type="button" data-acao="fechar">Fechar</button>
        </div>
      </section>

      <form class="passo-revisar" hidden>
        <h2>Revisar livro</h2>
        <div class="revisar-grade">
          <div class="capa-previa">
            <img alt="Capa do livro">
            <span class="capa-vazia">sem capa</span>
          </div>
          <div>
            <div class="campo">
              <label for="cad-titulo">Título</label>
              <input id="cad-titulo" name="title" required autocomplete="off">
            </div>
            <div class="campo">
              <label for="cad-autor">Autor(a)</label>
              <input id="cad-autor" name="author" autocomplete="off">
            </div>
            <div class="linha-campos">
              <div class="campo">
                <label for="cad-paginas">Páginas</label>
                <input id="cad-paginas" name="pages" type="number" min="1" inputmode="numeric">
              </div>
              <div class="campo">
                <label for="cad-isbn">ISBN</label>
                <input id="cad-isbn" name="isbn" autocomplete="off" inputmode="numeric">
              </div>
            </div>
            <div class="campo">
              <label for="cad-status">Status</label>
              <select id="cad-status" name="status">
                <option value="quero ler">Quero ler</option>
                <option value="lendo">Lendo</option>
                <option value="lido">Lido</option>
              </select>
            </div>
          </div>
        </div>
        <div class="campo">
          <label for="cad-capa">Link da capa <span class="opcional">(opcional)</span></label>
          <input id="cad-capa" name="coverUrl" type="url" placeholder="https://…" autocomplete="off">
        </div>
        <div class="campo">
          <span class="rotulo">Categorias</span>
          <div class="seletor-categorias"></div>
        </div>
        <div class="acoes">
          <button class="botao secundario" type="button" data-acao="voltar">Voltar</button>
          <button class="botao" type="submit">Guardar na estante</button>
        </div>
      </form>
    </div>`;
  document.body.appendChild(dialog);

  searchStep = dialog.querySelector(".passo-busca");
  reviewForm = dialog.querySelector(".passo-revisar");
  searchInput = dialog.querySelector('input[name="q"]');
  statusEl = dialog.querySelector(".busca-status");
  resultsEl = dialog.querySelector(".resultados");
  coverImg = dialog.querySelector(".capa-previa img");

  // Busca enquanto digita (com uma pequena espera) ou ao apertar Enter.
  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    const q = searchInput.value.trim();
    if (q.length >= 3) searchTimer = setTimeout(() => runSearch(q), SEARCH_DELAY);
  });
  dialog.querySelector(".busca").addEventListener("submit", (event) => {
    event.preventDefault();
    clearTimeout(searchTimer);
    const q = searchInput.value.trim();
    if (q) runSearch(q);
  });

  dialog.querySelector('[data-acao="manual"]').addEventListener("click", () =>
    showReview({ title: searchInput.value.trim() })
  );
  dialog.querySelector('[data-acao="fechar"]').addEventListener("click", () => dialog.close());
  dialog.querySelector('[data-acao="voltar"]').addEventListener("click", showSearch);

  // A prévia da capa acompanha o link digitado.
  reviewForm.coverUrl.addEventListener("input", () => setCover(reviewForm.coverUrl.value.trim()));
  coverImg.addEventListener("error", () => setCover(""));

  reviewForm.addEventListener("submit", save);
  dialog.addEventListener("close", () => searchController?.abort());
}

async function runSearch(query) {
  searchController?.abort(); // cancela a busca anterior, se ainda estiver em andamento
  searchController = new AbortController();
  statusEl.textContent = "Procurando nas prateleiras da Open Library…";
  resultsEl.replaceChildren();
  try {
    const results = await searchBooks(query, { signal: searchController.signal });
    statusEl.textContent = results.length
      ? `${results.length} resultado${results.length > 1 ? "s" : ""}. Escolha o seu livro:`
      : "Nenhum livro encontrado. Tente outro título ou cadastre à mão.";
    resultsEl.replaceChildren(...results.map(resultItem));
  } catch (err) {
    if (err.name === "AbortError") return;
    console.error(err);
    statusEl.textContent = "Não consegui falar com a Open Library. Verifique a internet e tente de novo.";
  }
}

function resultItem(result) {
  const li = document.createElement("li");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "resultado";
  const thumb = result.coverId
    ? `<img src="${coverUrl(result.coverId, "M")}" alt="" loading="lazy">`
    : `<span class="miniatura-vazia">${escapeHtml(result.title.charAt(0))}</span>`;
  const details = [result.author, result.year, result.pages && `${result.pages} páginas`]
    .filter(Boolean)
    .join(" · ");
  button.innerHTML = `${thumb}<span><strong>${escapeHtml(result.title)}</strong><small>${escapeHtml(details)}</small></span>`;
  button.addEventListener("click", () => choose(result));
  li.appendChild(button);
  return li;
}

async function choose(result) {
  showReview({
    title: result.title,
    author: result.author,
    pages: result.pages,
    isbn: result.isbn,
    coverUrl: coverUrl(result.coverId, "L"),
    suggestions: suggestCategories(result.subjects),
  });
  // Sem ISBN na edição principal? Procura nas outras edições sem travar a tela.
  if (!result.isbn && result.workKey) {
    reviewForm.isbn.placeholder = "procurando…";
    const isbn = await findIsbn(result.workKey);
    if (!reviewForm.isbn.value) reviewForm.isbn.value = isbn;
    reviewForm.isbn.placeholder = "";
  }
}

function showSearch() {
  reviewForm.hidden = true;
  searchStep.hidden = false;
  searchInput.focus();
}

function showReview({ title = "", author = "", pages = "", isbn = "", coverUrl = "", suggestions = [] }) {
  reviewForm.reset();
  reviewForm.elements.title.value = title;
  reviewForm.author.value = author;
  reviewForm.pages.value = pages || "";
  reviewForm.isbn.value = isbn;
  reviewForm.coverUrl.value = coverUrl;
  setCover(coverUrl);
  picker = createCategoryPicker(reviewForm.querySelector(".seletor-categorias"), {
    selected: suggestions,
    suggestions, // se ela remover uma sugestão, ela continua disponível com "+"
    known: db.getAllCategories(),
  });
  searchStep.hidden = true;
  reviewForm.hidden = false;
  reviewForm.elements.title.focus();
}

function setCover(url) {
  const box = dialog.querySelector(".capa-previa");
  box.classList.toggle("tem-capa", Boolean(url));
  if (url) coverImg.src = url;
  else coverImg.removeAttribute("src");
}

async function save(event) {
  event.preventDefault();
  const f = reviewForm;
  const categories = picker.getSelected();
  await db.addBook({
    title: f.elements.title.value.trim(),
    author: f.author.value.trim(),
    pages: Number(f.pages.value) || null,
    isbn: f.isbn.value.replace(/[^0-9X]/gi, ""),
    coverUrl: f.coverUrl.value.trim(),
    status: f.status.value,
    categories,
  });
  await db.ensureCategories(categories);
  dialog.close();
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

export function openAddBook() {
  if (!dialog) build();
  searchInput.value = "";
  statusEl.textContent = "";
  resultsEl.replaceChildren();
  showSearch();
  dialog.showModal();
}
