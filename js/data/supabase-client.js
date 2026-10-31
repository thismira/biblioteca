// Conexão com o Supabase (login e banco). A biblioteca supabase-js fica
// copiada no projeto (js/vendor/supabase.js, versão 2.118.0) e é carregada
// pelo index.html antes dos módulos; aqui só criamos o "cliente".

import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,     // continua conectada ao reabrir o site
    autoRefreshToken: true,
    detectSessionInUrl: true, // links de "esqueci minha senha"
  },
});

// Id da pessoa conectada (ou null).
export async function currentUserId() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id || null;
}
