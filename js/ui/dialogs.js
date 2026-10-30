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
