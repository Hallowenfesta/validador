/**
 * Configuração do site.
 *
 * URL da implantação do Apps Script (Implantar > Gerenciar implantações).
 * Ao publicar uma versão nova do script, use "Editar > Nova versão" na
 * implantação existente: assim a URL continua a mesma e nada aqui muda.
 * Se criar uma implantação nova, troque aqui e em CONFIG.URL_WEBHOOK (Config.gs).
 */
export const URL_API =
  'https://script.google.com/macros/s/AKfycbykpwLaURk9hTQWJICUr8mzPoRqqQh-us9pHFfhT60sfO7PjqJzot3FuV8xnN3bED0/exec';

/** Quanto tempo esperar o Apps Script antes de desistir. Ele costuma levar de 1 a 5 s. */
export const TIMEOUT_MS = 30000;
