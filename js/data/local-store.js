// Implementação do armazenamento usando o localStorage do navegador.
// É o ÚNICO arquivo do site que toca no localStorage (a biblioteca do
// Supabase guarda ali só a sessão de login). Hoje os livros ficam na nuvem
// (supabase-store.js, mesmas funções); este arquivo serve para ler a
// biblioteca antiga deste navegador e enviá-la para a nuvem.

const KEY_BOOKS = "minha-biblioteca:livros";
const KEY_SETTINGS = "minha-biblioteca:config";

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    console.error("Não consegui ler os dados salvos:", err);
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    if (err.name === "QuotaExceededError") {
      throw new Error("O navegador ficou sem espaço para guardar os dados.");
    }
    throw err;
  }
}

export async function loadBooks() {
  return read(KEY_BOOKS, []);
}

export async function putBook(book) {
  const books = read(KEY_BOOKS, []);
  const i = books.findIndex((b) => b.id === book.id);
  if (i >= 0) books[i] = book;
  else books.push(book);
  write(KEY_BOOKS, books);
}

export async function putBooks(list) {
  write(KEY_BOOKS, [...read(KEY_BOOKS, []).filter((b) => !list.some((n) => n.id === b.id)), ...list]);
}

export async function removeBook(id) {
  write(KEY_BOOKS, read(KEY_BOOKS, []).filter((b) => b.id !== id));
}

export async function loadSettings() {
  return read(KEY_SETTINGS, null);
}

export async function saveSettings(settings) {
  write(KEY_SETTINGS, settings);
}

// Substitui tudo de uma vez (usado ao importar um backup).
export async function replaceAll({ books, settings }) {
  write(KEY_BOOKS, books);
  write(KEY_SETTINGS, settings);
}

// ---------- Escritório: rascunhos dos capítulos ----------
// Cópia do texto guardada NESTE aparelho antes de cada envio para a nuvem
// (se a internet cair ou a página fechar no meio, nada se perde). Some
// depois que a nuvem confirma. Funções síncronas: precisam funcionar
// também no instante em que a página está fechando.
const draftKey = (chapterId) => `minha-biblioteca:rascunho:${chapterId}`;

export function saveDraft(chapterId, draft) {
  write(draftKey(chapterId), draft);
}

export function loadDraft(chapterId) {
  return read(draftKey(chapterId), null);
}

export function removeDraft(chapterId) {
  try {
    localStorage.removeItem(draftKey(chapterId));
  } catch {
    // sem acesso ao armazenamento: nada a apagar
  }
}
