// Seletor de categorias em "etiquetas" (chips).
// Escolhidas aparecem com ×, sugestões com +, e um campo cria novas.
// Usado no cadastro e (na etapa 4) na página do livro.

// Primeira letra maiúscula, espaços arrumados: "  ficção  " -> "Ficção".
function normalize(name) {
  const clean = name.trim().replace(/\s+/g, " ");
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

export function createCategoryPicker(container, { selected = [], suggestions = [], known = [], onChange } = {}) {
  let chosen = [...new Set(selected)];

  container.classList.add("categorias");
  container.innerHTML = `
    <div class="chips chips-escolhidas" aria-label="Categorias escolhidas"></div>
    <div class="chips chips-sugeridas" aria-label="Sugestões"></div>
    <input type="text" class="categoria-nova" placeholder="Criar categoria e apertar Enter" autocomplete="off">`;

  const chosenEl = container.querySelector(".chips-escolhidas");
  const suggestedEl = container.querySelector(".chips-sugeridas");
  const input = container.querySelector(".categoria-nova");

  function chip(name, kind) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `chip ${kind}`;
    b.textContent = kind === "escolhida" ? `${name} ×` : `+ ${name}`;
    b.setAttribute("aria-label", kind === "escolhida" ? `Remover ${name}` : `Adicionar ${name}`);
    b.addEventListener("click", () => (kind === "escolhida" ? remove(name) : add(name)));
    return b;
  }

  function render() {
    chosenEl.replaceChildren(...chosen.map((n) => chip(n, "escolhida")));
    if (!chosen.length) chosenEl.innerHTML = `<span class="chips-vazio">Nenhuma categoria ainda</span>`;
    // Sugestões da Open Library primeiro, depois as que ela já criou.
    const options = [...new Set([...suggestions, ...known])].filter((n) => !chosen.includes(n));
    suggestedEl.replaceChildren(...options.map((n) => chip(n, "sugerida")));
    suggestedEl.hidden = options.length === 0;
  }

  function add(name) {
    const n = normalize(name);
    if (!n || chosen.some((c) => c.toLowerCase() === n.toLowerCase())) return;
    chosen = [...chosen, n];
    render();
    onChange?.(chosen);
  }

  function remove(name) {
    chosen = chosen.filter((c) => c !== name);
    render();
    onChange?.(chosen);
  }

  input.addEventListener("keydown", (event) => {
    // Enter cria a categoria (e não envia o formulário).
    if (event.key === "Enter") {
      event.preventDefault();
      add(input.value);
      input.value = "";
    }
  });

  render();

  return {
    // Se ela digitou uma categoria e esqueceu do Enter, ela entra também.
    getSelected() {
      if (input.value.trim()) {
        add(input.value);
        input.value = "";
      }
      return [...chosen];
    },
  };
}
