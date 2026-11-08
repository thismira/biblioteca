// "Porta de entrada" dos dados. O resto do site só fala com este arquivo.
// Tudo é assíncrono (async/await) para que a troca do localStorage pelo
// Supabase não exija mudar as telas.

// Os livros ficam na nuvem (Supabase). O local-store só é usado para ler a
// biblioteca antiga guardada neste navegador (`readLocalLibrary`).
import * as store from "./supabase-store.js";
import * as local from "./local-store.js";

const DEFAULT_SETTINGS = {
  sortBy: "personalizado",
  customOrder: [],
  categories: [],
  // Critério de ordenação escolhido em cada estante: { [idDaEstante]: "cor" }.
  shelfSort: {},
  // Estantes criadas por ela: [{ id, name, bookIds, createdAt }].
  // `bookIds` também guarda a ordem de arrumação daquela estante.
  shelves: [],
};

let books = [];
let settings = { ...DEFAULT_SETTINGS };
const listeners = new Set();

function newId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function notify() {
  listeners.forEach((fn) => fn());
}

// Valores padrão de um livro novo.
function withDefaults(fields) {
  const now = new Date().toISOString();
  return {
    id: newId(),
    title: "",
    author: "",
    coverUrl: "",
    pages: null,
    isbn: "",
    categories: [],
    location: "estante",
    status: "quero ler",
    format: "fisico", // "fisico" | "kindle" (Kindle não tem foto de lombada)
    currentPage: 0,
    // Histórico de atualizações de leitura: [{ date, page }].
    // Permite mostrar quantas páginas ela leu desde a última atualização.
    progressLog: [],
    progressPercent: null, // % lido no Kindle (o Kindle não mostra páginas)
    favorite: false,
    edition: null, // { publisher, year, lang } da edição escolhida
    startDate: "",
    endDate: "",
    rating: 0,
    review: "",
    quotes: [],
    spotifyUrl: "",
    spineColor: "",          // cor extraída automaticamente da capa
    spineColorSource: "",    // "v<versão da regra>:<capa>" de onde a cor saiu
    spineColorCustom: "",    // cor escolhida à mão (tem prioridade)
    spinePhoto: "",          // foto da lombada (imagem pequena, data URL)
    spinePhotoAspect: null,  // largura ÷ altura da foto
    wishPrice: "",
    wishPriceDate: "",
    createdAt: now,
    updatedAt: now,
    ...fields,
  };
}

export async function init() {
  // Completa livros antigos com os campos que surgiram depois.
  books = (await store.loadBooks()).map((b) => withDefaults(b));
  settings = { ...DEFAULT_SETTINGS, ...(await store.loadSettings()) };
}

// Avisa a função `fn` sempre que algum dado mudar. Devolve um "desligar".
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getBooks() {
  return books;
}

export function getBook(id) {
  return books.find((b) => b.id === id) || null;
}

export function getSettings() {
  return settings;
}

export async function addBook(fields) {
  const book = withDefaults(fields);
  books = [...books, book];
  await store.putBook(book);
  // Livro novo entra no fim da arrumação personalizada.
  await updateSettings({ customOrder: [...settings.customOrder, book.id] });
  return book;
}

export async function updateBook(id, changes) {
  const current = getBook(id);
  if (!current) return null;
  const book = { ...current, ...changes, updatedAt: new Date().toISOString() };
  // Muda na tela na hora e salva na nuvem em seguida. Se falhar (ex.: sem
  // internet), a tela volta ao que estava e o erro segue para quem chamou.
  books = books.map((b) => (b.id === id ? book : b));
  notify();
  try {
    await store.putBook(book);
  } catch (err) {
    books = books.map((b) => (b.id === id && b === book ? current : b));
    notify();
    throw err;
  }
  return book;
}

// Atenção: só chamar depois de a leitora confirmar a exclusão.
export async function deleteBook(id) {
  books = books.filter((b) => b.id !== id);
  await store.removeBook(id);
  await updateSettings({
    customOrder: settings.customOrder.filter((x) => x !== id),
    // o livro também sai de todas as estantes
    shelves: settings.shelves.map((s) => ({ ...s, bookIds: s.bookIds.filter((x) => x !== id) })),
  });
}

// ---------- Estantes criadas por ela ----------
// Um livro pode estar em várias estantes (como playlists).

export function getShelves() {
  return settings.shelves;
}

export function getShelf(id) {
  return settings.shelves.find((s) => s.id === id) || null;
}

// Já existe uma estante com esse nome? (sem diferenciar maiúsculas)
export function shelfNameTaken(name, exceptId = null) {
  const n = name.trim().toLowerCase();
  return settings.shelves.some((s) => s.id !== exceptId && s.name.trim().toLowerCase() === n);
}

export async function addShelf(name, bookIds = []) {
  const shelf = { id: newId(), name: name.trim(), bookIds, createdAt: new Date().toISOString() };
  await updateSettings({ shelves: [...settings.shelves, shelf] });
  return shelf;
}

export async function renameShelf(id, name) {
  await updateSettings({
    shelves: settings.shelves.map((s) => (s.id === id ? { ...s, name: name.trim() } : s)),
  });
}

// Apaga só a estante; os livros continuam na biblioteca.
// Atenção: só chamar depois de a leitora confirmar.
export async function deleteShelf(id) {
  const { [id]: _, ...shelfSort } = settings.shelfSort;
  await updateSettings({ shelves: settings.shelves.filter((s) => s.id !== id), shelfSort });
}

// Critério de ordenação de uma estante ("personalizado" se nunca escolheu).
export function getShelfSort(id) {
  return settings.shelfSort[id] || "personalizado";
}

export async function setShelfSort(id, sortBy) {
  await updateSettings({ shelfSort: { ...settings.shelfSort, [id]: sortBy } });
}

// Define os livros de uma estante (na ordem dada).
export async function setShelfBooks(id, bookIds) {
  await updateSettings({
    shelves: settings.shelves.map((s) => (s.id === id ? { ...s, bookIds: [...new Set(bookIds)] } : s)),
  });
}

// Coloca o livro exatamente nas estantes `shelfIds` (entra no fim das novas).
export async function setBookShelves(bookId, shelfIds) {
  const wanted = new Set(shelfIds);
  await updateSettings({
    shelves: settings.shelves.map((s) => {
      const has = s.bookIds.includes(bookId);
      if (wanted.has(s.id) && !has) return { ...s, bookIds: [...s.bookIds, bookId] };
      if (!wanted.has(s.id) && has) return { ...s, bookIds: s.bookIds.filter((x) => x !== bookId) };
      return s;
    }),
  });
}

// Todas as categorias conhecidas: as criadas por ela + as usadas nos livros.
export function getAllCategories() {
  const all = new Set(settings.categories);
  books.forEach((b) => b.categories.forEach((c) => all.add(c)));
  return [...all].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

// Guarda categorias novas para serem sugeridas nos próximos livros.
export async function ensureCategories(names) {
  const all = new Set(settings.categories);
  names.forEach((n) => all.add(n));
  if (all.size === settings.categories.length) return;
  await updateSettings({
    categories: [...all].sort((a, b) => a.localeCompare(b, "pt-BR")),
  });
}

export async function updateSettings(changes) {
  settings = { ...settings, ...changes };
  await store.saveSettings(settings);
  notify();
}

export async function exportAll() {
  return { app: "minha-biblioteca", version: 1, exportedAt: new Date().toISOString(), books, settings };
}

// Vários livros de uma vez (importação), salvos numa gravação só.
export async function addBooks(list) {
  const added = list.map((fields) => withDefaults(fields));
  const nextBooks = [...books, ...added];
  const nextSettings = { ...settings, customOrder: [...settings.customOrder, ...added.map((b) => b.id)] };
  await store.putBooks(added); // se der erro, nada muda na tela
  await store.saveSettings(nextSettings);
  books = nextBooks;
  settings = nextSettings;
  notify();
  return added;
}

// ---------- Escritório: as histórias dela ----------
// Carregadas só na primeira vez que ela entra no escritório (a biblioteca
// não precisa delas). Avisos próprios (`subscribeStories`), para mudar uma
// história não redesenhar a biblioteca escondida.

export const STORY_STATUSES = [
  ["ideia", "Ideia"],
  ["escrevendo", "Escrevendo"],
  ["editando", "Editando"],
  ["pronta", "Pronta"],
];

// Visual do texto de uma história (vale para todos os capítulos dela).
// paragraphs: "livro" (recuo na primeira linha) ou "docs" (espaço entre eles).
export const STORY_LAYOUT = { font: "Lora", size: 12, spacing: 1.5, paragraphs: "livro" };
export const storyLayout = (story) => ({ ...STORY_LAYOUT, ...story?.layout });

let stories = [];
let storiesLoaded = null; // promessa do primeiro carregamento
const storyListeners = new Set();
const notifyStories = () => storyListeners.forEach((fn) => fn());

function storyDefaults(fields) {
  const now = new Date().toISOString();
  return {
    id: newId(),
    title: "",
    synopsis: "",
    status: "ideia",
    genres: [],
    color: "",          // cor da capa do caderno
    order: 0,           // posição na mesa (menor = primeiro)
    chapterOrder: [],   // ids dos capítulos, na ordem do manuscrito
    words: 0,           // total de palavras (somado dos capítulos)
    characters: [],
    world: [],
    quotes: [],
    spotifyUrl: "",
    writingDays: {},    // { "2026-11-07": palavras escritas nesse dia }
    lastEdit: null,     // { chapterId, title, at } — "Continuar escrevendo"
    layout: {},         // visual do texto (fonte, tamanho…): ver STORY_LAYOUT
    createdAt: now,
    updatedAt: now,
    ...fields,
  };
}

export function loadStories() {
  storiesLoaded ||= store.loadStories().then((list) => {
    stories = list.map((s) => storyDefaults(s));
  }).catch((err) => {
    storiesLoaded = null; // deixa tentar de novo
    throw err;
  });
  return storiesLoaded;
}

export function subscribeStories(fn) {
  storyListeners.add(fn);
  return () => storyListeners.delete(fn);
}

// Na ordem da mesa.
export function getStories() {
  return [...stories].sort((a, b) => a.order - b.order || b.createdAt.localeCompare(a.createdAt));
}

export function getStory(id) {
  return stories.find((s) => s.id === id) || null;
}

export async function addStory(fields) {
  // Entra na frente das outras na mesa.
  const order = stories.length ? Math.min(...stories.map((s) => s.order)) - 1 : 0;
  const story = storyDefaults({ order, ...fields });
  await store.putStory(story); // se der erro, nada muda na tela
  stories = [...stories, story];
  notifyStories();
  return story;
}

// Otimista, como updateBook: muda na hora e desfaz se a gravação falhar.
export async function updateStory(id, changes) {
  const current = getStory(id);
  if (!current) return null;
  const story = { ...current, ...changes, updatedAt: new Date().toISOString() };
  stories = stories.map((s) => (s.id === id ? story : s));
  notifyStories();
  try {
    await store.putStory(story);
  } catch (err) {
    stories = stories.map((s) => (s.id === id && s === story ? current : s));
    notifyStories();
    throw err;
  }
  return story;
}

// Atenção: apaga a história E os capítulos dela. Só depois de confirmar.
export async function deleteStory(id) {
  await store.removeStory(id);
  stories = stories.filter((s) => s.id !== id);
  (chapterLists.get(id) || []).forEach((c) => {
    fullChapters.delete(c.id);
    local.removeDraft(c.id);
  });
  chapterLists.delete(id);
  chapterListsLoading.delete(id);
  notifyStories();
}

// Gêneros já usados nas histórias (para sugerir nos chips).
export function getAllGenres() {
  const all = new Set();
  stories.forEach((s) => s.genres.forEach((g) => all.add(g)));
  return [...all].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

// ---------- Escritório: capítulos ----------
// A lista de cada história (só título e palavras) é carregada quando ela
// abre o manuscrito; o texto inteiro só quando abre o capítulo. A ordem fica
// na história (`chapterOrder`). Avisos pelos mesmos `subscribeStories`.

const chapterLists = new Map(); // storyId → [{ id, title, words, updatedAt }]
const chapterListsLoading = new Map(); // storyId → promessa
const fullChapters = new Map(); // id → capítulo inteiro (com o texto)

export function loadChapters(storyId) {
  if (!chapterListsLoading.has(storyId)) {
    const loading = store.loadChapterList(storyId).then((list) => {
      chapterLists.set(storyId, list);
      notifyStories();
    }).catch((err) => {
      chapterListsLoading.delete(storyId); // deixa tentar de novo
      throw err;
    });
    chapterListsLoading.set(storyId, loading);
  }
  return chapterListsLoading.get(storyId);
}

export const chaptersLoaded = (storyId) => chapterLists.has(storyId);

// Na ordem do manuscrito. Um capítulo fora da ordem (ex.: a gravação da
// ordem falhou) aparece no fim, para nunca sumir.
export function getChapters(storyId) {
  const list = chapterLists.get(storyId) || [];
  const order = getStory(storyId)?.chapterOrder || [];
  const byId = new Map(list.map((c) => [c.id, c]));
  const inOrder = order.map((id) => byId.get(id)).filter(Boolean);
  return [...inOrder, ...list.filter((c) => !order.includes(c.id))];
}

export async function getChapter(id) {
  if (!fullChapters.has(id)) {
    const chapter = await store.loadChapter(id);
    if (chapter) fullChapters.set(id, chapter);
  }
  return fullChapters.get(id) || null;
}

function setChapterMeta(storyId, chapter) {
  const meta = { id: chapter.id, title: chapter.title, words: chapter.words, updatedAt: chapter.updatedAt };
  const list = chapterLists.get(storyId) || [];
  const exists = list.some((c) => c.id === chapter.id);
  chapterLists.set(storyId, exists ? list.map((c) => (c.id === chapter.id ? meta : c)) : [...list, meta]);
}

// Soma das palavras dos capítulos (guardada na história para a mesa).
const totalWords = (storyId) => getChapters(storyId).reduce((sum, c) => sum + c.words, 0);

export async function addChapter(storyId, title) {
  const now = new Date().toISOString();
  const chapter = { id: newId(), storyId, title, html: "", words: 0, createdAt: now, updatedAt: now };
  await store.putChapter(chapter); // se der erro, nada muda na tela
  fullChapters.set(chapter.id, chapter);
  setChapterMeta(storyId, chapter);
  const story = getStory(storyId);
  await updateStory(storyId, { chapterOrder: [...story.chapterOrder, chapter.id] });
  return chapter;
}

// Dia de hoje no fuso dela ("2026-11-07").
const today = () => new Date().toLocaleDateString("sv-SE");
const DAYS_KEPT = 120; // dias guardados no "palavras escritas por dia"

// Grava o capítulo inteiro (título, texto, palavras). Só grava se nenhum
// outro aparelho salvou este capítulo depois da versão que está aberta
// aqui; se salvou, lança um erro com `conflict: true` (ver keepBothVersions).
export async function saveChapter(storyId, changes) {
  const current = await getChapter(changes.id);
  if (!current) throw new Error("Esse capítulo não existe mais.");
  const chapter = { ...current, ...changes, updatedAt: new Date().toISOString() };
  const ok = await store.putChapter(chapter, current.updatedAt);
  if (!ok) {
    const err = new Error("Este capítulo foi alterado em outro aparelho.");
    err.conflict = true;
    throw err;
  }
  fullChapters.set(chapter.id, chapter);
  setChapterMeta(storyId, chapter);

  const story = getStory(storyId);
  if (!story) return chapter;
  const storyChanges = {};
  const words = totalWords(storyId);
  if (words !== story.words) storyChanges.words = words;
  if ("html" in changes) {
    // Palavras escritas hoje (o que ela apagou desconta, sem ficar negativo).
    const delta = chapter.words - current.words;
    if (delta) {
      const days = { ...story.writingDays, [today()]: Math.max(0, (story.writingDays[today()] || 0) + delta) };
      const keep = Object.keys(days).sort().slice(-DAYS_KEPT);
      storyChanges.writingDays = Object.fromEntries(keep.map((d) => [d, days[d]]));
    }
    // Para o post-it "Continuar escrevendo".
    storyChanges.lastEdit = { chapterId: chapter.id, title: chapter.title, at: chapter.updatedAt };
  }
  if (Object.keys(storyChanges).length) await updateStory(storyId, storyChanges);
  else notifyStories();
  return chapter;
}

// Palavras que ela escreveu hoje nesta história.
export const wordsToday = (storyId) => getStory(storyId)?.writingDays[today()] || 0;

// Conflito: outro aparelho salvou este capítulo. Nada é perdido: a versão da
// nuvem continua no capítulo e a deste aparelho (`mine`) vira um capítulo
// novo logo depois dele, "(cópia deste aparelho)". Ela escolhe qual fica.
export async function keepBothVersions(storyId, mine) {
  fullChapters.delete(mine.id);
  const cloud = await getChapter(mine.id); // null se foi apagado no outro aparelho
  const now = new Date().toISOString();
  const copy = {
    id: newId(), storyId, title: `${mine.title || "Sem título"} (cópia deste aparelho)`,
    html: mine.html, words: mine.words, createdAt: now, updatedAt: now,
  };
  await store.putChapter(copy);
  fullChapters.set(copy.id, copy);
  setChapterMeta(storyId, copy);
  if (cloud) setChapterMeta(storyId, cloud);
  else chapterLists.set(storyId, (chapterLists.get(storyId) || []).filter((c) => c.id !== mine.id));
  const order = getStory(storyId).chapterOrder.filter((id) => cloud || id !== mine.id);
  const at = order.indexOf(mine.id);
  order.splice(at >= 0 ? at + 1 : order.length, 0, copy.id);
  await updateStory(storyId, { chapterOrder: order, words: totalWords(storyId) });
  return { cloud, copy };
}

export async function renameChapter(storyId, id, title) {
  try {
    return await saveChapter(storyId, { id, title });
  } catch (err) {
    if (!err.conflict) throw err;
    // Trocar só o nome: pega a versão mais nova e tenta de novo.
    fullChapters.delete(id);
    return saveChapter(storyId, { id, title });
  }
}

// Rascunho deste aparelho (texto ainda não confirmado pela nuvem).
export const getChapterDraft = (id) => local.loadDraft(id);
export const saveChapterDraft = (id, draft) => local.saveDraft(id, draft);
export const discardChapterDraft = (id) => local.removeDraft(id);

// A nova ordem dos capítulos (depois de arrastar).
export function moveChapters(storyId, ids) {
  return updateStory(storyId, { chapterOrder: ids });
}

// Atenção: apaga o texto do capítulo. Só depois de confirmar.
export async function deleteChapter(storyId, id) {
  await store.removeChapter(id);
  fullChapters.delete(id);
  local.removeDraft(id);
  chapterLists.set(storyId, (chapterLists.get(storyId) || []).filter((c) => c.id !== id));
  const story = getStory(storyId);
  await updateStory(storyId, {
    chapterOrder: story.chapterOrder.filter((c) => c !== id),
    words: totalWords(storyId),
  });
}

// Biblioteca guardada neste navegador antes da nuvem (pode estar vazia).
export async function readLocalLibrary() {
  return { books: await local.loadBooks(), settings: await local.loadSettings() };
}

// Atenção: substitui a biblioteca inteira. Só chamar após confirmação.
export async function importAll(data) {
  const nextBooks = data.books.map((b) => withDefaults(b));
  const nextSettings = { ...DEFAULT_SETTINGS, ...data.settings };
  await store.replaceAll({ books: nextBooks, settings: nextSettings }); // se der erro, nada muda
  books = nextBooks;
  settings = nextSettings;
  notify();
}
