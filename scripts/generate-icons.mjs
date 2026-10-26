// Erzeugt alle Icons aus scripts/logo.mjs: SVG-Quellen (assets/), Web-Icons (public/) und
// Android-Ressourcen (Launcher-Icons, adaptives Icon, Themen-Icon, Startbildschirm).
// Aufruf: npm run icons   (benötigt Playwright mit Chromium: npx playwright install chromium)
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BRAND, iconSvg } from './logo.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const res = join(root, 'android/app/src/main/res');
const { chromium } = createRequire(import.meta.url)('playwright');

const write = (path, data) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
};

// ---- SVG-Quellen ------------------------------------------------------------------------
const svgs = {
  'assets/logo.svg': iconSvg(),
  'assets/logo-round.svg': iconSvg({ shape: 'circle', scale: 0.95 }),
  'assets/logo-maskable.svg': iconSvg({ shape: 'square', scale: 0.9 }),
  'assets/logo-foreground.svg': iconSvg({ shape: 'none', scale: 0.68 }),
  'assets/logo-monochrome.svg': iconSvg({ shape: 'none', scale: 0.68, mono: true }),
  'public/favicon.svg': iconSvg(),
};
for (const [path, svg] of Object.entries(svgs)) write(join(root, path), svg);

// ---- Rastern ----------------------------------------------------------------------------
const browser = await chromium.launch();
const page = await browser.newPage();

/** Rendert ein SVG (1024er-Raster) in die Zielgröße; optional auf einen Hintergrund zentriert. */
async function png(svg, width, height = width, { background, iconSize } = {}) {
  const size = iconSize ?? Math.min(width, height);
  await page.setViewportSize({ width, height });
  await page.setContent(`<html><body style="margin:0;width:${width}px;height:${height}px;display:grid;place-items:center;
    background:${background ?? 'transparent'}"><img style="width:${size}px;height:${size}px"
    src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}"></body></html>`);
  await page.waitForFunction(() => document.images[0].complete);
  return page.screenshot({ omitBackground: !background, type: 'png' });
}

// Web
write(join(root, 'public/icon-192.png'), await png(svgs['assets/logo.svg'], 192));
write(join(root, 'public/icon-512.png'), await png(svgs['assets/logo.svg'], 512));
write(join(root, 'public/icon-maskable-512.png'), await png(svgs['assets/logo-maskable.svg'], 512));
write(join(root, 'public/apple-touch-icon.png'), await png(iconSvg({ shape: 'square', scale: 1.05 }), 180));

// Android-Launcher-Icons (48 dp) und adaptive Ebenen (108 dp)
const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, f] of Object.entries(densities)) {
  const dir = join(res, `mipmap-${d}`);
  write(join(dir, 'ic_launcher.png'), await png(svgs['assets/logo.svg'], 48 * f));
  write(join(dir, 'ic_launcher_round.png'), await png(svgs['assets/logo-round.svg'], 48 * f));
  write(join(dir, 'ic_launcher_foreground.png'), await png(svgs['assets/logo-foreground.svg'], 108 * f));
  write(join(dir, 'ic_launcher_monochrome.png'), await png(svgs['assets/logo-monochrome.svg'], 108 * f));
}

// Startbildschirm: Markenfarbe mit Motiv in der Mitte
const splashBg = `linear-gradient(170deg, ${BRAND.top}, ${BRAND.bottom})`;
const splashArt = iconSvg({ shape: 'none', scale: 1.1 });
const splash = { mdpi: [320, 480], hdpi: [480, 800], xhdpi: [720, 1280], xxhdpi: [960, 1600], xxxhdpi: [1280, 1920] };
for (const [d, [w, h]] of Object.entries(splash)) {
  const icon = Math.round(Math.min(w, h) * 0.45);
  write(join(res, `drawable-port-${d}/splash.png`), await png(splashArt, w, h, { background: splashBg, iconSize: icon }));
  write(join(res, `drawable-land-${d}/splash.png`), await png(splashArt, h, w, { background: splashBg, iconSize: icon }));
}
write(join(res, 'drawable/splash.png'), await png(splashArt, 480, 320, { background: splashBg, iconSize: 144 }));
await browser.close();

// Adaptives Icon: Verlauf als Hintergrund, Motiv als Vordergrund, monochrome Ebene für Themen-Icons
const adaptive = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>
</adaptive-icon>
`;
write(join(res, 'mipmap-anydpi-v26/ic_launcher.xml'), adaptive);
write(join(res, 'mipmap-anydpi-v26/ic_launcher_round.xml'), adaptive);
write(
  join(res, 'drawable/ic_launcher_background.xml'),
  `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <gradient android:angle="270" android:startColor="${BRAND.top}" android:endColor="${BRAND.bottom}"/>
</shape>
`,
);
write(
  join(res, 'values/ic_launcher_background.xml'),
  `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">${BRAND.splash}</color>
</resources>
`,
);
console.log('Icons erzeugt.');
