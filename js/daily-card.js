/**
 * Daily card selection using deterministic seeded index.
 * All players get the same card on the same UTC day.
 */

const EPOCH = new Date(Date.UTC(2026, 2, 16)); // March 16, 2026

// Seeded PRNG (mulberry32) for deterministic shuffle
function mulberry32(seed) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Fisher-Yates shuffle with seeded PRNG — guarantees no repeats for pool.length days
function getShuffledOrder(poolLength, seed) {
  const rng = mulberry32(seed);
  const indices = Array.from({ length: poolLength }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices;
}

function getDailyCardName() {
  const now = new Date();
  const todayUTC = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const daysDiff = Math.floor((todayUTC.getTime() - EPOCH.getTime()) / 86400000);
  const pool = UNIQUE_CARD_POOL;
  // Use a different seed each cycle so the order changes after exhausting the pool
  const cycle = Math.floor(daysDiff / pool.length);
  const dayInCycle = daysDiff % pool.length;
  const shuffled = getShuffledOrder(pool.length, 0x70BBE1 + cycle);
  return pool[shuffled[dayInCycle]].name;
}

function getTodayDateString() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Fetch card data from Scryfall by exact name.
 * Returns the full Scryfall card object.
 */
async function fetchCardData(cardName) {
  const url = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cardName)}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Scryfall API error: ${resp.status}`);
  return resp.json();
}
