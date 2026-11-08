// O escritório (M’s Workspace): a sala onde ela guarda e escreve as próprias
// histórias. Fica numa tela só dele — a biblioteca some e a mesa aparece.
//
// Endereços: #/escritorio (a mesa), #/historia/<id>[/<aba>] (o caderno
// aberto), #/historia/<id>/capitulo/<id> (o editor de escrita) e
// #/historia/<id>/personagem/<id> (a página de um personagem). O roteador
// de main.js só pergunta `isOfficeHash()` e chama `enterOffice()` /
// `leaveOffice()`; daqui para dentro é tudo aqui.

import * as db from "../data/db.js";
import { done, reducedMotion } from "../ui/fly-book.js";
import { flipReorder } from "../ui/flip.js";
import { promptDialog, toast } from "../ui/dialogs.js";
import { paintNotebook, nextCover } from "./notebook.js";
import { createStoryPage } from "./story-page.js";
import { createEditor } from "./editor.js";
import { importFromDocs } from "./story-import.js";
import { createCharacterPage } from "./character-page.js";
import { createDragons } from "./dragons.js";

const root = document.getElementById("escritorio");
// O que pertence à biblioteca (some enquanto o escritório está aberto).
const library = [document.querySelector(".topo"), document.getElementById("app")];

let open = false;
let enteredByClick = false; // veio pelo botão? então "← Biblioteca" = voltar
let libraryScroll = 0;      // a biblioteca volta para onde estava
let storyOpenedByClick = false;
let clickedNotebook = null; // caderno clicado (a página da história cresce dele)
let chapterOpenedByClick = false; // "← Manuscrito" = voltar
let openAtEnd = false;            // "Continuar escrevendo": cursor no fim do texto
let characterOpenedByClick = false; // "← Personagens" = voltar

// Filtros da mesa (só na memória): status e gênero. null = todos.
let statusFilter = null;
let genreFilter = null;

export const isOfficeHash = (hash) => /^#\/(escritorio|historia)(\/|$)/.test(hash);
export const isOfficeOpen = () => open;

// Botão "Go to workspace".
export function goToOffice() {
  enteredByClick = true;
  location.hash = "#/escritorio";
}

function backToLibrary() {
  if (enteredByClick) history.back();
  else location.hash = "#/";
}

// ---------- A mesa e a página da história (duas "telas" do escritório) ----------

root.innerHTML = `
  <div class="esc-luz" aria-hidden="true"></div>
  <div class="esc-caixilho" aria-hidden="true"></div>
  <div class="esc-mesa">
    <header class="esc-barra">
      <button class="etiqueta-papel" type="button" data-acao="biblioteca">← Biblioteca</button>
      <div class="esc-titulo"><span class="washi" aria-hidden="true"></span><h1>M’s Workspace</h1></div>
      <button class="etiqueta-papel dir" type="button" data-acao="importar">Trazer do Google Docs</button>
    </header>
    <div class="esc-filtros" role="group" aria-label="Filtrar histórias" hidden></div>
    <div class="esc-cadernos"></div>
    <p class="esc-nada" hidden>Nenhuma história com esse filtro.</p>
    <div class="esc-obj esc-xicara" aria-hidden="true"><span class="pires"></span><span class="asa"></span><span class="boca"></span><span class="cafe"></span><span class="coracao"></span></div>
    <div class="esc-obj esc-caneta" aria-hidden="true"><span class="corpo"></span><span class="clip"></span><span class="anel"></span><span class="bico"></span></div>
    <div class="esc-obj esc-oculos" aria-hidden="true"><i></i><i></i><b></b></div>
    <div class="esc-obj esc-clipe" style="left:210px;bottom:60px;--r:24deg" aria-hidden="true"></div>
    <div class="esc-obj esc-clipe" style="left:240px;bottom:46px;--r:-12deg" aria-hidden="true"></div>
    <button class="esc-postit" type="button" data-acao="continuar" hidden><small>Continuar escrevendo</small><b></b><span></span></button>
  </div>
  <div class="esc-historia" hidden></div>
  <div class="esc-editor" hidden></div>
  <div class="esc-personagem" hidden></div>
  <div class="esc-dragoes" aria-hidden="true" hidden></div>`;

const deskEl = root.querySelector(".esc-mesa");
const storyEl = root.querySelector(".esc-historia");
const editorEl = root.querySelector(".esc-editor");
const characterEl = root.querySelector(".esc-personagem");
const postit = root.querySelector(".esc-postit");
const shelfEl = root.querySelector(".esc-cadernos");
const filtersEl = root.querySelector(".esc-filtros");
const notebooks = new Map(); // id -> botão-caderno (reaproveitados, para o FLIP)

// Os dragões que às vezes cruzam a mesa (o ritmo está em dragons.js).
// Exportado só para testes (`dragons.flyNow()`, `dragons.state`).
export const dragons = createDragons(root.querySelector(".esc-dragoes"), {
  deskVisible: () => open && !deskEl.hidden,
});

const newButton = document.createElement("button");
newButton.type = "button";
newButton.className = "caderno caderno-novo";
newButton.dataset.acao = "nova";
newButton.style.setProperty("--r", "4deg");
newButton.innerHTML = `
  <span class="caderno-folhas"></span><span class="caderno-capa"></span>
  <span class="caderno-mais"><span>+</span>Nova história</span>`;

const storyPage = createStoryPage(storyEl, {
  onBack: backToDesk,
  onDeleted: () => {
    storyOpenedByClick = false;
    history.replaceState(null, "", "#/escritorio");
    routeOffice();
  },
  onOpenChapter: (id, chapterId) => openChapter(id, chapterId),
  onOpenCharacter: (id, characterId) => openCharacter(id, characterId),
});

const characterPage = createCharacterPage(characterEl, {
  onBack: backToCharacters,
  onDeleted: backToCharacters,
});

const editor = createEditor(editorEl, {
  onBack: backToStory,
  onOpenChapter: openChapter,
});

function visibleStories() {
  return db.getStories().filter((s) =>
    (!statusFilter || s.status === statusFilter) && (!genreFilter || s.genres.includes(genreFilter))
  );
}

function renderFilters() {
  const all = db.getStories();
  filtersEl.hidden = all.length < 2;
  if (filtersEl.hidden) return;
  const genres = db.getAllGenres();
  if (genreFilter && !genres.includes(genreFilter)) genreFilter = null;
  const count = (st) => all.filter((s) => s.status === st).length;
  filtersEl.innerHTML = `
    <button type="button" data-filtro="" aria-pressed="${!statusFilter}">Todas</button>
    ${db.STORY_STATUSES.filter(([v]) => count(v)).map(([v, t]) => `
      <button type="button" data-filtro="${v}" data-status="${v}" aria-pressed="${statusFilter === v}"><span class="ponto"></span>${t} <small>${count(v)}</small></button>`).join("")}
    ${genres.length ? `<select aria-label="Gênero"><option value="">Todos os gêneros</option>${genres.map(() => "<option></option>").join("")}</select>` : ""}`;
  const select = filtersEl.querySelector("select");
  if (select) {
    // Nomes de gênero entram como texto (nunca como HTML).
    [...select.options].slice(1).forEach((o, i) => (o.value = o.textContent = genres[i]));
    select.value = genreFilter || "";
  }
}

function renderDesk() {
  renderFilters();
  const list = visibleStories();
  const ids = new Set(list.map((s) => s.id));
  for (const [id, el] of notebooks) {
    if (!ids.has(id)) {
      el.remove();
      notebooks.delete(id);
    }
  }
  const elements = list.map((s) => {
    const el = notebooks.get(s.id) || document.createElement("button");
    notebooks.set(s.id, paintNotebook(el, s));
    return el;
  });
  shelfEl.replaceChildren(newButton, ...elements);
  root.querySelector(".esc-nada").hidden = list.length > 0 || db.getStories().length === 0;
  renderPostit();
}

// Post-it "Continuar escrevendo": o último capítulo em que ela escreveu.
function lastWritten() {
  return db.getStories()
    .filter((s) => s.lastEdit && s.chapterOrder.includes(s.lastEdit.chapterId))
    .sort((a, b) => b.lastEdit.at.localeCompare(a.lastEdit.at))[0] || null;
}

function renderPostit() {
  const story = lastWritten();
  postit.hidden = !story;
  if (!story) return;
  postit.querySelector("b").textContent = story.lastEdit.title || "Sem título";
  postit.querySelector("span").textContent = story.title || "Sem título";
  postit.setAttribute("aria-label", `Continuar escrevendo: ${story.lastEdit.title || "Sem título"}, de ${story.title || "Sem título"}`);
}

const refilter = () => flipReorder(notebooks, renderDesk);

filtersEl.addEventListener("click", (e) => {
  const b = e.target.closest("[data-filtro]");
  if (!b) return;
  statusFilter = b.dataset.filtro || null;
  refilter();
});
filtersEl.addEventListener("change", (e) => {
  genreFilter = e.target.value || null;
  refilter();
});

async function createStory() {
  const title = await promptDialog({
    title: "Nova história",
    label: "Título (dá para mudar depois)",
    placeholder: "Ex.: Cartas para Lisboa",
    confirmText: "Criar história",
    maxLength: 80,
  });
  if (title == null) return;
  let story;
  try {
    story = await db.addStory({ title: title.trim().replace(/\s+/g, " ") || "Sem título", color: nextCover(db.getStories()) });
  } catch (err) {
    toast(err.message);
    return;
  }
  // Se um filtro esconderia o caderno novo, os filtros saem.
  statusFilter = genreFilter = null;
  renderDesk();
  const el = notebooks.get(story.id);
  if (el && !reducedMotion()) {
    // O caderno "cai" na mesa.
    el.animate(
      [{ transform: "translateY(-46px) scale(1.18)", opacity: 0 }, { transform: "none", opacity: 1 }],
      { duration: 520, easing: "cubic-bezier(.3,1.35,.5,1)" }
    );
  }
}

// "Trazer do Google Docs": os cadernos trazidos caem na mesa, um por um.
async function importStories() {
  const touched = await importFromDocs();
  if (!touched.length) return;
  statusFilter = genreFilter = null;
  renderDesk();
  if (!reducedMotion()) {
    touched.forEach((story, i) => notebooks.get(story.id)?.animate(
      [{ transform: "translateY(-46px) scale(1.18)", opacity: 0 }, { transform: "none", opacity: 1 }],
      { duration: 520, delay: i * 90, easing: "cubic-bezier(.3,1.35,.5,1)", fill: "backwards" }
    ));
  }
  toast(touched.length === 1 ? "História trazida ✨" : `${touched.length} histórias trazidas ✨`);
}

// ---------- Abrir e fechar uma história ----------

function openStory(id, notebook) {
  clickedNotebook = notebook;
  storyOpenedByClick = true;
  location.hash = `#/historia/${id}`;
}

function backToDesk() {
  if (storyOpenedByClick) history.back();
  else {
    history.replaceState(null, "", "#/escritorio");
    routeOffice();
  }
}

// ---------- Abrir e fechar um capítulo (o editor) ----------

// `replace`: troca de capítulo sem encher o "voltar" (anterior/próximo).
function openChapter(id, chapterId, { replace = false, atEnd = false } = {}) {
  openAtEnd = atEnd;
  const hash = `#/historia/${id}/capitulo/${chapterId}`;
  if (replace) {
    history.replaceState(null, "", hash);
    routeOffice();
  } else {
    chapterOpenedByClick = true;
    location.hash = hash;
  }
}

function backToStory() {
  const id = location.hash.match(/^#\/historia\/([\w-]+)/)?.[1];
  if (chapterOpenedByClick) history.back();
  else {
    history.replaceState(null, "", id ? `#/historia/${id}` : "#/escritorio");
    routeOffice();
  }
}

async function showEditor(id, chapterId) {
  const wasHidden = editorEl.hidden;
  closeCharacter();
  deskEl.hidden = true;
  storyEl.hidden = true;
  editorEl.hidden = false;
  const opening = editor.open(id, chapterId, { atEnd: openAtEnd });
  openAtEnd = false;
  if (!wasHidden) return opening;
  window.scrollTo(0, 0);
  // A folha sobe devagar até o lugar.
  if (!reducedMotion()) {
    editor.sheet().animate(
      [{ transform: "translateY(28px)", opacity: 0 }, { transform: "none", opacity: 1 }],
      { duration: 380, easing: "cubic-bezier(.2,.8,.2,1)" }
    );
  }
  return opening;
}

// Saiu do editor: salva o que faltar (sem esperar para trocar de tela).
function closeEditor() {
  if (editorEl.hidden) return;
  chapterOpenedByClick = false;
  editorEl.hidden = true;
  editor.close().catch((err) => toast(err.message));
}

// ---------- Abrir e fechar um personagem ----------

function openCharacter(id, characterId) {
  characterOpenedByClick = true;
  location.hash = `#/historia/${id}/personagem/${characterId}`;
}

function backToCharacters(id) {
  if (characterOpenedByClick) history.back();
  else {
    history.replaceState(null, "", `#/historia/${id}/personagens`);
    routeOffice();
  }
}

function showCharacter(id, characterId) {
  if (!characterPage.show(id, characterId)) {
    // personagem que não existe mais: volta ao quadro
    history.replaceState(null, "", `#/historia/${id}/personagens`);
    return routeOffice();
  }
  const wasHidden = characterEl.hidden;
  closeEditor();
  deskEl.hidden = true;
  storyEl.hidden = true;
  characterEl.hidden = false;
  if (!wasHidden) return;
  window.scrollTo(0, 0);
  if (!reducedMotion()) {
    characterPage.book().animate(
      [{ transform: "translateY(28px) scale(.98)", opacity: 0 }, { transform: "none", opacity: 1 }],
      { duration: 380, easing: "cubic-bezier(.2,.8,.2,1)" }
    );
  }
}

function closeCharacter() {
  if (characterEl.hidden) return;
  characterOpenedByClick = false;
  characterEl.hidden = true;
  characterPage.stop(); // a música do player para
}

// FLIP de tamanho: o elemento parece começar no retângulo `from`.
const fromRect = (from, to) => ({
  transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`,
  opacity: 0.25,
});

async function showDesk() {
  closeEditor();
  closeCharacter();
  storyPage.stopMusic(); // a playlist da história para
  const previous = !storyEl.hidden ? storyPage.storyId : null;
  const from = previous ? storyPage.book().getBoundingClientRect() : null;
  storyEl.hidden = true;
  deskEl.hidden = false;
  renderDesk();
  dragons.deskShown();
  // O caderno aberto "fecha" de volta no lugar dele na mesa.
  const target = previous && notebooks.get(previous);
  if (!target || !from || reducedMotion()) return;
  target.scrollIntoView({ block: "center" });
  const to = target.getBoundingClientRect();
  target.style.transformOrigin = "top left";
  await done(target.animate([fromRect(from, to), { transform: "none", opacity: 1 }], { duration: 420, easing: "cubic-bezier(.2,.8,.2,1)" }));
  target.style.transformOrigin = "";
}

async function showStory(id, tab) {
  if (!editorEl.hidden || !characterEl.hidden) {
    closeEditor();
    closeCharacter();
    window.scrollTo(0, 0);
  }
  const from = clickedNotebook?.isConnected ? clickedNotebook.getBoundingClientRect() : null;
  clickedNotebook = null;
  const wasDesk = !deskEl.hidden;
  deskEl.hidden = true;
  storyEl.hidden = false;
  storyPage.show(id, tab);
  if (!wasDesk) return;
  window.scrollTo(0, 0);
  // O caderno da mesa "abre" e cresce até virar a página da história.
  const book = storyPage.book();
  const to = book.getBoundingClientRect();
  if (!from || !to.width || reducedMotion()) return;
  book.style.transformOrigin = "top left";
  await done(book.animate([fromRect(from, to), { transform: "none", opacity: 1 }], { duration: 480, easing: "cubic-bezier(.2,.8,.2,1)" }));
  book.style.transformOrigin = "";
}

// Mostra a mesa ou a história, conforme o endereço.
function routeOffice() {
  const chapter = location.hash.match(/^#\/historia\/([\w-]+)\/capitulo\/([\w-]+)$/);
  if (chapter && db.getStory(chapter[1])) return showEditor(chapter[1], chapter[2]);
  const person = location.hash.match(/^#\/historia\/([\w-]+)\/personagem\/([\w-]+)$/);
  if (person && db.getStory(person[1])) return showCharacter(person[1], person[2]);
  const match = location.hash.match(/^#\/historia\/([\w-]+)(?:\/(\w+))?$/);
  if (match && db.getStory(match[1])) return showStory(match[1], match[2]);
  if (match) history.replaceState(null, "", "#/escritorio"); // história que não existe mais
  storyOpenedByClick = false;
  return showDesk();
}

// ---------- Entrar e sair: a sala desliza para o lado e a outra entra ----------
// dir = 1 (indo para o escritório, à direita) ou -1 (voltando).
// `onSwap` roda no instante da troca (ex.: acertar a rolagem da página).
async function slide(fromEls, toEls, dir, onSwap) {
  const quick = reducedMotion();
  if (!quick) {
    await Promise.all(fromEls.map((el) => done(el.animate(
      [{ transform: "none", opacity: 1 }, { transform: `translateX(${-dir * 6}%)`, opacity: 0 }],
      { duration: 260, easing: "cubic-bezier(.4,0,1,1)", fill: "forwards" }
    ))));
  }
  fromEls.forEach((el) => {
    el.hidden = true;
    el.getAnimations().forEach((a) => a.cancel());
  });
  toEls.forEach((el) => (el.hidden = false));
  onSwap?.();
  if (quick) return;
  await Promise.all(toEls.map((el) => done(el.animate(
    [{ transform: `translateX(${dir * 6}%)`, opacity: 0 }, { transform: "none", opacity: 1 }],
    { duration: 420, easing: "cubic-bezier(.2,.8,.2,1)" }
  ))));
}

// Chamado a cada mudança de endereço dentro do escritório.
export async function enterOffice() {
  // As histórias carregam (só na primeira vez) enquanto a sala desliza.
  const loading = db.loadStories().catch((err) => {
    console.error(err);
    toast("Não consegui abrir suas histórias. Confira a internet e tente de novo.");
  });
  if (open) {
    await loading;
    return routeOffice();
  }
  open = true;
  dragons.startVisit();
  libraryScroll = window.scrollY;
  await loading; // (rápido) antes da troca: o endereço pode ser de uma história
  await slide(library, [root], 1, () => {
    document.body.classList.add("no-escritorio");
    routeOffice();
    window.scrollTo(0, 0);
  });
}

export async function leaveOffice() {
  if (!open) return;
  open = false;
  dragons.endVisit();
  enteredByClick = false;
  storyOpenedByClick = false;
  closeEditor();
  closeCharacter();
  storyPage.stopMusic();
  await slide([root], library, -1, () => {
    document.body.classList.remove("no-escritorio");
    window.scrollTo(0, libraryScroll);
  });
}

deskEl.addEventListener("click", (event) => {
  const notebook = event.target.closest(".caderno[data-id]");
  if (notebook) return openStory(notebook.dataset.id, notebook);
  const action = event.target.closest("[data-acao]")?.dataset.acao;
  if (action === "biblioteca") backToLibrary();
  else if (action === "nova") createStory();
  else if (action === "importar") importStories();
  else if (action === "continuar") {
    const story = lastWritten();
    if (!story) return;
    // "Voltar" do editor leva ao Manuscrito da história (e depois à mesa).
    storyOpenedByClick = true;
    history.pushState(null, "", `#/historia/${story.id}`);
    openChapter(story.id, story.lastEdit.chapterId, { atEnd: true });
  }
});

// Mudou alguma história (ex.: salvou na página dela): a mesa acompanha.
db.subscribeStories(() => open && !deskEl.hidden && renderDesk());
