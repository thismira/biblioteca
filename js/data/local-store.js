// Implementação do armazenamento usando o localStorage do navegador.
// É o ÚNICO arquivo que toca no localStorage. Para usar o Supabase depois,
// basta criar um supabase-store.js com estas mesmas funções.

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
  localStorage.setItem(key, JSON.stringify(value));
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
