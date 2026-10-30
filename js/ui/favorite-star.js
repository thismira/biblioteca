// Estrela de favorito: botão que "estoura" com faíscas ao ser marcado,
// e uma estrelinha que voa até a prateleira de favoritos.
// Usada no cadastro e (na etapa 4) na página do livro.

const STAR_PATH =
  "M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z";

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function createStar({ active = false, onToggle } = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "estrela";
  button.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR_PATH}"/></svg>
    ${Array.from({ length: 8 }, (_, i) => `<span class="faisca" style="--a:${i * 45}deg"></span>`).join("")}`;

  function set(value) {
    active = value;
    button.classList.toggle("ativa", active);
    button.setAttribute("aria-pressed", String(active));
    button.setAttribute("aria-label", active ? "Tirar dos favoritos" : "Marcar como favorito");
    button.title = button.getAttribute("aria-label");
  }

  button.addEventListener("click", () => {
    set(!active);
    if (active) {
      // Reinicia a animação mesmo se ela clicar várias vezes seguidas.
      button.classList.remove("estourando");
      void button.offsetWidth;
      button.classList.add("estourando");
    }
    onToggle?.(active);
  });

  set(active);
  return { element: button, isActive: () => active, set };
}

// Uma estrelinha sai de `fromRect` e voa em curva até o elemento `target`,
// que dá um brilho ao recebê-la.
export function flyStar(fromRect, target) {
  const to = target.getBoundingClientRect();
  const star = document.createElement("div");
  star.className = "estrela-voando";
  star.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR_PATH}"/></svg>`;
  document.body.appendChild(star);

  const startX = fromRect.left + fromRect.width / 2 - 14;
  const startY = fromRect.top + fromRect.height / 2 - 14;
  const dx = to.left + to.width / 2 - 14 - startX;
  const dy = to.top + 24 - 14 - startY;
  star.style.left = startX + "px";
  star.style.top = startY + "px";

  const finish = () => {
    star.remove();
    target.classList.remove("recebeu-estrela");
    void target.offsetWidth;
    target.classList.add("recebeu-estrela");
  };

  if (reducedMotion()) return finish();

  // Curva: sobe um pouco antes de descer até o livro.
  const lift = Math.min(-80, dy * 0.3 - 60);
  star
    .animate(
      [
        { transform: "translate(0, 0) scale(1.4) rotate(0deg)", opacity: 1 },
        { transform: `translate(${dx * 0.5}px, ${dy * 0.5 + lift}px) scale(1.1) rotate(200deg)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.5) rotate(360deg)`, opacity: 0.9 },
      ],
      { duration: 900, easing: "cubic-bezier(.45,.05,.35,1)" }
    )
    .finished.then(finish);
}
