// Food lookup for macro tracking (fork addition): a thin, cached proxy to Open Food Facts.
//
// Why through the server and not straight from the phone: Open Food Facts asks every client to
// identify itself with a User-Agent, which a browser cannot set; one cache serves every device of
// the household; and the answer reaches the app already reduced to the five numbers it uses, per
// 100 g. Nothing about the person is sent: a search term or a barcode, and nothing else.
//
//   GET /api/food/search?q=...      → { foods: [Food] }
//   GET /api/food/product?code=...  → { food: Food | null }
//   Food = { name, brand, code, per: { kcal, p, c, f, fib? }, serving?, servingLabel?, src: 'off' }
//
// FOOD_COUNTRY (e.g. "za") searches that country's products first, then the world database.

const UA = 'openGym-selfhosted/1.0 (personal fork; https://github.com/DuarteSantos8/openGym)';
const FIELDS = 'code,product_name,product_name_en,generic_name,brands,nutriments,serving_quantity,serving_size';
const TTL_MS = 24 * 3600 * 1000;
const MAX_CACHE = 500;
const TIMEOUT_MS = 9000;

const cache = new Map();
function cached(key) {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > TTL_MS) { cache.delete(key); return undefined; }
  return hit.v;
}
function remember(key, v) {
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
  cache.set(key, { at: Date.now(), v });
  return v;
}

const num = v => {
  const x = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v);
  return Number.isFinite(x) && x >= 0 ? x : null;
};
const r1 = x => Math.round(x * 10) / 10;

/** One Open Food Facts product reduced to what the app uses, or null when it has no numbers. */
export function normalizeProduct(p) {
  if (!p || typeof p !== 'object') return null;
  const n = p.nutriments && typeof p.nutriments === 'object' ? p.nutriments : {};
  const protein = num(n.proteins_100g), carbs = num(n.carbohydrates_100g), fat = num(n.fat_100g);
  let kcal = num(n['energy-kcal_100g']);
  if (kcal == null && num(n.energy_100g) != null) kcal = num(n.energy_100g) / 4.184;   // kJ
  if (kcal == null && (protein != null || carbs != null || fat != null)) kcal = 4 * (protein || 0) + 4 * (carbs || 0) + 9 * (fat || 0);
  if (kcal == null) return null;
  const name = String(p.product_name_en || p.product_name || p.generic_name || '').trim().slice(0, 120);
  if (!name) return null;
  const fib = num(n.fiber_100g);
  const serving = num(p.serving_quantity);
  return {
    name,
    brand: String(p.brands || '').split(',')[0].trim().slice(0, 60) || undefined,
    code: String(p.code || '').replace(/\D/g, '').slice(0, 20) || undefined,
    per: { kcal: Math.round(kcal), p: r1(protein || 0), c: r1(carbs || 0), f: r1(fat || 0), ...(fib ? { fib: r1(fib) } : {}) },
    ...(serving && serving > 0 && serving < 5000 ? { serving: r1(serving) } : {}),
    ...(p.serving_size ? { servingLabel: String(p.serving_size).slice(0, 40) } : {}),
    src: 'off',
  };
}

async function getJson(url, fetchImpl) {
  const res = await fetchImpl(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error('food lookup answered ' + res.status);
  return res.json();
}

const hostOf = country => (/^[a-z]{2}$/.test(country || '') ? country : 'world') + '.openfoodfacts.org';

/** Up to 24 foods matching `q`, the country's own first. */
export async function searchFoods(q, { country = process.env.FOOD_COUNTRY || '', fetchImpl = fetch } = {}) {
  const term = String(q || '').trim().slice(0, 80);
  if (term.length < 2) return [];
  const key = 's|' + country + '|' + term.toLowerCase();
  const hit = cached(key);
  if (hit) return hit;
  const url = host => `https://${host}/cgi/search.pl?search_terms=${encodeURIComponent(term)}&search_simple=1&action=process&json=1&page_size=24&fields=${FIELDS}`;
  const hosts = [...new Set([hostOf(country), hostOf('')])];
  const out = [];
  const seen = new Set();
  for (const h of hosts) {
    let data;
    try { data = await getJson(url(h), fetchImpl); } catch (e) { if (!out.length && h === hosts.at(-1)) throw e; continue; }
    for (const p of Array.isArray(data?.products) ? data.products : []) {
      const f = normalizeProduct(p);
      if (!f) continue;
      const k = f.code || f.name.toLowerCase() + '|' + (f.brand || '');
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(f);
    }
    if (out.length >= 8) break;
  }
  return remember(key, out.slice(0, 24));
}

/** The product with barcode `code`, or null. */
export async function productByCode(code, { fetchImpl = fetch } = {}) {
  const c = String(code || '').replace(/\D/g, '');
  if (c.length < 6 || c.length > 14) return null;
  const key = 'c|' + c;
  const hit = cached(key);
  if (hit !== undefined) return hit;
  const data = await getJson(`https://world.openfoodfacts.org/api/v2/product/${c}.json?fields=${FIELDS}`, fetchImpl);
  const f = data && data.status === 1 ? normalizeProduct({ code: c, ...data.product }) : null;
  return remember(key, f);
}

export function _clearFoodCache() { cache.clear(); }
