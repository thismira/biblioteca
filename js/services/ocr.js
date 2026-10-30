// Lê o texto de uma foto (reconhecimento de texto, ou "OCR").
//
// Usa o Tesseract.js, que roda no próprio navegador: a foto não sai do
// aparelho e não precisa de conta nem chave. Ele só é baixado na primeira
// vez que ela usa (o script e o "dicionário" de português e inglês, ~10 MB);
// depois o navegador guarda e fica mais rápido.

const TESSERACT_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js";
const LANGUAGES = ["por", "eng"];
const MIN_WIDTH = 1600; // recortes pequenos são ampliados até esta largura

// Mensagens em português para cada passo do Tesseract.
const STEPS = {
  "loading tesseract core": "Preparando o leitor de texto…",
  "initializing tesseract": "Preparando o leitor de texto…",
  "loading language traineddata": "Baixando o dicionário de português e inglês (só na primeira vez)…",
  "initializing api": "Quase pronto…",
  "recognizing text": "Lendo o trecho…",
};

let scriptPromise = null;
let workerPromise = null;
let reportProgress = null; // quem está esperando a leitura atual

function loadScript() {
  if (window.Tesseract) return Promise.resolve();
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TESSERACT_URL;
    script.onload = resolve;
    script.onerror = () => {
      scriptPromise = null; // deixa tentar de novo depois
      reject(new Error("Não consegui baixar o leitor de texto. Verifique a internet."));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

async function getWorker() {
  await loadScript();
  workerPromise ??= window.Tesseract.createWorker(LANGUAGES, 1, {
    logger: (m) => reportProgress?.(STEPS[m.status] || "Preparando…", m.progress),
  }).then(async (worker) => {
    // O recorte é um bloco único de texto (modo 6 do Tesseract).
    await worker.setParameters({ tessedit_pageseg_mode: "6" });
    return worker;
  }).catch((err) => {
    workerPromise = null;
    throw err;
  });
  return workerPromise;
}

// Prepara a foto para a leitura (fotos de celular têm sombra e granulado):
// 1. amplia recortes pequenos e passa para tons de cinza;
// 2. suaviza o granulado (desfoque leve de 3×3 pixels);
// 3. iguala a iluminação: estima o "papel" de cada região com uma versão
//    bem desfocada da foto e divide por ela (a sombra some);
// 4. estica o contraste usando os 1% mais escuros e mais claros
//    (ignora pixels extremos de ruído).
function prepare(canvas) {
  const scale = Math.min(3, Math.max(1, MIN_WIDTH / canvas.width));
  const w = Math.round(canvas.width * scale);
  const h = Math.round(canvas.height * scale);
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(canvas, 0, 0, w, h);
  const image = ctx.getImageData(0, 0, w, h);
  const px = image.data;

  // 1. tons de cinza
  const gray = new Float32Array(w * h);
  for (let i = 0, j = 0; j < gray.length; i += 4, j++) {
    gray[j] = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
  }

  // 2. desfoque leve (média dos 9 vizinhos)
  const smooth = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          sum += gray[yy * w + xx];
          n++;
        }
      }
      smooth[y * w + x] = sum / n;
    }
  }

  // 3. "papel" de cada região: reduz bastante e amplia de volta
  const small = document.createElement("canvas");
  small.width = Math.max(1, Math.round(w / 32));
  small.height = Math.max(1, Math.round(h / 32));
  const sctx = small.getContext("2d");
  sctx.imageSmoothingQuality = "high";
  sctx.drawImage(out, 0, 0, small.width, small.height);
  const bgCanvas = document.createElement("canvas");
  bgCanvas.width = w;
  bgCanvas.height = h;
  const bctx = bgCanvas.getContext("2d", { willReadFrequently: true });
  bctx.imageSmoothingQuality = "high";
  bctx.drawImage(small, 0, 0, w, h);
  const bg = bctx.getImageData(0, 0, w, h).data;

  const flat = new Float32Array(w * h);
  const histogram = new Uint32Array(256);
  for (let i = 0, j = 0; j < flat.length; i += 4, j++) {
    const paper = Math.max(1, 0.299 * bg[i] + 0.587 * bg[i + 1] + 0.114 * bg[i + 2]);
    const v = Math.min(255, (smooth[j] / paper) * 230);
    flat[j] = v;
    histogram[v | 0]++;
  }

  // 4. contraste pelos percentis 1% e 99%
  const percentile = (p) => {
    let count = 0;
    const target = flat.length * p;
    for (let v = 0; v < 256; v++) {
      count += histogram[v];
      if (count >= target) return v;
    }
    return 255;
  };
  const low = percentile(0.01);
  const high = Math.max(low + 1, percentile(0.99));
  for (let i = 0, j = 0; j < flat.length; i += 4, j++) {
    const v = Math.min(255, Math.max(0, ((flat[j] - low) / (high - low)) * 255));
    px[i] = px[i + 1] = px[i + 2] = v;
  }
  ctx.putImageData(image, 0, 0);
  return out;
}

// Numa página, as linhas quebram por causa da largura do papel. Juntamos
// as linhas de um mesmo parágrafo e as palavras partidas com hífen;
// parágrafos separados (linha em branco) continuam separados.
export function cleanText(raw) {
  return raw
    .replace(/\r/g, "")
    .replace(/(\p{L})-\n(?=\p{Ll})/gu, "$1") // pala-\nvra -> palavra
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, " ").replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");
}

// Lê o texto de um <canvas>. `onProgress(mensagem, 0..1)` mostra o andamento.
// Devolve { text, confidence }: `confidence` (0–100) é o quanto o leitor
// confia no que leu; fotos muito ruins dão confiança baixa.
export async function recognizeText(canvas, { onProgress } = {}) {
  reportProgress = onProgress;
  try {
    onProgress?.("Preparando o leitor de texto…", 0);
    const worker = await getWorker();
    const { data } = await worker.recognize(prepare(canvas));
    return { text: cleanText(data.text || ""), confidence: data.confidence ?? 0 };
  } finally {
    reportProgress = null;
  }
}
