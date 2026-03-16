/**
 * Daily card selection using deterministic seeded index.
 * All players get the same card on the same UTC day.
 */

const EPOCH = new Date(Date.UTC(2026, 2, 16)); // March 16, 2026

function getDailyIndex() {
  const now = new Date();
  const todayUTC = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const daysDiff = Math.floor((todayUTC.getTime() - EPOCH.getTime()) / 86400000);
  // Shuffle using a simple hash so consecutive days don't pick consecutive cards
  const pool = UNIQUE_CARD_POOL;
  return ((daysDiff * 2654435761) >>> 0) % pool.length;
}

function getDailyCardName() {
  return UNIQUE_CARD_POOL[getDailyIndex()].name;
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
