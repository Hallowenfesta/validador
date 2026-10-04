/**
 * Ícones em SVG no traço dos SF Symbols (linha de 2px, pontas arredondadas).
 *
 * São strings fixas, escritas aqui, sem nenhum dado externo dentro, então
 * podem ir pro innerHTML sem risco. Os traços têm pathLength="1" pra
 * permitir a animação de "desenhar" (classe .desenhar no base.css).
 */

const svg = (conteudo, extra = '') =>
  `<svg class="icone ${extra}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${conteudo}</svg>`;

export const ICONES = {
  camera: svg(
    '<path d="M3.5 8.5A1.5 1.5 0 0 1 5 7h2.2l1.4-2h6.8l1.4 2H19a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z"/>' +
    '<circle cx="12" cy="12.5" r="3.5"/>'
  ),
  parar: svg('<rect x="6.5" y="6.5" width="11" height="11" rx="2.5"/>'),

  // Versões grandes, animadas, pra tela de resultado da portaria.
  sucesso: svg(
    '<circle cx="12" cy="12" r="9.5" pathLength="1"/>' +
    '<path d="M7.8 12.4l2.8 2.8 5.6-6" pathLength="1"/>',
    'desenhar'
  ),
  alerta: svg(
    '<path d="M12 3.6 2.7 19.6h18.6z" pathLength="1"/>' +
    '<path d="M12 9.8v4.4" pathLength="1"/>' +
    '<path d="M12 17.2h.01" pathLength="1"/>',
    'desenhar'
  ),
  invalido: svg(
    '<circle cx="12" cy="12" r="9.5" pathLength="1"/>' +
    '<path d="M9 9l6 6" pathLength="1"/>' +
    '<path d="M15 9l-6 6" pathLength="1"/>',
    'desenhar'
  ),
  semConexao: svg(
    '<circle cx="12" cy="12" r="9.5" pathLength="1"/>' +
    '<path d="M12 7.5v5.5" pathLength="1"/>' +
    '<path d="M12 16.4h.01" pathLength="1"/>',
    'desenhar'
  ),
};
