// Extrai a cor da lombada a partir da capa.
//
// Lemos só uma faixa fina da borda ESQUERDA da capa (a parte mais perto da
// lombada do livro físico) e escolhemos a cor que mais aparece ali.
// Não usamos a média: ela mistura as cores e dá um tom "lamacento".

import { rgbToHex } from "../utils/color.js";

// Versão da regra de extração. Ao melhorar a regra, aumente o número:
// as cores já calculadas com a versão antiga são refeitas sozinhas.
export const SPINE_COLOR_VERSION = 3;

const SAMPLE_WIDTH = 100;   // a capa é reduzida para 100px de largura
const STRIP_START = 0.02;   // pula a beiradinha (bordas brancas de scanner)
const STRIP_END = 0.08;     // até 8% da largura
const MARGIN_Y = 0.05;      // ignora 5% do topo e da base
const LEVELS = 16;          // "baldes" por canal de cor (16×16×16 = 4096)
const BACKDROP_TOLERANCE = 40;  // quão perto do fundo uma cor precisa estar
const EDGE_SEARCH = 0.35;       // procura a borda do livro nos primeiros 35%
const EDGE_FILL = 0.6;          // coluna com 60%+ de "livro" = borda do livro

function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

// Se os quatro cantos têm a mesma cor CLARA e sem cor (branco/cinza claro,
// típico de foto de produto), pode ser fundo de foto: devolve essa cor.
// Cantos escuros não contam: capas pretas são comuns (ex.: The Night Circus).
function detectBackdrop(at, width, height) {
  const corners = [at(1, 1), at(width - 2, 1), at(1, height - 2), at(width - 2, height - 2)];
  const same = corners.every((c) => distance(c, corners[0]) < BACKDROP_TOLERANCE);
  const [r, g, b] = corners[0];
  const light = Math.min(r, g, b) > 200 && Math.max(r, g, b) - Math.min(r, g, b) < 25;
  return same && light ? [r, g, b] : null;
}

// Primeira coluna (da esquerda) em que a maior parte dos pixels NÃO é fundo:
// é a borda vertical do livro na foto. Capas de verdade com borda clara não
// têm essa borda forte, então continuam começando do zero.
function findBookEdge(at, width, height, backdrop) {
  const yA = Math.floor(height * 0.1);
  const yB = Math.ceil(height * 0.9);
  for (let x = 0; x < width * EDGE_SEARCH; x++) {
    let book = 0;
    for (let y = yA; y < yB; y++) {
      if (distance(at(x, y), backdrop) >= BACKDROP_TOLERANCE) book++;
    }
    if (book / (yB - yA) >= EDGE_FILL) return x;
  }
  return 0;
}

const LOAD_TIMEOUT = 15000; // capa que demora mais que isso conta como falha

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous"; // pede permissão para ler os pixels
    const timer = setTimeout(() => reject(new Error("capa demorou demais")), LOAD_TIMEOUT);
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); reject(new Error("capa não carregou")); };
    img.src = url;
  });
}

// Devolve a cor (ex.: "#7a3b52") ou null se não for possível ler a capa.
export async function extractSpineColor(url) {
  if (!url) return null;
  try {
    const img = await loadImage(url);
    if (img.naturalWidth < 10) return null; // imagem vazia/placeholder

    const width = SAMPLE_WIDTH;
    const height = Math.round((img.naturalHeight / img.naturalWidth) * width);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, width, height);

    // getImageData falha se o servidor não permitir ler a imagem (CORS).
    const { data: pixels } = ctx.getImageData(0, 0, width, height);
    const at = (x, y) => {
      const i = (y * width + x) * 4;
      return [pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]];
    };

    // Algumas "capas" são fotos do livro sobre um fundo liso. Nesse caso
    // a faixa esquerda é o fundo, não o livro: achamos onde o livro começa.
    const backdrop = detectBackdrop(at, width, height);
    const start = backdrop ? findBookEdge(at, width, height, backdrop) : 0;
    const usingBackdrop = start > 0;

    const bookWidth = width - start;
    const x0 = start + Math.floor(bookWidth * STRIP_START);
    const x1 = Math.max(x0 + 1, start + Math.ceil(bookWidth * STRIP_END));
    const y0 = Math.floor(height * MARGIN_Y);
    const y1 = Math.ceil(height * (1 - MARGIN_Y));

    // Conta quantos pixels caem em cada "balde" de cor parecida,
    // somando as cores reais para tirar a média só dentro do balde vencedor.
    const buckets = new Map();
    const step = 256 / LEVELS;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const [r, g, b, a] = at(x, y);
      if (a < 128) continue; // pixel transparente
      if (usingBackdrop && distance([r, g, b], backdrop) < BACKDROP_TOLERANCE) continue;
      const key = ((r / step) | 0) * LEVELS * LEVELS + ((g / step) | 0) * LEVELS + ((b / step) | 0);
      const bucket = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
      bucket.n++; bucket.r += r; bucket.g += g; bucket.b += b;
      buckets.set(key, bucket);
    }

    let best = null;
    for (const bucket of buckets.values()) if (!best || bucket.n > best.n) best = bucket;
    if (!best) return null;
    return rgbToHex({ r: best.r / best.n, g: best.g / best.n, b: best.b / best.n });
  } catch (err) {
    console.warn("Não consegui extrair a cor da capa:", url, err.message);
    return null;
  }
}

// Fila: extrai uma capa por vez, para não carregar dezenas de imagens juntas.
// O servidor de capas às vezes falha por alguns segundos: se não der certo,
// a capa volta para a fila mais tarde (sem travar as outras), tentando
// também a versão média da capa, que fica em outro endereço.
const RETRY_DELAYS = [3000, 8000]; // espera antes da 2ª e da 3ª tentativa
const queue = [];
const tried = new Set(); // capas que já entraram na fila nesta sessão
let running = false;

// Na 2ª tentativa usa a capa média (-M) em vez da grande (-L).
const variant = (url, attempt) => (attempt === 1 ? url.replace("-L.jpg", "-M.jpg") : url);

// `onColor(color)` é chamada quando a cor fica pronta.
export function queueSpineColor(url, onColor) {
  if (!url || tried.has(url)) return;
  tried.add(url);
  enqueue({ url, onColor, attempt: 0 });
}

function enqueue(job) {
  queue.push(job);
  if (!running) runQueue();
}

async function runQueue() {
  running = true;
  while (queue.length) {
    const job = queue.shift();
    const color = await extractSpineColor(variant(job.url, job.attempt));
    if (color) await job.onColor(color);
    else if (job.attempt < RETRY_DELAYS.length) {
      setTimeout(() => enqueue({ ...job, attempt: job.attempt + 1 }), RETRY_DELAYS[job.attempt]);
    }
  }
  running = false;
}
