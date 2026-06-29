// Refresca las cifras de las plataformas que BLOQUEAN a los servidores (venezuelatebusca 403, redayuda 429).
// Truco: un navegador real abre la página (pasa el challenge / cookie) y luego hace un fetch SAME-ORIGIN a su /api/stats.
// Escribe data/stats.json. Si una fuente falla, conserva el último valor bueno (no borra).

import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const OUT = 'data/stats.json';

function readPrev() {
  try { return JSON.parse(readFileSync(OUT, 'utf8')); } catch { return {}; }
}

async function statsFrom(page, origin) {
  await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 45000 });
  // dar tiempo al challenge anti-bot y a que la app monte
  await page.waitForTimeout(4000);
  try {
    return await page.evaluate(async () => {
      try {
        const r = await fetch('/api/stats', { headers: { accept: 'application/json' } });
        if (!r.ok) return null;
        return await r.json();
      } catch (e) { return null; }
    });
  } catch (e) { return null; }
}

const prev = readPrev();
const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'] });
const ctx = await browser.newContext({ userAgent: UA, locale: 'es-VE' });
const page = await ctx.newPage();

let vtbRaw = null, redRaw = null;
try { vtbRaw = await statsFrom(page, 'https://venezuelatebusca.com/'); } catch (e) { console.error('vtb', e.message); }
try { redRaw = await statsFrom(page, 'https://redayudavenezuela.com/'); } catch (e) { console.error('red', e.message); }
await browser.close();

const now = new Date().toISOString();
const out = { ...prev };

if (vtbRaw && vtbRaw.stats) {
  out.vtb = { total: vtbRaw.stats.total, missing: vtbRaw.stats.missing, found: vtbRaw.stats.found, at: now };
}
if (redRaw && redRaw.stats) {
  const s = redRaw.stats;
  out.red = { salvo: s.salvo, desaparecidos: s.desaparecidos, hospital: s.hospital, voluntarios: s.voluntarios, puntos: s.puntos, necesidades: s.necesidades, danos: s.danos, ninos: redRaw.ninos, denuncias: redRaw.denuncias, atrapados: s.atrapados, at: now };
}
if (redRaw && redRaw.official && (redRaw.official.fallecidos != null || redRaw.official.heridos != null)) {
  out.oficial = { fallecidos: redRaw.official.fallecidos, heridos: redRaw.official.heridos, source: redRaw.official.source || 'Cifra oficial preliminar', at: redRaw.official.updated_at || now };
}

mkdirSync('data', { recursive: true });
writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log('scrape ok →', { vtb: !!(vtbRaw && vtbRaw.stats), red: !!(redRaw && redRaw.stats) });
