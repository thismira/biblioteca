// Foto da lombada: ela escolhe/tira uma foto, ajusta um retângulo em volta
// da lombada e o site recorta e reduz a imagem (fica bem leve, ~15 KB).
// O arrastar usa pointer events: funciona com mouse e com o dedo.

const EDITOR_MAX = 1400;  // a foto é reduzida para no máximo 1400px no editor
const OUTPUT_HEIGHT = 360; // altura final da lombada guardada
const JPEG_QUALITY = 0.78;
const MIN_BOX = 16;        // tamanho mínimo do retângulo (px na tela)

// Abre o seletor de arquivo e depois o editor.
// Devolve { dataUrl, aspect } ou null se ela desistir.
export function pickSpinePhoto() {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.addEventListener("cancel", () => resolve(null));
    input.addEventListener("change", async () => {
      const file = input.files[0];
      resolve(file ? await openEditor(file) : null);
    });
    input.click();
  });
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Não consegui abrir essa imagem."));
    img.src = url;
  });
}

// Desenha a imagem num canvas reduzido (fotos de celular são enormes).
function toCanvas(img) {
  const scale = Math.min(1, EDITOR_MAX / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

// Gira um canvas 90° no sentido horário.
function rotate(source) {
  const canvas = document.createElement("canvas");
  canvas.width = source.height;
  canvas.height = source.width;
  const ctx = canvas.getContext("2d");
  ctx.translate(canvas.width, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(source, 0, 0);
  return canvas;
}

async function openEditor(file) {
  const url = URL.createObjectURL(file);
  let source;
  try {
    source = toCanvas(await loadImage(url));
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
  URL.revokeObjectURL(url);

  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "janela-recorte";
    dialog.innerHTML = `
      <div class="janela">
        <h2>Foto da lombada</h2>
        <p class="recorte-dica">Arraste o retângulo e puxe os cantos para cercar só a lombada.</p>
        <div class="recorte-palco">
          <div class="recorte-area">
            <div class="recorte-caixa">
              <span class="alca" data-canto="nw"></span><span class="alca" data-canto="ne"></span>
              <span class="alca" data-canto="sw"></span><span class="alca" data-canto="se"></span>
            </div>
          </div>
        </div>
        <div class="acoes">
          <button class="botao secundario" type="button" data-acao="girar">↻ Girar</button>
          <span class="espaco"></span>
          <button class="botao secundario" type="button" data-acao="cancelar">Cancelar</button>
          <button class="botao" type="button" data-acao="usar">Usar foto</button>
        </div>
      </div>`;
    document.body.appendChild(dialog);

    const area = dialog.querySelector(".recorte-area");
    const boxEl = dialog.querySelector(".recorte-caixa");
    let shown; // canvas exibido
    let box;   // { x, y, w, h } em px da tela, relativo à imagem exibida

    function showCanvas() {
      shown?.remove();
      shown = source;
      shown.className = "recorte-imagem";
      area.prepend(shown);
      // Ler clientWidth faz o navegador calcular o tamanho exibido na hora
      // (a janela já está aberta), então dá para posicionar o retângulo.
      const w = shown.clientWidth;
      const h = shown.clientHeight;
      const bh = h * 0.8;
      const bw = Math.min(w * 0.3, bh / 4);
      box = { x: (w - bw) / 2, y: (h - bh) / 2, w: bw, h: bh };
      drawBox();
    }

    function drawBox() {
      Object.assign(boxEl.style, {
        left: box.x + "px", top: box.y + "px", width: box.w + "px", height: box.h + "px",
      });
    }

    // Arrastar o retângulo (mover) ou um canto (redimensionar).
    let drag = null;
    boxEl.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      boxEl.setPointerCapture(event.pointerId);
      drag = { corner: event.target.dataset.canto || null, x: event.clientX, y: event.clientY, start: { ...box } };
    });
    boxEl.addEventListener("pointermove", (event) => {
      if (!drag) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      const W = shown.clientWidth;
      const H = shown.clientHeight;
      const s = drag.start;
      let { x, y, w, h } = s;
      if (!drag.corner) {
        x = Math.min(Math.max(s.x + dx, 0), W - s.w);
        y = Math.min(Math.max(s.y + dy, 0), H - s.h);
      } else {
        const c = drag.corner;
        if (c.includes("w")) { x = Math.min(Math.max(s.x + dx, 0), s.x + s.w - MIN_BOX); w = s.x + s.w - x; }
        if (c.includes("e")) { w = Math.min(Math.max(s.w + dx, MIN_BOX), W - s.x); }
        if (c.includes("n")) { y = Math.min(Math.max(s.y + dy, 0), s.y + s.h - MIN_BOX); h = s.y + s.h - y; }
        if (c.includes("s")) { h = Math.min(Math.max(s.h + dy, MIN_BOX), H - s.y); }
      }
      box = { x, y, w, h };
      drawBox();
    });
    const endDrag = () => (drag = null);
    boxEl.addEventListener("pointerup", endDrag);
    boxEl.addEventListener("pointercancel", endDrag);

    function finish(result) {
      dialog.close();
      dialog.remove();
      resolve(result);
    }

    dialog.querySelector('[data-acao="girar"]').addEventListener("click", () => {
      source = rotate(source);
      showCanvas();
    });
    dialog.querySelector('[data-acao="cancelar"]').addEventListener("click", () => finish(null));
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      finish(null);
    });
    dialog.querySelector('[data-acao="usar"]').addEventListener("click", () => finish(crop()));

    // Recorta a parte escolhida e reduz para OUTPUT_HEIGHT de altura.
    function crop() {
      const scale = source.width / shown.clientWidth;
      const sx = box.x * scale, sy = box.y * scale, sw = box.w * scale, sh = box.h * scale;
      let piece = document.createElement("canvas");
      piece.width = Math.round(sw);
      piece.height = Math.round(sh);
      piece.getContext("2d").drawImage(source, sx, sy, sw, sh, 0, 0, piece.width, piece.height);
      // Lombada fotografada deitada: gira para ficar em pé.
      if (piece.width > piece.height) piece = rotate(piece);

      const out = document.createElement("canvas");
      out.height = OUTPUT_HEIGHT;
      out.width = Math.max(8, Math.round(OUTPUT_HEIGHT * (piece.width / piece.height)));
      out.getContext("2d").drawImage(piece, 0, 0, out.width, out.height);
      return { dataUrl: out.toDataURL("image/jpeg", JPEG_QUALITY), aspect: out.width / out.height };
    }

    dialog.showModal();
    showCanvas();
  });
}
