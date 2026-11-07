// Ponto de partida do site: liga as telas e os botões.
//
// Telas:
//   - a "sala" (#/ ou sem nada): as estantes em miniatura;
//   - uma estante aberta (#/estante/<id>): a estante grande com os livros
//     (a lista de desejos é a "estante" especial #/estante/desejos);
//   - a página de um livro (#/livro/<id>): abre por cima da tela atual.

import * as db from "./data/db.js";
import { createShelf } from "./ui/shelf.js";
import { createReadingShelf } from "./ui/reading-shelf.js";
import { createRoom } from "./ui/room.js";
import { roomShelves, shelfInfo, shelfBooks, canSort, shelvesContaining, wishlistBooks } from "./ui/shelf-defs.js";
import { createWishlist } from "./ui/wishlist.js";
import { SORT_OPTIONS } from "./ui/sort.js";
import { flipReorder } from "./ui/flip.js";
import { openAddBook } from "./ui/add-book.js";
import { openBackup } from "./ui/backup.js";
import { openBookDetail, closeBookDetail, isBookDetailOpen } from "./ui/book-detail.js";
import { flyIntoShelf, flyIntoCard, reducedMotion, done } from "./ui/fly-book.js";
import { confirmDialog, promptDialog, chooseDialog, alertDialog, toast } from "./ui/dialogs.js";
import { ensureLogin } from "./ui/login.js";
import { pickShelfBooks } from "./ui/shelf-books-picker.js";
import { createSearch, matchesSearch } from "./ui/search.js";
import { enableDragAndDrop } from "./ui/drag.js";
import { isOfficeHash, isOfficeOpen, enterOffice, leaveOffice, goToOffice } from "./office/office.js";
import { queueSpineColor, SPINE_COLOR_VERSION } from "./services/spine-color.js";

// Gravação que falhou (ex.: sem internet): avisa sem travar a tela.
window.addEventListener("unhandledrejection", (event) => {
  const message = event.reason?.message;
  if (message && /salv|conex|conta/i.test(message)) toast(message);
});

// Os livros ficam na nuvem: primeiro o login, depois carrega a biblioteca.
await ensureLogin();
await db.init();

const $ = (id) => document.getElementById(id);
const emptyMessage = $("estante-vazia");
const roomEl = $("sala");
const roomArea = $("sala-area"); // busca + miniaturas
const viewEl = $("vista-estante");
const cabinet = $("movel-vista"); // o móvel da estante aberta
const plural = (n) => `${n} livro${n === 1 ? "" : "s"}`;

let currentShelf = null;      // id da estante aberta (null = sala)
// Filtro por nota de cada estante (lembrado enquanto o site está aberto):
// estante -> Set de notas escolhidas (0 = sem nota). Vazio = mostra todos.
const ratingFilters = new Map();
const activeFilter = () => ratingFilters.get(currentShelf) || new Set();
// Busca dentro de cada estante (também só na memória): estante -> texto.
const textFilters = new Map();
const activeText = () => textFilters.get(currentShelf) || "";
let clickedCard = null;       // miniatura clicada (para a animação de expandir)
let shelfOpenedByClick = false;
let clickedSpine = null;      // livro clicado (para a animação da página do livro)
let bookOpenedByClick = false;

// ---------- Rotas ----------
// Cada tela tem um endereço próprio. Clicar muda o endereço e o site abre a
// tela certa; assim o "voltar" do navegador funciona e os links também.

const viewHash = () => (currentShelf ? `#/estante/${currentShelf}` : "#/");

function parseHash() {
  const book = location.hash.match(/^#\/livro\/([\w-]+)$/);
  const shelf = location.hash.match(/^#\/estante\/([\w-]+)$/);
  return { bookId: book?.[1] || null, shelfId: shelf?.[1] || null };
}

async function route() {
  // O escritório é uma tela à parte: a biblioteca some enquanto ele está aberto.
  if (isOfficeHash(location.hash)) {
    if (isBookDetailOpen()) closeBookDetail();
    return enterOffice();
  }
  if (isOfficeOpen()) await leaveOffice();
  const { bookId, shelfId } = parseHash();
  if (bookId) {
    const spine = clickedSpine;
    clickedSpine = null;
    const ok = await openBookDetail(bookId, {
      spine: spine || findPlace(bookId),
      find: findPlace,
      requestClose: closeBook,
    });
    // Livro que não existe mais (ex.: link antigo): volta para a tela atual.
    if (!ok && !isBookDetailOpen()) history.replaceState(null, "", viewHash());
    return;
  }
  if (isBookDetailOpen()) closeBookDetail();
  bookOpenedByClick = false;
  if (shelfId === currentShelf) return;
  if (shelfId && shelfInfo(shelfId)) await openShelfView(shelfId);
  else {
    if (shelfId) history.replaceState(null, "", "#/"); // estante que não existe mais
    await showRoom();
  }
}

const openBook = (id, spine) => {
  clickedSpine = spine;
  bookOpenedByClick = true;
  location.hash = `#/livro/${id}`;
};

function closeBook() {
  if (bookOpenedByClick) history.back(); // volta para a tela de onde abriu
  else {
    history.replaceState(null, "", viewHash());
    route();
  }
}

function openShelf(id, card) {
  clickedCard = card;
  shelfOpenedByClick = true;
  location.hash = `#/estante/${id}`;
}

function backToRoom() {
  if (shelfOpenedByClick) history.back();
  else {
    history.replaceState(null, "", "#/");
    route();
  }
  shelfOpenedByClick = false;
}

// ---------- Telas ----------

const room = createRoom(roomEl, { onOpen: openShelf, onCreate: createNewShelf });
// Busca na sala: abrir um livro achado, ou cadastrar se não achar.
const search = createSearch({
  input: $("busca-livros"),
  list: $("busca-resultados"),
  onOpen: openBook,
  onAdd: (text) => openAddBook(text),
});
const readingShelf = createReadingShelf($("estante-lendo"), { onOpen: openBook });
const shelf = createShelf($("estante"), { onOpen: openBook });

// Onde o livro aparece na tela atual (capa na "Lendo agora" ou lombada).
const wishlistEl = $("lista-desejos");
const wishlist = createWishlist(wishlistEl, {
  onOpen: openBook,
  onBought: buyWish,
  onRemove: removeWish,
  save: (id, changes) => db.updateBook(id, changes),
});

const findPlace = (id) =>
  readingShelf.elements.get(id) || shelf.elements.get(id) || wishlist.covers.get(id) || null;

// O "móvel" que cresce/encolhe nas animações: a estante, ou a lista de desejos.
const viewBody = () => (shelfInfo(currentShelf)?.wishlist ? wishlistEl : cabinet);

function renderRoom() {
  room.render(roomShelves(), wishlistBooks());
}

// A lista de desejos aberta: cartões no lugar das lombadas.
function renderWishlistView(info) {
  const books = wishlistBooks();
  $("vista-nome").textContent = info.name;
  $("vista-contagem").textContent = plural(books.length);
  const empty = $("vista-vazia");
  empty.hidden = books.length > 0;
  empty.textContent = "Sua lista de desejos está vazia. Quando ver um livro que quer ler ou comprar, guarde aqui. ✨";
  wishlist.render(books);
}

function renderView() {
  const info = shelfInfo(currentShelf);
  if (!info) return;
  // Mostra só o que serve para esta tela: estante (filtros + móvel) ou lista de desejos.
  $("vista-filtros").hidden = Boolean(info.wishlist);
  cabinet.hidden = Boolean(info.wishlist);
  wishlistEl.hidden = !info.wishlist;
  $("btn-novo-desejo").hidden = !info.wishlist;
  $("vista-acoes").hidden = !info.custom;
  if (info.wishlist) return renderWishlistView(info);
  const all = shelfBooks(currentShelf);
  const filter = activeFilter();
  const text = activeText().trim();
  const books = all.filter((b) => (!filter.size || filter.has(b.rating || 0)) && (!text || matchesSearch(b, text)));
  const filtered = filter.size > 0 || Boolean(text);
  const searchInput = $("busca-estante");
  if (searchInput.value !== activeText()) searchInput.value = activeText();
  $("vista-nome").textContent = info.name;
  $("vista-placa").textContent = `${info.icon ? info.icon + " " : ""}${info.name}`;
  $("vista-contagem").textContent = filtered ? `${books.length} de ${plural(all.length)}` : plural(all.length);
  document.querySelectorAll("#filtro-nota [data-nota]").forEach((b) =>
    b.setAttribute("aria-pressed", String(filter.has(Number(b.dataset.nota))))
  );
  document.querySelector('#filtro-nota [data-acao="limpar-filtro"]').hidden = !filter.size;
  $("vista-acoes").hidden = !info.custom;
  $("vista-ordenar").hidden = !canSort(currentShelf);
  $("vista-ordem").value = db.getShelfSort(currentShelf);
  const empty = $("vista-vazia");
  empty.hidden = books.length > 0;
  empty.textContent = all.length && text
    ? `Nenhum livro com “${text}” nesta estante${filter.size ? " (e com essa nota)" : ""}.`
    : all.length && filter.size
    ? "Nenhum livro com essa nota nesta estante."
    : info.custom
      ? "Essa estante ainda está vazia. ✨ Use “+ Adicionar livros” ou a seção “Estantes” na página de cada livro."
      : "Nenhum livro aqui por enquanto.";
  // Mostra o tipo certo de estante antes de desenhar (para medir a largura).
  $("estante-lendo").hidden = !info.covers;
  $("estante").hidden = info.covers;
  readingShelf.render(info.covers ? books : []);
  shelf.render(info.covers ? [] : books);
}

function refresh() {
  // No meio de um arraste a estante não é redesenhada (só depois de soltar).
  if (dragger?.isDragging()) return;
  emptyMessage.hidden = db.getBooks().some((b) => b.location === "estante") || Boolean(currentShelf);
  if (currentShelf) {
    if (shelfInfo(currentShelf)) renderView();
  } else {
    renderRoom();
    search.refresh(); // resultados abertos acompanham mudanças
  }
  ensureSpineColors();
}

// FLIP: o elemento começa no tamanho/posição de `from` e anima até o seu lugar.
function growFrom(el, from) {
  const to = el.getBoundingClientRect();
  if (!from || !to.width || reducedMotion()) return Promise.resolve();
  el.style.transformOrigin = "top left";
  return done(el.animate(
    [
      {
        transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`,
        opacity: 0.35,
      },
      { transform: "none", opacity: 1 },
    ],
    { duration: 520, easing: "cubic-bezier(.2,.8,.2,1)" }
  ));
}

// Ajusta um retângulo medido antes de a página rolar.
const afterScroll = (rect, scrolled) => rect && new DOMRect(rect.left, rect.top - scrolled, rect.width, rect.height);

// Abre uma estante: a miniatura cresce até virar a estante grande.
async function openShelfView(id) {
  const card = clickedCard || room.cards.get(id);
  clickedCard = null;
  const from = card?.isConnected ? card.getBoundingClientRect() : null;
  const scrollBefore = window.scrollY;

  currentShelf = id;
  search.close();
  roomArea.hidden = true;
  emptyMessage.hidden = true;
  $("btn-escritorio").hidden = true; // o escritório só se abre pela sala
  viewEl.hidden = false;
  renderView();
  viewEl.scrollIntoView({ block: "start" });
  const scrolled = window.scrollY - scrollBefore;

  viewEl.querySelector(".vista-cabecalho").animate(
    [{ opacity: 0, transform: "translateY(-8px)" }, { opacity: 1, transform: "none" }],
    { duration: 400, delay: 200, easing: "ease-out", fill: "backwards" }
  );
  await growFrom(viewBody(), afterScroll(from, scrolled));
}

// Volta para a sala: a estante grande encolhe de volta até a miniatura.
async function showRoom() {
  const previous = currentShelf;
  const from = !viewEl.hidden ? viewBody().getBoundingClientRect() : null;
  const scrollBefore = window.scrollY;

  currentShelf = null;
  viewEl.hidden = true;
  roomArea.hidden = false;
  $("btn-escritorio").hidden = false;
  readingShelf.render([]);
  shelf.render([]);
  wishlist.render([]);
  refresh();

  const card = previous && room.cards.get(previous);
  if (!card) return;
  card.scrollIntoView({ block: "center" });
  const scrolled = window.scrollY - scrollBefore;
  // A miniatura "encolhe" do tamanho da estante grande até o seu lugar.
  await growFrom(card, afterScroll(from, scrolled));
}

// ---------- Estantes criadas por ela ----------

const nameProblem = (exceptId) => (name) =>
  db.shelfNameTaken(name, exceptId) ? "Já existe uma estante com esse nome." : null;

async function createNewShelf() {
  const name = await promptDialog({
    title: "Nova estante",
    label: "Nome da estante",
    placeholder: "Ex.: Clube do livro, Para reler, Romances de verão",
    confirmText: "Criar estante",
    validate: nameProblem(null),
  });
  if (!name) return;
  const created = await db.addShelf(name);
  // Abre a estante nova, para ela já colocar livros.
  openShelf(created.id, room.cards.get(created.id));
}

$("vista-acoes").addEventListener("click", async (event) => {
  const action = event.target.closest("[data-acao]")?.dataset.acao;
  const current = db.getShelf(currentShelf);
  if (!action || !current) return;

  if (action === "adicionar-livros") {
    const ids = await pickShelfBooks({
      title: `Livros em “${current.name}”`,
      books: db.getBooks().filter((b) => b.location === "estante"),
      selectedIds: current.bookIds,
    });
    if (!ids) return;
    // Mantém a ordem de quem já estava; os novos entram no fim.
    const keep = current.bookIds.filter((id) => ids.includes(id));
    const added = ids.filter((id) => !current.bookIds.includes(id));
    await db.setShelfBooks(current.id, [...keep, ...added]);
  } else if (action === "renomear") {
    const name = await promptDialog({
      title: "Renomear estante",
      label: "Novo nome",
      value: current.name,
      confirmText: "Salvar",
      validate: nameProblem(current.id),
    });
    if (name) await db.renameShelf(current.id, name);
  } else if (action === "apagar-estante") {
    const ok = await confirmDialog({
      title: "Apagar esta estante?",
      message: `A estante “${current.name}” some, mas os livros continuam na sua biblioteca (em “Todos os livros” e nas outras estantes).`,
      confirmText: "Sim, apagar estante",
      danger: true,
    });
    if (!ok) return;
    await db.deleteShelf(current.id);
    shelfOpenedByClick = false;
    history.replaceState(null, "", "#/");
    route();
  }
});

// ---------- Ordenar ----------
// Trocar o critério reorganiza a estante com a animação FLIP.
const sortSelect = $("vista-ordem");
sortSelect.append(...SORT_OPTIONS.map(([value, label]) => new Option(label, value)));
sortSelect.addEventListener("change", () => {
  const shelfId = currentShelf;
  flipReorder(shelf.elements, () => db.setShelfSort(shelfId, sortSelect.value));
});

// ---------- Filtrar por nota ----------
// Marcar/desmarcar notas mostra só os livros com elas; os que ficam deslizam
// para fechar os espaços (FLIP).
$("filtro-nota").addEventListener("click", (event) => {
  const button = event.target.closest("[data-nota], [data-acao]");
  if (!button || !currentShelf) return;
  const filter = new Set(activeFilter());
  if (button.dataset.acao === "limpar-filtro") filter.clear();
  else {
    const n = Number(button.dataset.nota);
    if (filter.has(n)) filter.delete(n);
    else filter.add(n);
  }
  ratingFilters.set(currentShelf, filter);
  const elements = shelfInfo(currentShelf).covers ? readingShelf.elements : shelf.elements;
  flipReorder(elements, renderView);
});

// ---------- Buscar nesta estante ----------
// Enquanto ela digita, ficam só os livros que combinam (título, autor,
// categoria). A animação espera uma pausa na digitação para não tremer.
const SHELF_SEARCH_DELAY = 180;
let shelfSearchTimer = null;
function filterByText(value) {
  if (!currentShelf) return;
  textFilters.set(currentShelf, value);
  clearTimeout(shelfSearchTimer);
  shelfSearchTimer = setTimeout(() => {
    if (!currentShelf) return;
    const elements = shelfInfo(currentShelf).covers ? readingShelf.elements : shelf.elements;
    flipReorder(elements, renderView);
  }, SHELF_SEARCH_DELAY);
}
$("busca-estante").addEventListener("input", (e) => filterByText(e.target.value));
$("busca-estante").addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || !e.target.value) return;
  e.preventDefault();
  e.target.value = "";
  filterByText("");
});

// ---------- Arrastar e soltar ----------
// Só nas estantes de lombadas (a "Lendo agora" tem ordem automática).

// Arrastar em outra ordem muda para "Personalizado" partindo da ordem que
// está na tela, sem nenhum livro mudar de lugar.
function adoptCurrentOrder() {
  if (db.getShelfSort(currentShelf) === "personalizado") return;
  const shown = shelfBooks(currentShelf).map((b) => b.id); // todos, na ordem atual
  sortSelect.value = "personalizado";
  const custom = db.getShelf(currentShelf);
  if (custom) {
    const rest = custom.bookIds.filter((id) => !shown.includes(id));
    db.setShelfBooks(currentShelf, [...shown, ...rest]);
  } else {
    // Arrumação geral: os lugares desses livros recebem a ordem atual;
    // os outros livros não saem do lugar.
    const order = [...db.getSettings().customOrder];
    const inShelf = new Set(shown);
    const queue = [...shown];
    const merged = order.map((id) => (inShelf.has(id) ? queue.shift() : id)).filter(Boolean);
    db.updateSettings({ customOrder: [...merged, ...queue] });
  }
  db.setShelfSort(currentShelf, "personalizado");
}

// Coloca `id` entre `prevId` e `nextId` numa lista de ids.
function placeBetween(order, id, prevId, nextId) {
  const list = order.filter((x) => x !== id);
  let i = nextId ? list.indexOf(nextId) : -1;
  if (i < 0) {
    const p = prevId ? list.indexOf(prevId) : -1;
    i = p >= 0 ? p + 1 : list.length;
  }
  list.splice(i, 0, id);
  return list;
}

// Salva a arrumação: o livro fica entre os mesmos vizinhos que ela vê
// (com filtro ativo, os livros escondidos não saem do lugar).
async function saveMove(id, prevId, nextId, changed) {
  if (!changed) return refresh();
  const custom = db.getShelf(currentShelf);
  if (custom) await db.setShelfBooks(currentShelf, placeBetween(custom.bookIds, id, prevId, nextId));
  else {
    const order = db.getSettings().customOrder;
    const missing = db.getBooks().map((b) => b.id).filter((x) => !order.includes(x));
    await db.updateSettings({ customOrder: placeBetween([...order, ...missing], id, prevId, nextId) });
  }
}

const dragger = enableDragAndDrop({
  container: $("estante"),
  canDrag: () => Boolean(currentShelf) && !shelfInfo(currentShelf)?.covers,
  onStart: adoptCurrentOrder,
  renderOrder: (ids) => shelf.render(ids.map((id) => db.getBook(id)).filter(Boolean)),
  onDrop: saveMove,
});

// ---------- Lista de desejos ----------

// "Comprei!": pergunta o formato, a capa voa até o botão "← Sala" e o livro
// passa para as estantes (como "Quero ler"); os outros cartões fecham o espaço.
async function buyWish(id, cover) {
  const book = db.getBook(id);
  const format = await chooseDialog({
    title: "Que bom! 📚",
    message: `Em que formato você comprou “${book.title}”?`,
    options: [{ text: "Livro físico", value: "fisico" }, { text: "Kindle", value: "kindle" }],
  });
  if (!format) return;
  if (!reducedMotion()) await flyIntoCard(cover.getBoundingClientRect(), book, $("btn-sala"));
  await flipReorder(wishlist.elements, () =>
    db.updateBook(id, { location: "estante", status: "quero ler", format })
  );
}

async function removeWish(id) {
  const book = db.getBook(id);
  const ok = await confirmDialog({
    title: "Remover da lista de desejos?",
    message: `“${book.title}” sai da sua lista de desejos (e tudo o que você anotou sobre ele). Isso não pode ser desfeito.`,
    confirmText: "Sim, remover",
    danger: true,
  });
  if (!ok) return;
  await flipReorder(wishlist.elements, () => db.deleteBook(id));
}

$("btn-novo-desejo").addEventListener("click", () => openAddBook("", { destination: "desejos" }));

$("btn-sala").addEventListener("click", backToRoom);
$("btn-adicionar").addEventListener("click", () => openAddBook());
$("btn-backup").addEventListener("click", openBackup);
$("btn-escritorio").addEventListener("click", goToOffice);

// ---------- Cores das lombadas ----------
// Livros com capa e sem cor extraída (ou cuja capa ou regra de extração
// mudou) entram na fila. A cor escolhida à mão fica em outro campo
// (spineColorCustom) e tem prioridade, então nunca é substituída.
function ensureSpineColors() {
  for (const book of db.getBooks()) {
    if (!book.coverUrl) continue;
    const source = `v${SPINE_COLOR_VERSION}:${book.coverUrl}`;
    if (book.spineColorSource === source) continue;
    queueSpineColor(book.coverUrl, (color) =>
      db.updateBook(book.id, { spineColor: color, spineColorSource: source })
    );
  }
}

db.subscribe(refresh);
refresh();
window.addEventListener("hashchange", route);
route();
offerLocalUpload();

// Primeira vez na nuvem: se a conta está vazia e este navegador tem a
// biblioteca antiga (de antes do login), oferece enviá-la.
async function offerLocalUpload() {
  if (db.getBooks().length) return;
  const local = await db.readLocalLibrary();
  if (!local.books.length) return;
  const ok = await confirmDialog({
    title: "Levar a biblioteca para a nuvem?",
    message:
      `Este navegador tem ${plural(local.books.length)} guardados de antes do login. ` +
      "Quer enviar para a sua conta? Depois disso eles aparecem em qualquer aparelho em que você entrar.",
    confirmText: "Enviar para a nuvem",
    cancelText: "Agora não",
  });
  if (!ok) return;
  try {
    toast("Enviando os livros…");
    await db.importAll({ books: local.books, settings: local.settings || {} });
    toast(`Pronto! ${plural(local.books.length)} na nuvem ✓`);
  } catch (err) {
    console.error(err);
    alertDialog({ title: "Não deu certo", message: `${err.message} Os livros continuam guardados neste navegador; tente de novo recarregando a página.` });
  }
}

// ---------- Livro novo chegando ----------

// Espera a rolagem suave terminar (com tempo máximo, se o navegador não avisar).
function scrollToCenter(el) {
  return new Promise((resolve) => {
    const finish = () => setTimeout(resolve, 60);
    const timer = setTimeout(finish, 900);
    window.addEventListener("scrollend", () => { clearTimeout(timer); finish(); }, { once: true });
    el.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "center" });
  });
}

// Espera um pouco (para as cópias saírem uma logo depois da outra).
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const COPY_STAGGER = 120; // intervalo entre as cópias (ms)

// A capa voa da janela de cadastro até o lugar do livro:
// - na sala: uma cópia voa para CADA estante a que o livro pertence
//   (Todos, a do status, Favoritos, as estantes dela) e cada uma brilha;
// - numa estante aberta: voa até a lombada (ou capa) dele ali; se ele não
//   pertence a essa estante, voa até o botão "← Sala".
document.addEventListener("livro:adicionado", async ({ detail }) => {
  const book = db.getBook(detail.id);
  if (!book) return;
  // Cadastrado de dentro de uma estante dela: entra também nessa estante
  // (somada às estantes que ela escolheu no cadastro).
  if (shelfInfo(currentShelf)?.custom) {
    const chosen = db.getShelves().filter((s) => s.bookIds.includes(book.id)).map((s) => s.id);
    await db.setBookShelves(book.id, [...new Set([...chosen, currentShelf])]);
  }

  // Desejo novo: voa até o cartão dele na lista, ou até o cartão da lista na sala.
  if (book.location === "desejos") {
    if (reducedMotion()) return;
    if (shelfInfo(currentShelf)?.wishlist) {
      const card = wishlist.elements.get(book.id);
      if (card) {
        await scrollToCenter(card);
        await flyIntoCard(detail.coverRect, book, card);
      }
    } else if (!currentShelf) {
      await scrollToCenter(roomEl);
      await flyIntoCard(detail.coverRect, book, () => room.cards.get("desejos"));
    } else {
      await flyIntoCard(detail.coverRect, book, $("btn-sala"));
    }
    return;
  }

  if (currentShelf) {
    const spine = findPlace(book.id);
    if (spine) {
      spine.style.visibility = "hidden"; // escondida até o livro "chegar"
      await scrollToCenter(spine);
      if (reducedMotion()) spine.style.visibility = "";
      else await flyIntoShelf(detail.coverRect, book, spine);
    } else if (!reducedMotion()) {
      await flyIntoCard(detail.coverRect, book, $("btn-sala"));
    }
    return;
  }

  // Na sala: as estantes do livro que aparecem como miniatura.
  const targets = shelvesContaining(book).filter((id) => room.cards.has(id));
  if (!targets.length || reducedMotion()) return;
  await scrollToCenter(roomEl);
  await Promise.all(
    targets.map((id, i) =>
      wait(i * COPY_STAGGER).then(() => flyIntoCard(detail.coverRect, book, () => room.cards.get(id)))
    )
  );
});
