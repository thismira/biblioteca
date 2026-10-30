// Foto da lombada: ela escolhe/tira uma foto, ajusta um retângulo em volta
// da lombada e o site recorta e reduz a imagem (fica bem leve, ~15 KB).

import { pickAndCrop, rotate } from "./photo-crop.js";

const OUTPUT_HEIGHT = 360; // altura final da lombada guardada
const JPEG_QUALITY = 0.78;

// Devolve { dataUrl, aspect } ou null se ela desistir.
export async function pickSpinePhoto() {
  let piece = await pickAndCrop({
    title: "Foto da lombada",
    hint: "Arraste o retângulo e puxe os cantos para cercar só a lombada.",
    box: "lombada",
  });
  if (!piece) return null;
  // Lombada fotografada deitada: gira para ficar em pé.
  if (piece.width > piece.height) piece = rotate(piece);

  const out = document.createElement("canvas");
  out.height = OUTPUT_HEIGHT;
  out.width = Math.max(8, Math.round(OUTPUT_HEIGHT * (piece.width / piece.height)));
  out.getContext("2d").drawImage(piece, 0, 0, out.width, out.height);
  return { dataUrl: out.toDataURL("image/jpeg", JPEG_QUALITY), aspect: out.width / out.height };
}
