// Transforma um link do Spotify no endereço do player embutido.
//
// Aceita links do app e do site, como:
//   https://open.spotify.com/playlist/37i9dQZF1DX...?si=abc
//   https://open.spotify.com/intl-pt/album/1A2B3C...
//   spotify:track:4uLU6hMCjMI75M1A2tKUQC

// Tipos aceitos e a altura do player para cada um.
const PLAYER_HEIGHT = { playlist: 352, album: 352, artist: 352, show: 232, track: 152, episode: 152 };
const TYPES = Object.keys(PLAYER_HEIGHT).join("|");

// Devolve { type, id, url, embedUrl, height } ou null se não for um link válido.
export function parseSpotify(input) {
  const text = String(input || "").trim();
  let match = text.match(new RegExp(`^spotify:(${TYPES}):([A-Za-z0-9]+)$`));
  if (!match) {
    try {
      const url = new URL(text);
      if (url.hostname === "open.spotify.com") {
        // "intl-pt/" e "embed/" podem aparecer antes do tipo.
        match = url.pathname.match(new RegExp(`^/(?:intl-[a-z-]+/)?(?:embed/)?(${TYPES})/([A-Za-z0-9]+)`, "i"));
      }
    } catch {
      // não é um endereço
    }
  }
  if (!match) return null;
  const type = match[1].toLowerCase();
  const id = match[2];
  return {
    type,
    id,
    url: `https://open.spotify.com/${type}/${id}`, // link "limpo", sem ?si=…
    embedUrl: `https://open.spotify.com/embed/${type}/${id}?utm_source=generator`,
    height: PLAYER_HEIGHT[type],
  };
}

// Links curtos (spotify.link/…) redirecionam no próprio Spotify e não dá para
// descobrir de dentro do site para onde eles levam.
export const isShortLink = (text) => /(^|\/\/)(spotify\.link|spoti\.fi)\//i.test(String(text).trim());
