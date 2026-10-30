// Janela de cadastro de livro, em três passos:
//   1. Buscar na Open Library (português ou inglês) e escolher o livro
//   2. Escolher a edição (define capa, número de páginas e ISBN)
//   3. Revisar e guardar (status, página atual, favorito, categorias)
// Também dá para pular a busca e cadastrar à mão.

import * as db from "../data/db.js";
import { searchBooks, isSearchable, getEditions, prefetchEditions, coverUrl, suggestCategories, LANGUAGES } from "../services/openlibrary.js";
import { createCategoryPicker } from "./category-picker.js";
import { createStar } from "./favorite-star.js";
import { setCoverImage } from "./cover-image.js";

const SEARCH_DELAY = 350; // espera ela parar de digitar (ms)

let dialog, steps, searchInput, statusEl, resultsEl;
let editionStatusEl, editionListEl, tabsEl;
let form, coverImg, picker, shelfPicker, star;
let searchTimer, searchController, editionController;

// O livro que está sendo cadastrado (preenchido pela busca ou à mão).
let draft = null;
let rating = 0; // nota escolhida no cadastro (quando o status é "Lido")
let destination = "estante"; // "estante" ou "desejos" (lista de desejos)
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
        <div class="alternar destino" role="radiogroup" aria-label="Guardar em">
          <button type="button" role="radio" data-destino="estante">📚 Estante</button>
          <button type="button" role="radio" data-destino="desejos">♡ Lista de desejos</button>
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
            <div class="linha-campos campos-status">
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
            <div class="linha-campos campos-lido" hidden>
              <div class="campo">
                <span class="rotulo">Sua nota</span>
                <div class="nota-estrelas" role="radiogroup" aria-label="Nota de 1 a 5">
                  ${[1, 2, 3, 4, 5].map((n) => `<button type="button" role="radio" data-nota="${n}" aria-label="${n} estrela${n > 1 ? "s" : ""}">★</button>`).join("")}
                </div>
              </div>
              <div class="campo">
                <label for="cad-fim">Terminei em</label>
                <input id="cad-fim" name="endDate" type="date">
              </div>
            </div>
          </div>
        </div>
        <div class="campo">
          <span class="rotulo">Categorias</span>
          <div class="seletor-categorias"></div>
        </div>
        <div class="campo campo-estantes">
          <span class="rotulo">Estantes</span>
          <div class="seletor-estantes"></div>
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
    if (isSearchable(q)) searchTimer = setTimeout(() => runSearch(q), SEARCH_DELAY);
    else if (q) statusEl.textContent = "Continue digitando…";
  });
  steps.busca.querySelector(".busca").addEventListener("submit", (event) => {
    event.preventDefault();
    clearTimeout(searchTimer);
    const q = searchInput.value.trim();
    if (isSearchable(q)) runSearch(q);
    else if (q) statusEl.textContent = "Digite um pouco mais do título ou do nome do autor.";
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
  form.status.addEventListener("change", updateStatusFields);
  form.pages.addEventListener("input", updateStatusFields);
  setupRating();
  form.querySelector(".destino").addEventListener("click", (event) => {
    const button = event.target.closest("[data-destino]");
    if (!button) return;
    destination = button.dataset.destino;
    updateStatusFields();
  });
  form.addEventListener("submit", save);

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

// Pede duas versões da busca ao mesmo tempo: a rápida aparece primeiro e a
// completa (com o título da edição em português, se for o caso) atualiza os
// mesmos itens quando chega, sem refazer a lista.
async function runSearch(query) {
  searchController?.abort(); // cancela a busca anterior, se ainda estiver em andamento
  searchController = new AbortController();
  const { signal } = searchController;
  statusEl.textContent = "Procurando nas prateleiras da Open Library…";
  resultsEl.replaceChildren();

  const show = (results) => {
    if (signal.aborted) return;
    statusEl.textContent = results.length
      ? `${results.length} resultado${results.length > 1 ? "s" : ""}. Escolha o seu livro:`
      : "Nenhum livro encontrado. Tente outro título ou cadastre à mão.";
    renderResults(results);
  };
  const full = searchBooks(query, { signal });
  const quick = searchBooks(query, { signal, quick: true });
  let fullArrived = false;
  quick.then((results) => !fullArrived && show(results), () => {});
  try {
    const results = await full;
    fullArrived = true;
    show(results);
  } catch (err) {
    if (err.name === "AbortError") return;
    // A completa falhou: se a rápida chegou, fica com ela.
    const results = await quick.catch(() => null);
    if (results) return show(results);
    if (signal.aborted) return;
    console.error(err);
    statusEl.textContent = err.status
      ? "Não consegui buscar com esse texto. Tente escrever mais do título ou o nome do autor."
      : "Não consegui falar com a Open Library. Verifique a internet e tente de novo.";
  }
}

// Desenha os resultados reaproveitando os itens que já estão na tela (pela
// obra): trocar a versão rápida pela completa só atualiza título e capa.
function renderResults(results) {
  const current = new Map([...resultsEl.children].map((li) => [li.dataset.obra, li]));
  const items = results.map((result) => {
    const html = resultHtml(result);
    let li = current.get(result.workKey);
    if (li && li.dataset.html === html) {
      li.result = result;
      return li;
    }
    const replaced = li;
    li = listButton(html, () => chooseWork(li.result));
    li.dataset.obra = result.workKey;
    li.dataset.html = html;
    li.result = result;
    // Começa a buscar as edições assim que ela mira o livro.
    const button = li.firstElementChild;
    const prefetch = () => prefetchEditions(li.result.workKey);
    button.addEventListener("pointerenter", prefetch, { once: true });
    button.addEventListener("focus", prefetch, { once: true });
    // Mantém o foco do teclado se o item estava focado.
    if (replaced?.contains(document.activeElement)) queueMicrotask(() => button.focus());
    return li;
  });
  const same = resultsEl.children.length === items.length && items.every((li, i) => resultsEl.children[i] === li);
  if (!same) resultsEl.replaceChildren(...items);
}

// Miniatura da capa (carregada depois, com novas tentativas) ou a inicial.
const initial = (title) => `<span class="miniatura-vazia">${escapeHtml(title.charAt(0))}</span>`;
function thumb(coverId, title) {
  return coverId
    ? `<img data-capa="${coverUrl(coverId, "M")}" data-inicial="${escapeHtml(title.charAt(0))}" alt="" loading="lazy">`
    : initial(title);
}

function resultHtml(result) {
  const original = result.displayTitle !== result.title ? `<em class="original">${escapeHtml(result.title)}</em>` : "";
  const details = [result.author, result.year].filter(Boolean).join(" · ");
  return `${thumb(result.coverId, result.displayTitle)}
     <span><strong>${escapeHtml(result.displayTitle)}</strong>${original}<small>${escapeHtml(details)}</small></span>`;
}

function listButton(html, onClick) {
  const li = document.createElement("li");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "resultado";
  button.innerHTML = html;
  const img = button.querySelector("img[data-capa]");
  if (img) {
    // Se a capa não vier mesmo depois das novas tentativas, mostra a inicial.
    setCoverImage(img, img.dataset.capa, { onFail: () => img.outerHTML = initial(img.dataset.inicial) });
  }
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
  rating = 0;
  paintRating(0);
  // Estantes criadas por ela (escrever um nome novo cria a estante ao guardar).
  shelfPicker = createCategoryPicker(form.querySelector(".seletor-estantes"), {
    known: db.getShelves().map((s) => s.name),
    placeholder: "Criar estante e apertar Enter",
    emptyText: "Em nenhuma estante sua (vai para as automáticas)",
  });
  updateStatusFields();
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

// "Lendo" pergunta a página atual; "Lido" pede a nota e a data de término.
function updateStatusFields() {
  const status = form.status.value;
  const wish = destination === "desejos";
  // Na lista de desejos não há status, página, nota nem estantes.
  form.querySelectorAll("[data-destino]").forEach((b) =>
    b.setAttribute("aria-checked", String(b.dataset.destino === destination))
  );
  form.querySelector(".campos-status").hidden = wish;
  form.querySelector(".campo-estantes").hidden = wish;
  form.querySelector('button[type="submit"]').textContent = wish ? "Guardar na lista de desejos" : "Guardar na estante";
  form.querySelector(".campo-pagina-atual").hidden = wish || status !== "lendo";
  form.querySelector(".campos-lido").hidden = wish || status !== "lido";
  if (status === "lido" && !form.endDate.value) form.endDate.value = today();
  const total = totalPages();
  form.currentPage.max = total || "";
  form.querySelector(".dica-pagina").textContent = total ? `de ${total} páginas` : "";
}

// Estrelas da nota: passar o mouse mostra a prévia; clicar de novo apaga.
function setupRating() {
  const stars = [...form.querySelectorAll("[data-nota]")];
  stars.forEach((s) => {
    s.addEventListener("mouseenter", () => paintRating(Number(s.dataset.nota)));
    s.addEventListener("click", () => {
      const n = Number(s.dataset.nota);
      rating = rating === n ? 0 : n;
      paintRating(rating);
    });
  });
  form.querySelector(".nota-estrelas").addEventListener("mouseleave", () => paintRating(rating));
}

function paintRating(n) {
  form.querySelectorAll("[data-nota]").forEach((s) => {
    s.classList.toggle("acesa", Number(s.dataset.nota) <= n);
    s.setAttribute("aria-checked", String(Number(s.dataset.nota) === n));
  });
}

function setCover(url) {
  const box = form.querySelector(".capa-previa");
  box.classList.toggle("tem-capa", Boolean(url));
  if (url) setCoverImage(coverImg, url, { onFail: () => box.classList.remove("tem-capa") });
  else {
    coverImg._coverTicket = null; // cancela tentativas pendentes
    coverImg.removeAttribute("src");
  }
}

async function save(event) {
  event.preventDefault();
  const wish = destination === "desejos";
  const status = wish ? "quero ler" : form.status.value;
  const pages = totalPages();
  const categories = picker.getSelected();
  const favorite = star.isActive();

  let currentPage = 0;
  if (status === "lendo") currentPage = Math.min(Number(form.currentPage.value) || 0, pages || Infinity);
  if (status === "lido") currentPage = pages || 0; // lido = progresso 100%
  // Histórico de leitura: "Lendo" registra a página atual; "Lido", a última.
  const now = new Date().toISOString();
  let progressLog = [];
  if (status === "lendo") progressLog = [{ date: now, page: currentPage }];
  if (status === "lido" && pages) progressLog = [{ date: now, page: pages }];

  const book = await db.addBook({
    location: destination,
    title: form.elements.title.value.trim(),
    author: form.author.value.trim(),
    pages,
    isbn: draft.isbn,
    coverUrl: draft.coverUrl,
    edition: draft.edition,
    status,
    format: form.format.value,
    currentPage,
    progressLog,
    startDate: status === "lendo" ? today() : "",
    endDate: status === "lido" ? form.endDate.value || today() : "",
    rating: status === "lido" ? rating : 0,
    favorite,
    categories,
  });
  await db.ensureCategories(categories);

  // Estantes escolhidas: as que ainda não existem são criadas agora.
  const shelfIds = [];
  for (const name of wish ? [] : shelfPicker.getSelected()) {
    const existing = db.getShelves().find((s) => s.name.toLowerCase() === name.toLowerCase());
    shelfIds.push(existing ? existing.id : (await db.addShelf(name)).id);
  }
  if (shelfIds.length) await db.setBookShelves(book.id, shelfIds);

  const coverRect = form.querySelector(".capa-previa").getBoundingClientRect();
  const starRect = star.element.getBoundingClientRect();
  dialog.close();
  // Avisa a estante: o livro voa até o lugar dele e, se for favorito,
  // a estrelinha voa até a prateleira de favoritos.
  document.dispatchEvent(
    new CustomEvent("livro:adicionado", { detail: { id: book.id, coverRect, favorite, starRect } })
  );
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// `query`: texto para já começar buscando (ex.: vindo da busca da sala).
// `destination`: "estante" ou "desejos" (já marcado na revisão).
export function openAddBook(query = "", { destination: start = "estante" } = {}) {
  if (!dialog) build();
  destination = start;
  searchInput.value = query;
  statusEl.textContent = "";
  resultsEl.replaceChildren();
  draft = null;
  showStep("busca");
  dialog.showModal();
  if (isSearchable(query)) runSearch(query);
}
