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
    world: [],          // worldbuilding: seções com fichas (ver addWorldSection)
    worldPhotos: [],    // álbum de fotos do mundo: [{ path, w, h }]
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
    stories = list.map((s) => {
      const story = storyDefaults(s);
      return { ...story, characters: story.characters.map((c) => characterDefaults(c)) };
    });
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
  const story = getStory(id);
  const photos = [
    ...(story?.characters || []).flatMap(characterFiles),
    ...worldFiles(story?.world || []),
    ...(story?.worldPhotos || []).map((p) => p.path),
  ];
  await store.removeStory(id);
  removePhotosQuietly(photos);
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

// ---------- Escritório: personagens ----------
// Ficam dentro da história (`story.characters`, na ordem do quadro).
// Fotos no Storage: `cover` = a capa (foto da polaroid, recortada em
// retrato) e `photos` = o álbum ({ path, w, h }). A capa pode ser uma foto
// do álbum (mesmo arquivo): um arquivo só é apagado quando não é usado
// em nenhum dos dois.

function characterDefaults(fields) {
  const now = new Date().toISOString();
  // Personagens de antes do álbum: a primeira foto era a capa.
  const cover = "cover" in fields ? fields.cover : fields.photos?.[0] || null;
  return {
    id: newId(),
    name: "",
    role: "",
    about: "",
    traits: [],
    photos: [],     // álbum
    quotes: [],     // { id, text, chapterId, createdAt }
    spotifyUrl: "",
    lyrics: [],     // { id, text, song, artist, createdAt }
    createdAt: now,
    updatedAt: now,
    ...fields,
    cover,
  };
}

export const getCharacter = (storyId, id) =>
  getStory(storyId)?.characters.find((c) => c.id === id) || null;

export async function addCharacter(storyId, fields) {
  const character = characterDefaults(fields);
  await updateStory(storyId, { characters: [...getStory(storyId).characters, character] });
  return character;
}

export function updateCharacter(storyId, id, changes) {
  const story = getStory(storyId);
  const characters = story.characters.map((c) =>
    c.id === id ? { ...c, ...changes, updatedAt: new Date().toISOString() } : c
  );
  return updateStory(storyId, { characters });
}

// Nova ordem do quadro (depois de arrastar).
export function moveCharacters(storyId, ids) {
  const byId = new Map(getStory(storyId).characters.map((c) => [c.id, c]));
  const characters = ids.map((id) => byId.get(id)).filter(Boolean);
  // (algum que não estava na lista vai para o fim: nunca some)
  getStory(storyId).characters.forEach((c) => !ids.includes(c.id) && characters.push(c));
  return updateStory(storyId, { characters });
}

// Todos os arquivos de foto de um personagem (capa + álbum, sem repetir).
const characterFiles = (c) => [...new Set([c.cover?.path, ...c.photos.map((p) => p.path)].filter(Boolean))];

// Atenção: apaga o personagem e as fotos dele. Só depois de confirmar.
export async function deleteCharacter(storyId, id) {
  const character = getCharacter(storyId, id);
  await updateStory(storyId, { characters: getStory(storyId).characters.filter((c) => c.id !== id) });
  removePhotosQuietly(character ? characterFiles(character) : []);
}

// Fotos que ninguém usa mais: tenta apagar; se falhar, só ocupa espaço.
function removePhotosQuietly(paths) {
  if (!paths.length) return;
  store.removePhotos(paths).catch((err) => console.error("Fotos não apagadas:", err));
  paths.forEach((p) => photoLinks.delete(p));
}

const photoPath = (storyId, id) => `${storyId}/${id}/${newId()}.jpg`;

// Capa nova (foto enviada agora). A antiga sai do Storage se não estiver no álbum.
export async function setCharacterCover(storyId, id, { blob, w, h }) {
  const path = photoPath(storyId, id);
  await store.uploadPhoto(path, blob);
  const old = getCharacter(storyId, id).cover;
  try {
    await updateCharacter(storyId, id, { cover: { path, w, h } });
  } catch (err) {
    removePhotosQuietly([path]);
    throw err;
  }
  if (old && !getCharacter(storyId, id).photos.some((p) => p.path === old.path)) removePhotosQuietly([old.path]);
}

// Uma foto do álbum vira a capa (mesmo arquivo).
export async function useAlbumPhotoAsCover(storyId, id, path) {
  const c = getCharacter(storyId, id);
  const photo = c.photos.find((p) => p.path === path);
  if (!photo || c.cover?.path === path) return;
  const old = c.cover;
  await updateCharacter(storyId, id, { cover: photo });
  if (old && !c.photos.some((p) => p.path === old.path)) removePhotosQuietly([old.path]);
}

// Tira a capa (o arquivo só é apagado se não estiver no álbum).
export async function removeCharacterCover(storyId, id) {
  const c = getCharacter(storyId, id);
  if (!c.cover) return;
  await updateCharacter(storyId, id, { cover: null });
  if (!c.photos.some((p) => p.path === c.cover.path)) removePhotosQuietly([c.cover.path]);
}

// Várias fotos novas no álbum. `onProgress(enviadas, total)`.
export async function addAlbumPhotos(storyId, id, list, onProgress) {
  const added = [];
  try {
    for (const [i, { blob, w, h }] of list.entries()) {
      const path = photoPath(storyId, id);
      await store.uploadPhoto(path, blob);
      added.push({ path, w, h });
      onProgress?.(i + 1, list.length);
    }
  } finally {
    // as que subiram entram no álbum, mesmo se uma falhar no meio
    if (added.length) {
      const c = getCharacter(storyId, id);
      await updateCharacter(storyId, id, { photos: [...c.photos, ...added] }).catch((err) => {
        removePhotosQuietly(added.map((p) => p.path));
        throw err;
      });
    }
  }
  return added;
}

// Atenção: tira a foto do álbum (o arquivo é apagado se não for a capa).
export async function removeAlbumPhoto(storyId, id, path) {
  const c = getCharacter(storyId, id);
  await updateCharacter(storyId, id, { photos: c.photos.filter((p) => p.path !== path) });
  if (c.cover?.path !== path) removePhotosQuietly([path]);
}

// Trecho guardado pelo editor ("⭐ Best quote" / "Dar a um personagem").
const newQuote = (text, chapterId) => ({ id: newId(), text, chapterId: chapterId || null, createdAt: new Date().toISOString() });

export function addStoryQuote(storyId, text, chapterId) {
  return updateStory(storyId, { quotes: [...getStory(storyId).quotes, newQuote(text, chapterId)] });
}

export function addCharacterQuote(storyId, characterId, text, chapterId) {
  const c = getCharacter(storyId, characterId);
  return updateCharacter(storyId, characterId, { quotes: [...c.quotes, newQuote(text, chapterId)] });
}

// Traits já usados em qualquer história (para sugerir nos chips).
export function getAllTraits() {
  const all = new Set();
  stories.forEach((s) => s.characters.forEach((c) => c.traits.forEach((t) => all.add(t))));
  return [...all].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

// Links temporários das fotos (6 h), guardados na memória e renovados
// antes de vencer. Devolve { caminho: link }.
const PHOTO_LINK_SECONDS = 6 * 3600;
const photoLinks = new Map(); // caminho → { url, until }
export async function getPhotoUrls(paths) {
  const now = Date.now();
  const missing = paths.filter((p) => !(photoLinks.get(p)?.until > now + 10 * 60 * 1000));
  if (missing.length) {
    const urls = await store.photoUrls(missing, PHOTO_LINK_SECONDS);
    for (const [p, url] of Object.entries(urls)) photoLinks.set(p, { url, until: now + PHOTO_LINK_SECONDS * 1000 });
  }
  return Object.fromEntries(paths.filter((p) => photoLinks.has(p)).map((p) => [p, photoLinks.get(p).url]));
}

// ---------- Escritório: worldbuilding (aba Mundo) ----------
// `story.world` = seções [{ id, name, cards: [{ id, title, html, image,
// createdAt, updatedAt }] }]. `image` = { path, w, h } no Storage (opcional).

export const WORLD_SUGGESTIONS = ["Lugares", "Magia & regras", "Povos & culturas", "História & linha do tempo", "Objetos", "Glossário"];

const worldFiles = (sections) => sections.flatMap((sec) => sec.cards.map((c) => c.image?.path)).filter(Boolean);

function updateWorld(storyId, change) {
  return updateStory(storyId, { world: change(getStory(storyId).world) });
}

function updateCards(storyId, sectionId, change) {
  return updateWorld(storyId, (world) => world.map((sec) => (sec.id === sectionId ? { ...sec, cards: change(sec.cards) } : sec)));
}

export const getWorldCard = (storyId, sectionId, cardId) =>
  getStory(storyId)?.world.find((s) => s.id === sectionId)?.cards.find((c) => c.id === cardId) || null;

export async function addWorldSection(storyId, name) {
  const section = { id: newId(), name, cards: [] };
  await updateWorld(storyId, (world) => [...world, section]);
  return section;
}

export function renameWorldSection(storyId, sectionId, name) {
  return updateWorld(storyId, (world) => world.map((sec) => (sec.id === sectionId ? { ...sec, name } : sec)));
}

// Atenção: apaga a seção, as fichas e as imagens dela. Só depois de confirmar.
export async function deleteWorldSection(storyId, sectionId) {
  const section = getStory(storyId).world.find((s) => s.id === sectionId);
  await updateWorld(storyId, (world) => world.filter((sec) => sec.id !== sectionId));
  removePhotosQuietly(section ? worldFiles([section]) : []);
}

export async function addWorldCard(storyId, sectionId) {
  const now = new Date().toISOString();
  const card = { id: newId(), title: "", html: "", image: null, createdAt: now, updatedAt: now };
  await updateCards(storyId, sectionId, (cards) => [...cards, card]);
  return card;
}

export function updateWorldCard(storyId, sectionId, cardId, changes) {
  const now = new Date().toISOString();
  return updateCards(storyId, sectionId, (cards) => cards.map((c) => (c.id === cardId ? { ...c, ...changes, updatedAt: now } : c)));
}

// Atenção: apaga a ficha e a imagem dela. Só depois de confirmar.
export async function deleteWorldCard(storyId, sectionId, cardId) {
  const card = getWorldCard(storyId, sectionId, cardId);
  await updateCards(storyId, sectionId, (cards) => cards.filter((c) => c.id !== cardId));
  removePhotosQuietly(card?.image ? [card.image.path] : []);
}

export async function setWorldCardImage(storyId, sectionId, cardId, { blob, w, h }) {
  const path = `${storyId}/mundo/${cardId}/${newId()}.jpg`;
  await store.uploadPhoto(path, blob);
  const old = getWorldCard(storyId, sectionId, cardId)?.image;
  try {
    await updateWorldCard(storyId, sectionId, cardId, { image: { path, w, h } });
  } catch (err) {
    removePhotosQuietly([path]);
    throw err;
  }
  if (old) removePhotosQuietly([old.path]);
}

// Álbum de fotos do mundo (inspiração: lugares, roupas, clima…).
export async function addWorldPhotos(storyId, list, onProgress) {
  const added = [];
  try {
    for (const [i, { blob, w, h }] of list.entries()) {
      const path = `${storyId}/mundo/fotos/${newId()}.jpg`;
      await store.uploadPhoto(path, blob);
      added.push({ path, w, h });
      onProgress?.(i + 1, list.length);
    }
  } finally {
    // as que subiram entram no álbum, mesmo se uma falhar no meio
    if (added.length) {
      await updateStory(storyId, { worldPhotos: [...getStory(storyId).worldPhotos, ...added] }).catch((err) => {
        removePhotosQuietly(added.map((p) => p.path));
        throw err;
      });
    }
  }
  return added;
}

// Atenção: apaga a foto do álbum do mundo. Só depois de confirmar.
export async function removeWorldPhoto(storyId, path) {
  await updateStory(storyId, { worldPhotos: getStory(storyId).worldPhotos.filter((p) => p.path !== path) });
  removePhotosQuietly([path]);
}

// Atenção: apaga a imagem da ficha. Só depois de confirmar.
export async function removeWorldCardImage(storyId, sectionId, cardId) {
  const old = getWorldCard(storyId, sectionId, cardId)?.image;
  await updateWorldCard(storyId, sectionId, cardId, { image: null });
  if (old) removePhotosQuietly([old.path]);
}

// ---------- Importação (Trazer do Google Docs) ----------
// Os capítulos chegam prontos: { title, html, words }. As palavras
// importadas não contam como "escritas hoje".

function newChapters(storyId, list) {
  const now = new Date().toISOString();
  return list.map((c) => ({ id: newId(), storyId, title: c.title, html: c.html, words: c.words, createdAt: now, updatedAt: now }));
}

// Várias histórias novas, na ordem do documento, na frente da mesa.
// `onProgress(feitas, total)`. Se der erro no meio, as já criadas ficam.
export async function importStories(list, onProgress) {
  const first = stories.length ? Math.min(...stories.map((s) => s.order)) - list.length : 0;
  const created = [];
  for (const [i, item] of list.entries()) {
    const story = storyDefaults({ title: item.title, color: item.color, status: item.status || "escrevendo", order: first + i });
    const chapters = newChapters(story.id, item.chapters);
    story.chapterOrder = chapters.map((c) => c.id);
    story.words = chapters.reduce((sum, c) => sum + c.words, 0);
    await store.putStory(story); // a história antes (os capítulos apontam para ela)
    await store.putChapters(chapters);
    stories = [...stories, story];
    chapterLists.set(story.id, chapters.map((c) => ({ id: c.id, title: c.title, words: c.words, updatedAt: c.updatedAt })));
    chapterListsLoading.set(story.id, Promise.resolve());
    created.push(story);
    notifyStories();
    onProgress?.(i + 1, list.length);
  }
  return created;
}

// Capítulos novos no fim de uma história que já existe ("juntar").
export async function appendChapters(storyId, list) {
  await loadChapters(storyId);
  const chapters = newChapters(storyId, list);
  await store.putChapters(chapters);
  chapters.forEach((c) => setChapterMeta(storyId, c));
  const story = getStory(storyId);
  await updateStory(storyId, {
    chapterOrder: [...story.chapterOrder, ...chapters.map((c) => c.id)],
    words: totalWords(storyId),
  });
  return chapters;
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
