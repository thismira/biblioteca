// Arrastar e soltar livros na estante (pointer events: mouse, toque e caneta).
//
// - Mouse: vira "arrastar" depois de mover alguns pixels (clique simples
//   continua abrindo o livro).
// - Toque: segurar por um instante "solta" o livro; mexer o dedo antes disso
//   é rolagem da página.
// - Uma cópia do livro segue o ponteiro; o livro original vira a "vaga" e os
//   outros deslizam para abrir espaço (também entre prateleiras).
// - Perto da borda da tela a página rola sozinha. Esc cancela.

const MOUSE_THRESHOLD = 6;  // px que o mouse precisa andar para virar arraste
const TOUCH_HOLD = 350;     // ms segurando o dedo para começar a arrastar
const TOUCH_SLOP = 10;      // px que o dedo pode tremer enquanto segura
const EDGE = 80;            // distância da borda que liga a rolagem automática
const MAX_SPEED = 16;       // px por quadro na rolagem automática
const SHIFT_MS = 200;       // duração dos livros abrindo espaço
const DROP_MS = 220;        // duração do encaixe ao soltar

// `container`: onde estão as prateleiras com as lombadas.
// `canDrag()`: pode arrastar agora?
// `onStart()`: chamado quando o arraste começa (ex.: mudar para Personalizado).
// `renderOrder(ids)`: redesenha a estante na ordem dada.
// `onDrop(id, prevId, nextId, changed)`: livro solto entre `prevId` e `nextId`.
// Para outras listas (ex.: capítulos do escritório): `item` e `row` são os
// seletores do item e da "prateleira" (row: null = a lista toda é uma fileira),
// `axis: "y"` para lista de cima para baixo, `ghostClass`/`slotClass` mudam o
// visual da cópia e da vaga.
export function enableDragAndDrop({
  container, canDrag, onStart, renderOrder, onDrop,
  item = ".lombada", row: rowSelector = ".prateleira", axis = "x",
  ghostClass = "lombada-fantasma", slotClass = "lombada-vaga",
}) {
  let press = null; // ponteiro apertado, ainda sem arrastar
  let drag = null;  // arraste em andamento
  let suppressClick = false;
  let scrollFrame = null;
  const shifting = new Set(); // animações dos livros abrindo espaço

  const spines = () => [...container.querySelectorAll(item)];
  const currentOrder = () => spines().map((el) => el.dataset.id);

  // ---------- Começar ----------

  container.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const el = event.target.closest(item);
    if (!el || !container.contains(el) || !canDrag()) return;
    press = { el, x: event.clientX, y: event.clientY, id: event.pointerId, type: event.pointerType };
    if (event.pointerType !== "mouse") {
      press.timer = setTimeout(() => press && begin(press.x, press.y), TOUCH_HOLD);
    }
  });

  function cancelPress() {
    if (press) clearTimeout(press.timer);
    press = null;
  }

  function begin(x, y) {
    const { el } = press;
    cancelPress();
    onStart?.(); // pode mudar para "Personalizado" (a ordem na tela não muda)
    const rect = el.getBoundingClientRect();
    const ghost = el.cloneNode(true);
    ghost.removeAttribute("data-id");
    ghost.classList.add(ghostClass);
    if (axis === "y") ghost.style.width = el.offsetWidth + "px"; // item de lista: mesma largura
    Object.assign(ghost.style, { left: rect.left + "px", top: rect.top + "px" });
    document.body.appendChild(ghost);
    ghost.animate([{ transform: "none" }, { transform: "rotate(-4deg) scale(1.06)" }], { duration: 150, fill: "forwards" });

    el.classList.add(slotClass);
    document.body.classList.add("arrastando-livro");
    navigator.vibrate?.(15); // um "tique" no celular

    const order = currentOrder();
    drag = { el, id: el.dataset.id, ghost, dx: x - rect.left, dy: y - rect.top, x, y, order, startOrder: order };
    cacheLayout();
    autoScroll();
  }

  // ---------- Mover ----------

  window.addEventListener("pointermove", (event) => {
    if (drag) {
      drag.x = event.clientX;
      drag.y = event.clientY;
      drag.ghost.style.left = drag.x - drag.dx + "px";
      drag.ghost.style.top = drag.y - drag.dy + "px";
      updateTarget();
      return;
    }
    if (!press || event.pointerId !== press.id) return;
    const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y);
    if (press.type === "mouse") {
      if (moved > MOUSE_THRESHOLD) begin(event.clientX, event.clientY);
    } else if (moved > TOUCH_SLOP) {
      cancelPress(); // o dedo andou antes de segurar: é rolagem
    }
  });

  // Enquanto arrasta com o dedo, a página não rola (o livro acompanha o dedo).
  document.addEventListener("touchmove", (event) => drag && event.preventDefault(), { passive: false });

  // Posições "finais" (sem as animações em andamento), em coordenadas da
  // página. Usá-las evita que os livros fiquem tremendo de um lado para o outro.
  function cacheLayout() {
    const sy = window.scrollY;
    const rect = (el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top + sy, bottom: r.bottom + sy, width: r.width };
    };
    shifting.forEach((a) => a.pause());
    const rows = rowSelector ? [...container.querySelectorAll(rowSelector)] : [container];
    drag.rows = rows.map((row) => ({
      ...rect(row),
      spines: [...row.querySelectorAll(item)].map((el) => {
        // posição sem o deslocamento da animação
        const r = rect(el);
        const t = new DOMMatrixReadOnly(getComputedStyle(el).transform);
        return { id: el.dataset.id, ...r, left: r.left - t.m41, right: r.right - t.m41, top: r.top - t.m42, bottom: r.bottom - t.m42 };
      }),
    }));
    shifting.forEach((a) => a.play());
  }

  function updateTarget() {
    const x = drag.x;
    const y = drag.y + window.scrollY;
    // Em cima da própria vaga: nada muda.
    const own = drag.rows.flatMap((r) => r.spines).find((s) => s.id === drag.id);
    if (own && x >= own.left && x <= own.right && y >= own.top && y <= own.bottom) return;

    // Prateleira mais perto do ponteiro (na vertical).
    let row = drag.rows[0];
    let best = Infinity;
    for (const r of drag.rows) {
      const d = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
      if (d < best) { best = d; row = r; }
    }
    const others = drag.order.filter((id) => id !== drag.id);
    const inRow = row.spines.filter((s) => s.id !== drag.id);
    // Antes do primeiro livro cujo meio fica à direita do ponteiro
    // (numa lista vertical: abaixo do ponteiro).
    const before = axis === "y"
      ? inRow.find((s) => y < (s.top + s.bottom) / 2)
      : inRow.find((s) => x < s.left + s.width / 2);
    let index;
    if (before) index = others.indexOf(before.id);
    else if (inRow.length) index = others.indexOf(inRow[inRow.length - 1].id) + 1;
    else {
      // Prateleira vazia: depois do último livro das prateleiras de cima.
      const above = drag.rows.filter((r) => r.top < row.top).flatMap((r) => r.spines).filter((s) => s.id !== drag.id);
      index = above.length ? others.indexOf(above[above.length - 1].id) + 1 : 0;
    }
    const order = [...others];
    order.splice(index, 0, drag.id);
    if (order.join() === drag.order.join()) return;
    drag.order = order;
    shift(() => renderOrder(order));
    cacheLayout();
  }

  // Os outros livros deslizam até o lugar novo (FLIP curto, sem "voo").
  function shift(change) {
    const first = new Map(spines().map((el) => [el.dataset.id, el.getBoundingClientRect()]));
    shifting.forEach((a) => a.cancel());
    shifting.clear();
    change();
    for (const el of spines()) {
      if (el === drag?.el) continue;
      const from = first.get(el.dataset.id);
      if (!from) continue;
      const to = el.getBoundingClientRect();
      const dx = from.left - to.left;
      const dy = from.top - to.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      const animation = el.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }],
        { duration: SHIFT_MS, easing: "cubic-bezier(.2,.8,.2,1)" }
      );
      shifting.add(animation);
      animation.finished.then(() => shifting.delete(animation)).catch(() => {});
    }
  }

  // Rolagem automática perto da borda de cima/baixo da tela.
  function autoScroll() {
    if (!drag) return;
    const { y } = drag;
    let speed = 0;
    if (y < EDGE) speed = -MAX_SPEED * (1 - y / EDGE);
    else if (y > window.innerHeight - EDGE) speed = MAX_SPEED * (1 - (window.innerHeight - y) / EDGE);
    if (speed) {
      window.scrollBy(0, speed);
      updateTarget();
    }
    scrollFrame = requestAnimationFrame(autoScroll);
  }

  // ---------- Soltar / cancelar ----------

  function landGhost() {
    const { el, ghost } = drag;
    cancelAnimationFrame(scrollFrame);
    const to = el.getBoundingClientRect();
    const animation = ghost.animate(
      [
        { left: ghost.style.left, top: ghost.style.top, transform: "rotate(-4deg) scale(1.06)" },
        { left: to.left + "px", top: to.top + "px", transform: "none" },
      ],
      { duration: DROP_MS, easing: "cubic-bezier(.3,1.3,.5,1)", fill: "forwards" }
    );
    const finish = () => {
      ghost.remove();
      el.classList.remove(slotClass);
    };
    animation.finished.then(finish, finish);
    setTimeout(finish, DROP_MS + 150); // garantia, se o navegador não terminar a animação
    document.body.classList.remove("arrastando-livro");
  }

  function drop() {
    const { id, order, startOrder } = drag;
    landGhost();
    drag = null;
    // O navegador dispara um "clique" depois de soltar: não abre o livro.
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 50);
    const i = order.indexOf(id);
    onDrop?.(id, order[i - 1] || null, order[i + 1] || null, order.join() !== startOrder.join());
  }

  function cancel() {
    const { startOrder } = drag;
    shift(() => renderOrder(startOrder));
    landGhost();
    drag = null;
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 50);
  }

  window.addEventListener("pointerup", () => (drag ? drop() : cancelPress()));
  window.addEventListener("pointercancel", () => (drag ? cancel() : cancelPress()));
  window.addEventListener("keydown", (event) => drag && event.key === "Escape" && cancel());
  container.addEventListener("click", (event) => {
    if (!suppressClick) return;
    event.stopPropagation();
    event.preventDefault();
  }, true);

  return { isDragging: () => Boolean(drag) };
}
