// Login (Supabase Auth): e-mail e senha. A sessão fica guardada no
// aparelho, então ela só precisa entrar uma vez. Também cuida de
// "Esqueci minha senha", "Trocar senha" e "Sair".
//
// Não existe cadastro pelo site: a conta é criada no painel do Supabase
// (e o cadastro público fica desligado lá).

import { supabase } from "../data/supabase-client.js";
import { promptDialog, alertDialog } from "./dialogs.js";

const MIN_PASSWORD = 8;

// Endereço para onde o link do e-mail de "esqueci minha senha" volta.
const siteUrl = () => location.origin + location.pathname;

// Mensagens do Supabase em português.
function friendly(error) {
  const msg = error?.message || "";
  if (/invalid login credentials/i.test(msg)) return "E-mail ou senha incorretos.";
  if (/email not confirmed/i.test(msg)) return "Esse e-mail ainda não foi confirmado.";
  if (/rate limit|too many/i.test(msg)) return "Muitas tentativas seguidas. Espere um minutinho e tente de novo.";
  if (/fetch|network/i.test(msg)) return "Sem conexão com a internet.";
  if (/should be different/i.test(msg)) return "A senha nova precisa ser diferente da atual.";
  if (/at least|password should/i.test(msg)) return `A senha precisa ter pelo menos ${MIN_PASSWORD} caracteres.`;
  return "Não deu certo. Tente de novo em instantes.";
}

// Espera ter alguém conectado. Se não houver sessão, mostra a tela de login.
export async function ensureLogin() {
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session.user;
  return showLoginScreen();
}

export async function currentUser() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user || null;
}

function showLoginScreen() {
  return new Promise((resolve) => {
    document.body.classList.add("sem-login");
    const screen = document.createElement("section");
    screen.className = "tela-login";
    screen.innerHTML = `
      <form class="login-cartao">
        <h1>M’s Library</h1>
        <p class="login-sub">Entre para abrir a sua biblioteca.</p>
        <div class="campo">
          <label for="login-email">E-mail</label>
          <input id="login-email" name="email" type="email" autocomplete="email" required>
        </div>
        <div class="campo">
          <label for="login-senha">Senha</label>
          <input id="login-senha" name="senha" type="password" autocomplete="current-password" required>
        </div>
        <p class="login-erro" role="alert"></p>
        <button class="botao" type="submit">Entrar</button>
        <button class="link" type="button" data-acao="esqueci">Esqueci minha senha</button>
      </form>`;
    document.body.appendChild(screen);
    const form = screen.querySelector("form");
    const error = screen.querySelector(".login-erro");
    const submit = form.querySelector('button[type="submit"]');
    form.elements.email.focus();

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      error.textContent = "";
      submit.disabled = true;
      submit.textContent = "Entrando…";
      const { data, error: err } = await supabase.auth.signInWithPassword({
        email: form.elements.email.value.trim(),
        password: form.elements.senha.value,
      });
      submit.disabled = false;
      submit.textContent = "Entrar";
      if (err) {
        error.textContent = friendly(err);
        return;
      }
      screen.remove();
      document.body.classList.remove("sem-login");
      resolve(data.user);
    });

    screen.querySelector('[data-acao="esqueci"]').addEventListener("click", async () => {
      const email = form.elements.email.value.trim();
      if (!email) {
        error.textContent = "Escreva o seu e-mail acima e clique de novo em \"Esqueci minha senha\".";
        form.elements.email.focus();
        return;
      }
      const { error: err } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: siteUrl() });
      if (err) {
        error.textContent = friendly(err);
        return;
      }
      alertDialog({
        title: "Confira seu e-mail",
        message: `Se ${email} tiver uma conta, chega em instantes um link para criar uma senha nova. Abra o link neste aparelho.`,
      });
    });
  });
}

// Pede a senha nova (usado por "Trocar senha" e pelo link do e-mail).
export async function changePassword({ title = "Trocar senha" } = {}) {
  const password = await promptDialog({
    title,
    label: `Senha nova (pelo menos ${MIN_PASSWORD} caracteres)`,
    confirmText: "Salvar senha",
    validate: (value) => (value.length < MIN_PASSWORD ? `Use pelo menos ${MIN_PASSWORD} caracteres.` : ""),
    type: "password",
  });
  if (password == null) return false;
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    await alertDialog({ title: "Não deu certo", message: friendly(error) });
    return false;
  }
  await alertDialog({ title: "Senha trocada", message: "Pronto! Da próxima vez, entre com a senha nova." });
  return true;
}

export async function signOut() {
  await supabase.auth.signOut();
  location.reload(); // volta para a tela de login
}

// Chegou pelo link de "esqueci minha senha": pede a senha nova.
supabase.auth.onAuthStateChange((event) => {
  if (event === "PASSWORD_RECOVERY") {
    setTimeout(() => changePassword({ title: "Crie uma senha nova" }), 300);
  }
});
