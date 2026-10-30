// Editor de recorte de foto: ela escolhe/tira uma foto e ajusta um
// retângulo em volta da parte que interessa (uma lombada, um trecho).
// O arrastar usa pointer events: funciona com mouse e com o dedo.
// Usado pela foto da lombada (spine-photo.js) e pela foto de trecho (quotes.js).

const MIN_BOX = 16; // tamanho mínimo do retângulo (px na tela)

// Formatos iniciais do retângulo: estreito e alto para lombada,
// largo para um trecho de texto.
const START_BOX = {
  lombada: (w, h) => {
    const bh = h * 0.8;
    const bw = Math.min(w * 0.3, bh / 4);
    return { x: (w - bw) / 2, y: (h - bh) / 2, w: bw, h: bh };
  },
  trecho: (w, h) => ({ x: w * 0.08, y: h * 0.25, w: w * 0.84, h: h * 0.5 }),
};

// Abre o seletor de arquivo e depois o editor. Devolve um <canvas> com a
// parte recortada (na resolução do editor) ou null se ela desistir.
export function pickAndCrop({ title, hint, box = "lombada", maxSize = 1400 }) {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.addEventListener("cancel", () => resolve(null));
    input.addEventListener("change", async () => {
      const file = input.files[0];
      resolve(file ? await openEditor(file, { title, hint, box, maxSize }) : null);
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
function toCanvas(img, maxSize) {
  const scale = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

// Gira um canvas 90° no sentido horário.
export function rotate(source) {
  const canvas = document.createElement("canvas");
  canvas.width = source.height;
  canvas.height = source.width;
  const ctx = canvas.getContext("2d");
  ctx.translate(canvas.width, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(source, 0, 0);
  return canvas;
}

async function openEditor(file, { title, hint, box: startShape, maxSize }) {
  const url = URL.createObjectURL(file);
  let source;
  try {
    source = toCanvas(await loadImage(url), maxSize);
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }

  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "janela-recorte";
    dialog.innerHTML = `
      <div class="janela">
        <h2></h2>
        <p class="recorte-dica"></p>
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
    dialog.querySelector("h2").textContent = title;
    dialog.querySelector(".recorte-dica").textContent = hint;
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
      box = START_BOX[startShape](shown.clientWidth, shown.clientHeight);
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

    // Recorta a parte escolhida, na resolução do editor.
    function crop() {
      const scale = source.width / shown.clientWidth;
      const piece = document.createElement("canvas");
      piece.width = Math.max(1, Math.round(box.w * scale));
      piece.height = Math.max(1, Math.round(box.h * scale));
      piece.getContext("2d").drawImage(
        source, box.x * scale, box.y * scale, box.w * scale, box.h * scale, 0, 0, piece.width, piece.height
      );
      return piece;
    }

    dialog.showModal();
    showCanvas();
  });
}
