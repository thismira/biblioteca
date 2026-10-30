// Animação FLIP para reorganizar a estante (First, Last, Invert, Play):
//   1. First:  anota onde cada livro está;
//   2. Last:   muda a ordem de verdade (instantâneo, invisível);
//   3. Invert: "empurra" cada livro de volta, só na aparência, para onde estava;
//   4. Play:   o livro sai um pouco da estante, flutua até o lugar novo e se
//              encaixa — em onda, com o total em ~1 segundo.
//
// Para não pesar: só anima `transform`, mede tudo de uma vez antes de mexer
// e livros fora da tela trocam de lugar sem animação.

import { reducedMotion } from "./fly-book.js";

const TOTAL = 1000;   // duração total da reorganização (ms)
const PER_BOOK = 620; // duração do voo de cada livro (ms)
const LIFT = 18;      // quanto o livro "sai" da estante (px)
const MARGIN = 120;   // folga além da tela para ainda animar (px)

const running = new Set(); // animações em andamento (para interromper)

const onScreen = (r) => r.bottom > -MARGIN && r.top < window.innerHeight + MARGIN;

// `elements`: Map id -> elemento (as lombadas, reaproveitadas entre desenhos).
// `change`: função (pode ser async) que muda a ordem e redesenha a estante.
export async function flipReorder(elements, change) {
  if (reducedMotion()) return change();

  // 1. First — inclui livros no meio de uma animação anterior: assim, se ela
  //    trocar de ordem de novo, eles partem de onde estão agora (sem pulos).
  const first = new Map();
  for (const [id, el] of elements) first.set(id, el.getBoundingClientRect());
  running.forEach((animation) => animation.cancel());
  running.clear();

  // 2. Last
  await change();
  const moves = [];
  for (const [id, el] of elements) {
    const from = first.get(id);
    if (!from) continue; // livro que acabou de aparecer
    const to = el.getBoundingClientRect();
    const dx = from.left - to.left;
    const dy = from.top - to.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue; // não mudou de lugar
    if (!onScreen(from) && !onScreen(to)) continue;     // fora da tela: só troca
    moves.push({ el, dx, dy, to });
  }

  // 3 e 4. Invert + Play, em onda: da esquerda para a direita, de cima para baixo.
  moves.sort((a, b) => a.to.top - b.to.top || a.to.left - b.to.left);
  const step = moves.length > 1 ? (TOTAL - PER_BOOK) / (moves.length - 1) : 0;
  moves.forEach(({ el, dx, dy }, i) => {
    const animation = el.animate(
      [
        { transform: `translate(${dx}px, ${dy}px)`, easing: "ease-out" },
        { transform: `translate(${dx}px, ${dy - LIFT}px)`, offset: 0.18, easing: "ease-in-out" }, // sai da estante
        { transform: `translate(0px, ${-LIFT}px)`, offset: 0.8, easing: "cubic-bezier(.3,1.5,.5,1)" }, // flutua
        { transform: "translate(0px, 0px)" }, // encaixa
      ],
      { duration: PER_BOOK, delay: i * step, fill: "backwards" }
    );
    running.add(animation);
    animation.finished.then(() => running.delete(animation)).catch(() => {});
  });
}
