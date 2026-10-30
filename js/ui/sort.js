// Critérios de ordenação da estante.

import { spineColor } from "./shelf.js";
import { hexToRgb, rgbToHsl } from "../utils/color.js";

export const SORT_OPTIONS = [
  ["personalizado", "Personalizado"],
  ["cor", "Cor (arco-íris)"],
  ["titulo", "Título"],
  ["autor", "Autor"],
  ["data", "Data de leitura"],
  ["categoria", "Categoria"],
];

const collator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });

// Artigos ignorados no começo do título ("O Hobbit" fica no H).
const ARTICLES = new Set(["o", "a", "os", "as", "um", "uma", "uns", "umas", "the", "an"]);
function titleKey(title) {
  const words = title.trim().split(/\s+/);
  return words.length > 1 && ARTICLES.has(words[0].toLowerCase()) ? words.slice(1).join(" ") : title;
}
const byTitle = (a, b) => collator.compare(titleKey(a.title), titleKey(b.title));

// Sobrenome = última palavra do nome ("J. K. Rowling" -> "Rowling").
const surname = (author) => author.trim().split(/\s+/).pop() || "";

// Posição de uma cor no arco-íris. Cores "de verdade" seguem a matiz em
// faixas de 15° (vermelho → laranja → amarelo → verde → azul → roxo → rosa)
// e, dentro de cada faixa, do mais claro ao mais escuro (efeito degradê).
// Branco, cinza, preto e cores muito apagadas vão para o fim, do claro ao escuro.
function rainbowKey(book) {
  const { h, s, l } = rgbToHsl(hexToRgb(spineColor(book)));
  if (s < 0.15 || l < 0.12 || l > 0.93) return [1, 0, -l];
  const hue = h >= 345 ? h - 360 : h; // vermelhos rosados voltam para o começo
  return [0, Math.floor((hue + 15) / 15), -l];
}
function compareKeys(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

// Data de leitura: terminados mais recentes primeiro, depois iniciados; sem data no fim.
const readDate = (book) => book.endDate || book.startDate || "";

const SORTERS = {
  titulo: (list) => list.sort(byTitle),
  autor: (list) =>
    list.sort((a, b) => {
      if (!a.author !== !b.author) return a.author ? -1 : 1; // sem autor no fim
      return collator.compare(surname(a.author), surname(b.author)) || byTitle(a, b);
    }),
  data: (list) =>
    list.sort((a, b) => {
      const da = readDate(a);
      const db = readDate(b);
      if (!da !== !db) return da ? -1 : 1;
      return db.localeCompare(da) || byTitle(a, b);
    }),
  categoria: (list) =>
    list.sort((a, b) => {
      const ca = a.categories[0] || "";
      const cb = b.categories[0] || "";
      if (!ca !== !cb) return ca ? -1 : 1; // sem categoria no fim
      return collator.compare(ca, cb) || byTitle(a, b);
    }),
  cor: (list) => {
    const keys = new Map(list.map((b) => [b.id, rainbowKey(b)])); // calcula uma vez por livro
    return list.sort((a, b) => compareKeys(keys.get(a.id), keys.get(b.id)) || byTitle(a, b));
  },
};

// Ordena uma cópia da lista. `customOrder` é a arrumação dela (ids), usada
// em "Personalizado"; livros fora da arrumação vão para o fim.
export function sortBooks(books, sortBy, customOrder = []) {
  const list = [...books];
  if (SORTERS[sortBy]) return SORTERS[sortBy](list);
  const pos = new Map(customOrder.map((id, i) => [id, i]));
  return list.sort((a, b) => (pos.get(a.id) ?? Infinity) - (pos.get(b.id) ?? Infinity));
}
