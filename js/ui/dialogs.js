// Janelinhas de confirmação e aviso, no visual do site
// (no lugar do confirm()/alert() cinzas do navegador).

function openDialog({ title, message, buttons }) {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "janela-confirmar";
    dialog.innerHTML = `
      <form class="janela" method="dialog">
        <h2></h2>
        <p class="confirmar-mensagem"></p>
        <div class="acoes"></div>
      </form>`;
    dialog.querySelector("h2").textContent = title;
    dialog.querySelector(".confirmar-mensagem").textContent = message;
    const actions = dialog.querySelector(".acoes");
    for (const { text, value, kind } of buttons) {
      const button = document.createElement("button");
      button.className = `botao ${kind || ""}`;
      button.value = value;
      button.textContent = text;
      actions.appendChild(button);
    }
    document.body.appendChild(dialog);
    dialog.addEventListener("close", () => {
      resolve(dialog.returnValue);
      dialog.remove();
    });
    dialog.showModal();
    // O foco começa no primeiro botão (o mais seguro, ex.: "Cancelar").
    actions.querySelector("button").focus();
  });
}

// Pergunta e devolve true só se ela confirmar. Esc ou "Cancelar" = false.
export async function confirmDialog({ title, message, confirmText = "Confirmar", cancelText = "Cancelar", danger = false }) {
  const answer = await openDialog({
    title,
    message,
    buttons: [
      { text: cancelText, value: "nao", kind: "secundario" },
      { text: confirmText, value: "sim", kind: danger ? "perigo" : "" },
    ],
  });
  return answer === "sim";
}

export async function alertDialog({ title, message, buttonText = "Entendi" }) {
  await openDialog({ title, message, buttons: [{ text: buttonText, value: "ok" }] });
}

// Pede um texto (ex.: nome de estante). Devolve o texto ou null se ela
// cancelar. `validate(texto)` pode devolver uma mensagem de erro.
export function promptDialog({ title, label, value = "", placeholder = "", confirmText = "Salvar", validate }) {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "janela-confirmar";
    dialog.innerHTML = `
      <form class="janela">
        <h2></h2>
        <div class="campo">
          <label for="pergunta-texto"></label>
          <input id="pergunta-texto" autocomplete="off" maxlength="60">
          <p class="pergunta-erro" aria-live="polite"></p>
        </div>
        <div class="acoes">
          <button class="botao secundario" type="button" data-acao="cancelar">Cancelar</button>
          <button class="botao" type="submit"></button>
        </div>
      </form>`;
    dialog.querySelector("h2").textContent = title;
    dialog.querySelector("label").textContent = label;
    dialog.querySelector('button[type="submit"]').textContent = confirmText;
    const input = dialog.querySelector("input");
    const error = dialog.querySelector(".pergunta-erro");
    input.value = value;
    input.placeholder = placeholder;
    document.body.appendChild(dialog);

    let answer = null;
    dialog.querySelector("form").addEventListener("submit", (event) => {
      event.preventDefault();
      const text = input.value.trim();
      const problem = !text ? "Escreva um nome." : validate?.(text);
      if (problem) {
        error.textContent = problem;
        input.focus();
        return;
      }
      answer = text;
      dialog.close();
    });
    dialog.querySelector('[data-acao="cancelar"]').addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => {
      resolve(answer);
      dialog.remove();
    });
    dialog.showModal();
    input.focus();
    input.select();
  });
}

// Pergunta com várias respostas (botões). Devolve o `value` escolhido ou
// null se ela fechar com Esc.
export async function chooseDialog({ title, message, options }) {
  const answer = await openDialog({
    title,
    message,
    buttons: options.map(({ text, value }, i) => ({ text, value, kind: i === 0 ? "" : "secundario" })),
  });
  return options.some((o) => o.value === answer) ? answer : null;
}
