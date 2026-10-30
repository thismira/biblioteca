// Janela de cadastro de livro, em três passos:
//   1. Buscar na Open Library (português ou inglês) e escolher o livro
//   2. Escolher a edição (define capa, número de páginas e ISBN)
//   3. Revisar e guardar (status, página atual, favorito, categorias)
// Também dá para pular a busca e cadastrar à mão.

import * as db from "../data/db.js";
import { searchBooks, getEditions, coverUrl, suggestCategories, LANGUAGES } from "../services/openlibrary.js";
import { createCategoryPicker } from "./category-picker.js";
import { createStar } from "./favorite-star.js";

const SEARCH_DELAY = 450; // espera ela parar de digitar (ms)

let dialog, steps, searchInput, statusEl, resultsEl;
let editionStatusEl, editionListEl, tabsEl;
let form, coverImg, picker, star;
let searchTimer, searchController, editionController;

// O livro que está sendo cadastrado (preenchido pela busca ou à mão).
let draft = null;
// Edições já carregadas: { por: [...], eng: [...] } e a aba atual.
let editions = {};
let currentLang = "por";

const today = () => new Date().toISOString().slice(0, 10);

function build() {
  dialog = document.createElement("dialog");
  dialog.className = "janela-cadastro";
  dialog.innerHTML = `
    <div class="janela">
      <section class="passo" data-passo="busca">
        <h2>Novo livro</h2>
        <form class="busca" role="search">
          <input type="search" name="q" placeholder="Busque pelo título ou autor, em português ou inglês…" autocomplete="off" aria-label="Buscar livro">
          <button class="botao" type="submit">Buscar</button>
        </form>
        <p class="busca-status" aria-live="polite"></p>
        <ul class="resultados"></ul>
        <div class="acoes">
          <button class="botao secundario" type="button" data-acao="manual">Não achei, cadastrar à mão</button>
          <button class="botao secundario" type="button" data-acao="fechar">Fechar</button>
        </div>
      </section>

      <section class="passo" data-passo="edicao" hidden>
        <h2>Qual é a sua edição?</h2>
        <p class="edicao-livro"></p>
        <div class="abas-idioma" role="tablist" aria-label="Idioma da edição">
          ${Object.entries(LANGUAGES)
            .map(([code, name]) => `<button type="button" role="tab" data-lang="${code}">${name} <span class="contador"></span></button>`)
            .join("")}
        </div>
        <p class="busca-status edicao-status" aria-live="polite"></p>
        <ul class="resultados edicoes"></ul>
        <div class="acoes">
          <button class="botao secundario" type="button" data-acao="voltar-busca">Voltar</button>
          <button class="botao secundario" type="button" data-acao="pular-edicao">Não sei, pular</button>
        </div>
      </section>

      <form class="passo passo-revisar" data-passo="revisar" hidden>
        <div class="titulo-com-estrela">
          <h2>Revisar livro</h2>
          <span class="lugar-estrela"></span>
        </div>
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
            <p class="info-edicao"></p>
            <div class="campo campo-paginas">
              <label for="cad-paginas">Número de páginas</label>
              <input id="cad-paginas" name="pages" type="number" min="1" inputmode="numeric">
            </div>
            <div class="linha-campos">
              <div class="campo">
                <label for="cad-status">Status</label>
                <select id="cad-status" name="status">
                  <option value="quero ler">Quero ler</option>
                  <option value="lendo">Lendo</option>
                  <option value="lido">Lido</option>
                </select>
              </div>
              <div class="campo">
                <label for="cad-formato">Formato</label>
                <select id="cad-formato" name="format">
                  <option value="fisico">Físico</option>
                  <option value="kindle">Kindle</option>
                </select>
              </div>
            </div>
            <div class="campo campo-pagina-atual" hidden>
              <label for="cad-pagina-atual">Em que página você está?</label>
              <input id="cad-pagina-atual" name="currentPage" type="number" min="0" inputmode="numeric">
              <small class="dica-pagina"></small>
            </div>
          </div>
        </div>
        <div class="campo">
          <span class="rotulo">Categorias</span>
          <div class="seletor-categorias"></div>
        </div>
        <div class="acoes">
          <button class="botao secundario" type="button" data-acao="voltar-revisar">Voltar</button>
          <button class="botao" type="submit">Guardar na estante</button>
        </div>
      </form>
    </div>`;
  document.body.appendChild(dialog);

  steps = Object.fromEntries([...dialog.querySelectorAll(".passo")].map((el) => [el.dataset.passo, el]));
  searchInput = dialog.querySelector('input[name="q"]');
  statusEl = steps.busca.querySelector(".busca-status");
  resultsEl = steps.busca.querySelector(".resultados");
  editionStatusEl = steps.edicao.querySelector(".edicao-status");
  editionListEl = steps.edicao.querySelector(".edicoes");
  tabsEl = steps.edicao.querySelector(".abas-idioma");
  form = steps.revisar;
  coverImg = form.querySelector(".capa-previa img");

  star = createStar();
  form.querySelector(".lugar-estrela").appendChild(star.element);

  // Passo 1: busca enquanto digita (com uma pequena espera) ou ao apertar Enter.
  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    const q = searchInput.value.trim();
    if (q.length >= 3) searchTimer = setTimeout(() => runSearch(q), SEARCH_DELAY);
  });
  steps.busca.querySelector(".busca").addEventListener("submit", (event) => {
    event.preventDefault();
    clearTimeout(searchTimer);
    const q = searchInput.value.trim();
    if (q) runSearch(q);
  });
  on("manual", () => showReview({ manual: true, title: searchInput.value.trim() }));
  on("fechar", () => dialog.close());

  // Passo 2: abas de idioma e botões.
  tabsEl.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-lang]");
    if (tab) selectLang(tab.dataset.lang);
  });
  on("voltar-busca", () => showStep("busca"));
  on("pular-edicao", () => showReview(fromWork(draft.result)));

  // Passo 3
  on("voltar-revisar", () => showStep(draft.manual ? "busca" : "edicao"));
  form.status.addEventListener("change", updateCurrentPageField);
  form.pages.addEventListener("input", updateCurrentPageField);
  form.addEventListener("submit", save);
  coverImg.addEventListener("error", () => setCover(""));

  dialog.addEventListener("close", () => {
    searchController?.abort();
    editionController?.abort();
  });
}

function on(action, fn) {
  dialog.querySelector(`[data-acao="${action}"]`).addEventListener("click", fn);
}

function showStep(name) {
  Object.entries(steps).forEach(([key, el]) => (el.hidden = key !== name));
  if (name === "busca") searchInput.focus();
}

// ---------- Passo 1: busca ----------

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

function thumb(coverId, title) {
  return coverId
    ? `<img src="${coverUrl(coverId, "M")}" alt="" loading="lazy">`
    : `<span class="miniatura-vazia">${escapeHtml(title.charAt(0))}</span>`;
}

function resultItem(result) {
  const original = result.displayTitle !== result.title ? `<em class="original">${escapeHtml(result.title)}</em>` : "";
  const details = [result.author, result.year].filter(Boolean).join(" · ");
  return listButton(
    `${thumb(result.coverId, result.displayTitle)}
     <span><strong>${escapeHtml(result.displayTitle)}</strong>${original}<small>${escapeHtml(details)}</small></span>`,
    () => chooseWork(result)
  );
}

function listButton(html, onClick) {
  const li = document.createElement("li");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "resultado";
  button.innerHTML = html;
  button.addEventListener("click", onClick);
  li.appendChild(button);
  return li;
}

// ---------- Passo 2: edição ----------

function chooseWork(result) {
  draft = { result };
  editions = {};
  steps.edicao.querySelector(".edicao-livro").textContent = `${result.displayTitle}${result.author ? " · " + result.author : ""}`;
  showStep("edicao");
  loadEditions(result);
  // Começa na aba do idioma em que ela buscou.
  selectLang(result.lang || "por");
}

async function loadEditions(result) {
  editionController?.abort();
  editionController = new AbortController();
  const { signal } = editionController;
  // Carrega os dois idiomas ao mesmo tempo; cada aba atualiza quando chegar.
  await Promise.all(
    Object.keys(LANGUAGES).map(async (lang) => {
      try {
        editions[lang] = await getEditions(result.workKey, lang, { signal });
      } catch (err) {
        if (err.name === "AbortError") return;
        console.error(err);
        editions[lang] = null; // null = erro
      }
      updateTabs();
      if (lang === currentLang) renderEditions();
    })
  );
  // Nenhuma edição em nenhum idioma: segue com os dados gerais do livro.
  if (!signal.aborted && Object.values(editions).every((list) => Array.isArray(list) && !list.length)) {
    showReview(fromWork(result));
  }
}

function updateTabs() {
  tabsEl.querySelectorAll("[data-lang]").forEach((tab) => {
    const list = editions[tab.dataset.lang];
    tab.querySelector(".contador").textContent = Array.isArray(list) ? `(${list.length})` : "";
    tab.setAttribute("aria-selected", String(tab.dataset.lang === currentLang));
  });
}

function selectLang(lang) {
  currentLang = lang;
  updateTabs();
  renderEditions();
}

function renderEditions() {
  const list = editions[currentLang];
  editionListEl.replaceChildren();
  if (list === undefined) {
    editionStatusEl.textContent = "Procurando edições… (a Open Library às vezes demora uns segundos)";
  } else if (list === null) {
    editionStatusEl.textContent = "Não consegui carregar as edições. Você pode tentar de novo ou pular.";
  } else if (!list.length) {
    editionStatusEl.textContent = `Nenhuma edição em ${LANGUAGES[currentLang].toLowerCase()} encontrada.`;
  } else {
    editionStatusEl.textContent = "Escolha a edição que você tem (ou quer ter):";
    editionListEl.replaceChildren(...list.map(editionItem));
  }
}

function editionItem(ed) {
  const details = [ed.publisher, ed.year, ed.pages ? `${ed.pages} páginas` : "páginas não informadas"]
    .filter(Boolean)
    .join(" · ");
  return listButton(
    `${thumb(ed.coverId, ed.title)}<span><strong>${escapeHtml(ed.title)}</strong><small>${escapeHtml(details)}</small></span>`,
    () => showReview(fromEdition(draft.result, ed))
  );
}

// Dados do livro a partir da edição escolhida.
function fromEdition(result, ed) {
  return {
    result,
    title: ed.title || result.displayTitle,
    author: result.author,
    pages: ed.pages || result.pages,
    pagesApprox: !ed.pages && Boolean(result.pages),
    isbn: ed.isbn,
    coverUrl: coverUrl(ed.coverId || result.coverId),
    edition: { publisher: ed.publisher, year: ed.year, lang: ed.lang },
    suggestions: suggestCategories(result.subjects),
  };
}

// Dados gerais da obra, quando ela pula a escolha de edição.
function fromWork(result) {
  return {
    result,
    title: result.displayTitle,
    author: result.author,
    pages: result.pages,
    pagesApprox: Boolean(result.pages),
    isbn: "",
    coverUrl: coverUrl(result.coverId),
    edition: null,
    suggestions: suggestCategories(result.subjects),
  };
}

// ---------- Passo 3: revisar ----------

function showReview(data) {
  draft = { manual: false, title: "", author: "", pages: null, isbn: "", coverUrl: "", edition: null, suggestions: [], ...data };
  form.reset();
  form.elements.title.value = draft.title;
  form.author.value = draft.author;
  star.set(false);
  setCover(draft.coverUrl);

  // Páginas: digitáveis só no cadastro manual; senão vêm da edição.
  form.querySelector(".campo-paginas").hidden = !draft.manual;
  form.pages.value = "";
  const info = form.querySelector(".info-edicao");
  info.hidden = draft.manual;
  if (!draft.manual) info.innerHTML = editionInfo(draft);
  info.querySelector(".trocar-edicao")?.addEventListener("click", () => showStep("edicao"));

  picker = createCategoryPicker(form.querySelector(".seletor-categorias"), {
    selected: draft.suggestions,
    suggestions: draft.suggestions, // se ela remover uma sugestão, ela continua disponível com "+"
    known: db.getAllCategories(),
  });
  updateCurrentPageField();
  showStep("revisar");
  form.elements.title.focus();
}

function editionInfo(d) {
  const pages = d.pages
    ? `<strong>${d.pagesApprox ? "~" : ""}${d.pages} páginas</strong>${d.pagesApprox ? " (aproximado)" : ""}`
    : "<strong>páginas não informadas</strong>";
  const ed = d.edition;
  const extra = ed ? [ed.publisher, ed.year, LANGUAGES[ed.lang]].filter(Boolean).join(", ") : "";
  return `${pages}${extra ? " · " + escapeHtml(extra) : ""}
    <button type="button" class="link trocar-edicao">trocar edição</button>`;
}

function totalPages() {
  return draft.manual ? Number(form.pages.value) || null : draft.pages;
}

// Mostra "Em que página você está?" só quando o status é "Lendo".
function updateCurrentPageField() {
  const reading = form.status.value === "lendo";
  const field = form.querySelector(".campo-pagina-atual");
  field.hidden = !reading;
  const total = totalPages();
  form.currentPage.max = total || "";
  form.querySelector(".dica-pagina").textContent = total ? `de ${total} páginas` : "";
}

function setCover(url) {
  const box = form.querySelector(".capa-previa");
  box.classList.toggle("tem-capa", Boolean(url));
  if (url) coverImg.src = url;
  else coverImg.removeAttribute("src");
}

async function save(event) {
  event.preventDefault();
  const status = form.status.value;
  const pages = totalPages();
  const categories = picker.getSelected();
  const favorite = star.isActive();

  let currentPage = 0;
  if (status === "lendo") currentPage = Math.min(Number(form.currentPage.value) || 0, pages || Infinity);
  if (status === "lido") currentPage = pages || 0;

  const book = await db.addBook({
    title: form.elements.title.value.trim(),
    author: form.author.value.trim(),
    pages,
    isbn: draft.isbn,
    coverUrl: draft.coverUrl,
    edition: draft.edition,
    status,
    format: form.format.value,
    currentPage,
    progressLog: status === "lendo" ? [{ date: new Date().toISOString(), page: currentPage }] : [],
    startDate: status === "lendo" ? today() : "",
    favorite,
    categories,
  });
  await db.ensureCategories(categories);

  const starRect = star.element.getBoundingClientRect();
  dialog.close();
  // Avisa a estante para fazer a estrelinha voar até a prateleira de favoritos.
  if (favorite) {
    document.dispatchEvent(new CustomEvent("livro:favoritado", { detail: { id: book.id, fromRect: starRect } }));
  }
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

export function openAddBook() {
  if (!dialog) build();
  searchInput.value = "";
  statusEl.textContent = "";
  resultsEl.replaceChildren();
  draft = null;
  showStep("busca");
  dialog.showModal();
}
