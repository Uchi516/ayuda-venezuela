// Sala situacional · agrega cifras del terremoto VE 2026.
// EN VIVO (server-side): hospitalesenvenezuela (Supabase, CORS abierto) + réplicas USGS.
// REFRESCADO POR EL ROBOT (GitHub Action cada 20 min, que sí pasa los bloqueos): venezuelatebusca + redayuda + oficial,
//   leídos desde data/stats.json del repo vía raw.githubusercontent. Fallback embebido si el raw no responde.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const RAW = 'https://raw.githubusercontent.com/Uchi516/ayuda-venezuela/main/data/stats.json';
const SUPA_HOSP = 'https://ozuxfepfkvnxkywdsqxy.supabase.co/rest/v1/rpc/estadisticas';
const SUPA_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im96dXhmZXBma3ZueGt5d2RzcXh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0MjI5NTEsImV4cCI6MjA5Nzk5ODk1MX0.YhW0GalGkQZdO2NJTg_01C5XhdMmJ6RbNSNXXC0xG4o';
const USGS = 'https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=2026-06-24&latitude=10.5&longitude=-68.2&maxradiuskm=450&minmagnitude=2.5&orderby=time&limit=8';

// Fallback embebido por si el raw del robot aún no existe o no responde.
const SNAP = {
  vtb: { total: 77584, missing: 53371, found: 24213, at: '2026-06-29T01:10:00Z' },
  red: { salvo: 9979, desaparecidos: 43826, hospital: 8649, voluntarios: 985, puntos: 262, necesidades: 566, danos: 1182, ninos: 250, denuncias: 239, at: '2026-06-29T01:10:00Z' },
  oficial: { fallecidos: 1450, heridos: 3150, source: 'Cifra oficial preliminar', at: '2026-06-28' }
};

async function getJSON(url, opts = {}, ms = 6500) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { ...opts, signal: ctrl.signal, headers: { 'User-Agent': UA, 'Accept': 'application/json, text/plain, */*', ...(opts.headers || {}) } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const buf = await r.arrayBuffer();
    return JSON.parse(new TextDecoder('utf-8').decode(buf));
  } finally { clearTimeout(t); }
}

const num = v => (typeof v === 'number' && isFinite(v)) ? v : (v == null ? null : (isFinite(+v) ? +v : null));

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=600');

  const [raw, usgs, hosp] = await Promise.allSettled([
    getJSON(RAW + '?t=' + Math.floor(Date.now() / 120000)), // cache-bust suave (cada 2 min)
    getJSON(USGS),
    getJSON(SUPA_HOSP, { method: 'POST', headers: { apikey: SUPA_ANON, Authorization: 'Bearer ' + SUPA_ANON, 'Content-Type': 'application/json' }, body: '{}' })
  ]);

  const val = s => s.status === 'fulfilled' ? s.value : null;
  const R = val(raw) || {};
  const U = val(usgs);
  let H = val(hosp); if (Array.isArray(H)) H = H[0] || null;

  const vtb = R.vtb || SNAP.vtb;
  const red = R.red || SNAP.red;
  const oficial = R.oficial || SNAP.oficial;
  const robotLive = !!R.vtb || !!R.red; // ¿el robot ya escribió datos frescos?

  const sismos = (U && Array.isArray(U.features))
    ? U.features.slice(0, 6).map(f => ({ mag: num(f.properties && f.properties.mag), place: (f.properties && f.properties.place) || '', time: num(f.properties && f.properties.time) }))
    : [];

  const out = {
    updated_at: new Date().toISOString(),
    oficial: { fallecidos: num(oficial.fallecidos), heridos: num(oficial.heridos), source: oficial.source || 'Cifra oficial preliminar', at: oficial.at || null },
    personas: {
      desaparecidos: num(red.desaparecidos),
      a_salvo: num(red.salvo),
      ingresos_hosp: H ? num(H.pacientes) : null
    },
    respuesta: {
      voluntarios: num(red.voluntarios),
      puntos: num(red.puntos),
      necesidades: num(red.necesidades),
      danos: num(red.danos),
      ninos: num(red.ninos),
      denuncias: num(red.denuncias)
    },
    sismos,
    frescura: {
      hospitales: H ? 'live' : 'sin dato',
      sismos: U ? 'live' : 'sin dato',
      personas_at: red.at || vtb.at || null,
      oficial_at: oficial.at || null,
      robot: robotLive ? 'on' : 'fallback'
    },
    fuentes: { robot_stats: !!R.vtb || !!R.red, sismos: !!U, hospitales: !!H }
  };

  res.status(200).json(out);
}
