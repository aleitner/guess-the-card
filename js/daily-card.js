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

// Each era locks in a pool size so adding cards doesn't change past days.
// When the pool grows, add a new era starting from the next available day.
const CARD_ERAS = [
  { startDay: 0, poolSize: 593, seed: 0x70BBE1 },
  // To add cards: append new entries with new cards at the END of UNIQUE_CARD_POOL
  // { startDay: 593, poolSize: 650, seed: 0x70BBE2 },
];

function getDailyCardName() {
  const now = new Date();
  const todayUTC = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const daysDiff = Math.floor((todayUTC.getTime() - EPOCH.getTime()) / 86400000);

  // Find which era this day falls into
  let era = CARD_ERAS[0];
  for (let i = CARD_ERAS.length - 1; i >= 0; i--) {
    if (daysDiff >= CARD_ERAS[i].startDay) {
      era = CARD_ERAS[i];
      break;
    }
  }

  const dayInEra = daysDiff - era.startDay;
  const cycle = Math.floor(dayInEra / era.poolSize);
  const dayInCycle = dayInEra % era.poolSize;
  const shuffled = getShuffledOrder(era.poolSize, era.seed + cycle);
  return UNIQUE_CARD_POOL[shuffled[dayInCycle]].name;
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
