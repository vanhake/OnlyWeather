// Logo von OnlyWeather als SVG-Bausteine. Eine Quelle für App-Icon, adaptives Android-Icon,
// Themen-Icon (monochrom), Startbildschirm und Web-Icons.

export const BRAND = { top: '#3d93ec', bottom: '#1a4f9e', splash: '#1f5aa8' };

const drop = (x, y, s = 1) =>
  `<path transform="translate(${x} ${y}) scale(${s})" d="M0 -52 C 20 -24 34 -6 34 14 A 34 34 0 0 1 -34 14 C -34 -6 -20 -24 0 -52 Z"/>`;

const CLOUD = 'M318 652 H714 A112 112 0 0 0 726 429 A178 178 0 0 0 391 470 A92 92 0 0 0 318 652 Z';

/** Motiv im 1024er-Raster, Mitte bei (512, 512). mono = einfarbig weiß (Android-Themen-Icon). */
export function art({ mono = false } = {}) {
  if (mono) {
    // Themen-Icons werten nur die Deckkraft aus: Sonne und Wolke durch eine transparente Fuge trennen
    return `
  <mask id="gap"><rect width="1024" height="1024" fill="#fff"/>
    <path d="${CLOUD}" fill="#000" stroke="#000" stroke-width="44" stroke-linejoin="round"/></mask>
  <g fill="#fff">
    <circle cx="652" cy="372" r="146" mask="url(#gap)"/>
    <path d="${CLOUD}"/>
    ${drop(410, 768, 1.1)}${drop(522, 800, 1.1)}${drop(634, 768, 1.1)}
  </g>`;
  }
  return `
  <g>
    <circle cx="652" cy="372" r="146" fill="url(#sun)"/>
    <circle cx="652" cy="372" r="146" fill="none" stroke="#ffe9a6" stroke-opacity=".55" stroke-width="10"/>
    <path fill="#ffffff" filter="url(#shadow)" d="${CLOUD}"/>
    <g fill="#bfe3ff">
      ${drop(410, 768, 1.1)}${drop(522, 800, 1.1)}${drop(634, 768, 1.1)}
    </g>
  </g>`;
}

function defs() {
  return `<defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0" stop-color="${BRAND.top}"/><stop offset="1" stop-color="${BRAND.bottom}"/>
    </linearGradient>
    <radialGradient id="sun" cx="0.38" cy="0.35" r="0.75">
      <stop offset="0" stop-color="#ffe066"/><stop offset="1" stop-color="#f6a400"/>
    </radialGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="160%">
      <feDropShadow dx="0" dy="14" stdDeviation="18" flood-color="#0b2a5c" flood-opacity=".35"/>
    </filter>
  </defs>`;
}

/**
 * shape: 'square' (Vollfläche, z. B. maskable Web-Icon), 'rounded' (App-Icon), 'circle' (rundes Icon),
 * 'none' (transparenter Hintergrund, Vordergrund des adaptiven Icons). scale verkleinert das Motiv.
 */
export function iconSvg({ shape = 'rounded', scale = 1.1, mono = false } = {}) {
  const bg =
    shape === 'square' ? '<rect width="1024" height="1024" fill="url(#bg)"/>'
    : shape === 'rounded' ? '<rect width="1024" height="1024" rx="228" fill="url(#bg)"/>'
    : shape === 'circle' ? '<circle cx="512" cy="512" r="512" fill="url(#bg)"/>'
    : '';
  // Motiv optisch etwas nach oben gerückt (Tropfen unten), daher Mittelpunkt 512/540
  const t = `translate(512 512) scale(${scale}) translate(-528 -560)`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  ${defs()}${bg}<g transform="${t}">${art({ mono })}</g></svg>`;
}
