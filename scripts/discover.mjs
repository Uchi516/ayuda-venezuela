// Descubre NUEVAS plataformas de ayuda del terremoto VE 2026 (búsqueda web sin API key, vía DuckDuckGo HTML).
// Verifica relevancia (menciona el terremoto + ayuda) y las deja como "pendiente" en data/candidatos.json.
// NO publica nada solo: la aprobación es manual (status: pendiente -> aprobado).

import { readFileSync, writeFileSync, mkdirSync } from 'fs';

const OUT = 'data/candidatos.json';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// dominios que YA tenemos en el sitio (no son "nuevos")
const KNOWN = new Set([
  'redayudavenezuela.com', 'venezuelatebusca.com', 'desaparecidosterremotovenezuela.com', 'hospitalesenvenezuela.com',
  'centraldeayudavenezuela.com', 'recursos-venezuela.netlify.app', 'terremotovenezuela.app', 'caracasayuda.com',
  'familylinks.icrc.org', 'gofundme.com', 'wck.org', 'donate.wck.org', 'redcrossredcrescent.org', 'doctorswithoutborders.ca',
  'directrelief.org', 'savethechildren.net', 'globalempowermentmission.org', 'rescue.org', 'samaritanspurse.org',
  'wfpusa.org', 'globalgiving.org', 'crs.org', 'convoyofhope.org', 'riamoneytransfer.com', 'ayuda.cruzrojacolombiana.org',
  'directorio-terremoto-vzla.netlify.app', 'busca.nexosignal.co'
]);
// plataformas grandes / ruido que no queremos como "plataforma de ayuda"
const BLACK = new Set([
  'facebook.com', 'instagram.com', 'x.com', 'twitter.com', 'tiktok.com', 'youtube.com', 'wikipedia.org', 'es.wikipedia.org',
  'google.com', 'duckduckgo.com', 'cnn.com', 'bbc.com', 'eltiempo.com', 'infobae.com', 'univision.com', 'telemundo.com',
  'nbcnews.com', 'aljazeera.com', 'reuters.com', 'apnews.com', 'elnacional.com', 'elpais.com', 'lavanguardia.com',
  'news.un.org', 'state.gov', 'npr.org', 'efectococuyo.com', 'runrun.es', 'eluniversal.com', 'amazonaws.com',
  'linkedin.com', 'reddit.com', 'medium.com', 'change.org', 'gob.ve'
]);

const QUERIES = [
  'terremoto venezuela 2026 desaparecidos plataforma buscar',
  'ayuda terremoto venezuela 2026 donaciones sitio web',
  'directorio terremoto venezuela damnificados recursos',
  'terremoto venezuela 2026 refugios albergues mapa',
  'buscar familiares terremoto venezuela registro',
  'terremoto venezuela voluntarios ayuda coordinacion'
];
const REL = [/terremoto/i, /sismo/i, /desaparecid/i, /\bayuda\b/i, /donaci/i, /refugio/i, /albergue/i, /rescate/i, /damnificad/i, /voluntari/i];

const sleep = ms => new Promise(r => setTimeout(r, ms));

function rootDomain(host) {
  host = host.replace(/^www\./, '');
  return host;
}

async function ddg(query) {
  const url = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'es-VE,es;q=0.9' } });
    const html = await r.text();
    const found = new Set();
    // links de resultado: href="...uddg=<ENCODED>" o directos
    const re = /href="https:\/\/duckduckgo\.com\/l\/\?uddg=([^"&]+)/g;
    let m;
    while ((m = re.exec(html))) {
      try { found.add(decodeURIComponent(m[1])); } catch {}
    }
    // fallback: hrefs directos http(s)
    const re2 = /class="result__a"[^>]*href="(https?:\/\/[^"]+)"/g;
    while ((m = re2.exec(html))) found.add(m[1]);
    return [...found];
  } catch (e) { console.error('ddg', query, e.message); return []; }
}

async function relevant(domain) {
  for (const proto of ['https://', 'http://']) {
    try {
      const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 8000);
      const r = await fetch(proto + domain + '/', { headers: { 'User-Agent': UA, 'Accept-Language': 'es-VE,es;q=0.9' }, signal: ctrl.signal });
      clearTimeout(t);
      if (!r.ok) continue;
      const html = (await r.text()).slice(0, 200000);
      const text = html.replace(/<[^>]+>/g, ' ');
      const hasVE = /venezuela/i.test(text);
      const kws = REL.filter(rx => rx.test(text)).map(rx => rx.source.replace(/[\\\/bi]/g, ''));
      const titleM = html.match(/<title[^>]*>([^<]{0,120})/i);
      const title = titleM ? titleM[1].trim() : domain;
      const score = (hasVE ? 1 : 0) + kws.length;
      // relevante: menciona Venezuela + al menos 2 señales de ayuda/terremoto
      if (hasVE && kws.length >= 2) return { title, score, kws };
      return null;
    } catch (e) { /* probar siguiente proto */ }
  }
  return null;
}

// --- main ---
const prev = (() => { try { return JSON.parse(readFileSync(OUT, 'utf8')); } catch { return { items: [] }; } })();
const byDomain = new Map((prev.items || []).map(it => [it.domain, it]));

const candidates = new Set();
for (const q of QUERIES) {
  const urls = await ddg(q);
  for (const u of urls) {
    try {
      const host = rootDomain(new URL(u).hostname.toLowerCase());
      if (!host) continue;
      if (KNOWN.has(host) || [...KNOWN].some(k => host.endsWith('.' + k))) continue;
      if (BLACK.has(host) || [...BLACK].some(b => host.endsWith('.' + b))) continue;
      candidates.add(host + '|' + u);
    } catch {}
  }
  await sleep(1200); // cortesía con DDG
}

let nuevos = 0;
for (const entry of candidates) {
  const [domain, url] = entry.split('|');
  if (byDomain.has(domain)) continue; // ya estaba (conserva su status)
  const rel = await relevant(domain);
  if (!rel) continue;
  byDomain.set(domain, {
    domain, url, title: rel.title, score: rel.score, kws: rel.kws,
    status: 'pendiente', found_at: new Date().toISOString(), query_source: 'auto'
  });
  nuevos++;
  await sleep(400);
}

const items = [...byDomain.values()].sort((a, b) => (b.score || 0) - (a.score || 0));
mkdirSync('data', { recursive: true });
writeFileSync(OUT, JSON.stringify({ updated_at: new Date().toISOString(), items }, null, 2));
console.log('discover ok → nuevos:', nuevos, '· total:', items.length);
