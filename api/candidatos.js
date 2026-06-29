// Devuelve las plataformas nuevas descubiertas por el robot.
// Públicamente solo se exponen las APROBADAS (status: aprobado). Las pendientes solo cuentan (para el indicador "en revisión").

const RAW = 'https://raw.githubusercontent.com/Uchi516/ayuda-venezuela/main/data/candidatos.json';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=900');
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const r = await fetch(RAW + '?t=' + Math.floor(Date.now() / 300000), { signal: ctrl.signal, headers: { 'Accept': 'application/json' } });
    clearTimeout(t);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = JSON.parse(new TextDecoder('utf-8').decode(await r.arrayBuffer()));
    const items = Array.isArray(data.items) ? data.items : [];
    const aprobados = items.filter(i => i.status === 'aprobado').map(i => ({ domain: i.domain, url: i.url, title: i.title || i.domain }));
    const pendientes = items.filter(i => i.status === 'pendiente').length;
    res.status(200).json({ updated_at: data.updated_at || null, aprobados, pendientes });
  } catch (e) {
    res.status(200).json({ updated_at: null, aprobados: [], pendientes: 0, error: 'unavailable' });
  }
}
