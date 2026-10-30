// Quais estantes existem e quais livros cada uma mostra.
//
// - Automáticas: se enchem sozinhas a partir dos dados do livro.
// - Criadas por ela: guardadas em settings.shelves (db.js), com a lista de
//   livros na ordem da arrumação.

import * as db from "../data/db.js";
import { sortBooks } from "./sort.js";

// Última vez que ela mexeu na leitura (a "Lendo agora" mostra o mais recente primeiro).
const lastActivity = (b) => b.progressLog?.at(-1)?.date || b.startDate || b.createdAt;

// `covers`: mostra capas de frente (com progresso) em vez de lombadas.
// `always`: aparece na sala mesmo vazia.
export const AUTO_SHELVES = [
  {
    id: "lendo", name: "Lendo agora", icon: "❦", covers: true,
    filter: (b) => b.status === "lendo",
    order: (list) => [...list].sort((a, b) => lastActivity(b).localeCompare(lastActivity(a))),
  },
  { id: "favoritos", name: "Favoritos", icon: "★", filter: (b) => b.favorite },
  { id: "todos", name: "Todos os livros", icon: "", always: true, filter: () => true },
  { id: "quero-ler", name: "Quero ler", icon: "", filter: (b) => b.status === "quero ler" },
  { id: "lidos", name: "Lidos", icon: "", filter: (b) => b.status === "lido" },
];

// Livros que estão na estante (não na lista de desejos).
const onShelf = () => db.getBooks().filter((b) => b.location === "estante");

// A lista de desejos aparece na sala como um cartão próprio e abre como uma
// "estante" especial (id "desejos"), com cartões em vez de lombadas.
export const WISHLIST = { id: "desejos", name: "Lista de desejos", icon: "♡", wishlist: true, custom: false };

// Livros da lista de desejos, os mais recentes primeiro.
export function wishlistBooks() {
  return db.getBooks()
    .filter((b) => b.location === "desejos")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// Informações de uma estante: { id, name, icon, covers, custom } ou null.
export function shelfInfo(id) {
  if (id === WISHLIST.id) return { ...WISHLIST };
  const auto = AUTO_SHELVES.find((s) => s.id === id);
  if (auto) return { ...auto, custom: false };
  const shelf = db.getShelf(id);
  return shelf ? { id: shelf.id, name: shelf.name, icon: "", covers: false, custom: true } : null;
}

// Livros de uma estante, já na ordem em que aparecem (o critério escolhido
// naquela estante; em "Personalizado", a arrumação dela).
export function shelfBooks(id) {
  const auto = AUTO_SHELVES.find((s) => s.id === id);
  if (auto) {
    const list = onShelf().filter(auto.filter);
    if (auto.order) return auto.order(list);
    return sortBooks(list, db.getShelfSort(id), db.getSettings().customOrder);
  }
  const shelf = db.getShelf(id);
  if (!shelf) return [];
  const byId = new Map(onShelf().map((b) => [b.id, b]));
  const list = shelf.bookIds.map((bid) => byId.get(bid)).filter(Boolean);
  return sortBooks(list, db.getShelfSort(id), shelf.bookIds); // arrumação = ordem da estante
}

// Pode escolher a ordem? (A "Lendo agora" e a lista de desejos têm ordem automática.)
export const canSort = (id) => id !== WISHLIST.id && !AUTO_SHELVES.find((s) => s.id === id)?.order;

// Estantes que aparecem na sala, na ordem: automáticas (as vazias somem,
// menos "Todos os livros") e depois as criadas por ela (sempre aparecem).
export function roomShelves() {
  const autos = AUTO_SHELVES.map((s) => ({ ...s, custom: false, books: shelfBooks(s.id) }))
    .filter((s) => s.always || s.books.length > 0);
  const customs = db.getShelves().map((s) => ({
    id: s.id, name: s.name, icon: "", covers: false, custom: true, books: shelfBooks(s.id),
  }));
  return [...autos, ...customs];
}

// Ids das estantes em que um livro aparece: as automáticas que combinam
// com ele (menos a "Lendo agora" quando não está em leitura etc.) e as
// estantes dela que o incluem.
export function shelvesContaining(book) {
  if (book.location !== "estante") return [];
  const autos = AUTO_SHELVES.filter((s) => s.filter(book)).map((s) => s.id);
  const customs = db.getShelves().filter((s) => s.bookIds.includes(book.id)).map((s) => s.id);
  return [...autos, ...customs];
}
