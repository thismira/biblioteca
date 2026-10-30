// Imagens de capa mais resistentes.
//
// O servidor de capas da Open Library às vezes recusa pedidos por alguns
// segundos. Aqui, se uma capa falhar, tentamos de novo sozinhos; enquanto
// isso não aparece o ícone de "imagem quebrada". Se desistirmos, `onFail`
// decide o que mostrar no lugar (ex.: a inicial do título).
//
// Todas as capas são pedidas no modo CORS (crossOrigin), o mesmo usado para
// ler a cor da lombada. Assim o navegador não reaproveita uma cópia sem
// permissão de leitura, que fazia a extração da cor falhar.

const RETRY_DELAYS = [1500, 4000];
// Imagem transparente de 1px: ocupa o lugar enquanto esperamos a nova tentativa.
const BLANK = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

export function setCoverImage(img, url, { onFail } = {}) {
  // Um "bilhete" por chamada: se a capa trocar no meio, tentativas antigas param.
  const ticket = Symbol();
  img._coverTicket = ticket;
  img.crossOrigin = "anonymous";
  let attempt = 0;

  img.onload = null;
  img.onerror = () => {
    if (img._coverTicket !== ticket) return;
    if (attempt >= RETRY_DELAYS.length) {
      img.onerror = null;
      img.src = BLANK;
      onFail?.();
      return;
    }
    const delay = RETRY_DELAYS[attempt++];
    img.src = BLANK; // esconde o ícone de imagem quebrada
    setTimeout(() => {
      if (img._coverTicket !== ticket) return;
      // Um parâmetro diferente evita que o navegador reaproveite a falha.
      img.src = `${url}${url.includes("?") ? "&" : "?"}tentativa=${attempt}`;
    }, delay);
  };
  img.src = url;
}
