// Critérios de ordenação da estante.
// (Etapa 7 acrescenta cor, título, autor, data e categoria.)

export function sortBooks(books, settings) {
  return byCustomOrder(books, settings.customOrder);
}

// Ordem arrumada pela leitora; livros fora da lista vão para o fim.
function byCustomOrder(books, order) {
  const pos = new Map(order.map((id, i) => [id, i]));
  return [...books].sort(
    (a, b) => (pos.get(a.id) ?? Infinity) - (pos.get(b.id) ?? Infinity)
  );
}
