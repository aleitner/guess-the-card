/**
 * Game state management using localStorage.
 * Unlimited guesses - no max.
 */

function getStateKey(date) {
  return `tunnel-vision-${date}`;
}

function loadGameState(date) {
  const key = getStateKey(date);
  const stored = localStorage.getItem(key);
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

function saveGameState(date, state) {
  const key = getStateKey(date);
  localStorage.setItem(key, JSON.stringify(state));
}

function createFreshState() {
  return {
    guesses: [],
    revealed: [],
    solved: false,
    // Track numeric constraints for slot display
    constraints: { cmc: [], pow: [], tou: [] },
    // Track correct text matches for partial reveals (per field)
    textMatches: { oracle: [], type: [], artist: [], name: [] },
  };
}

function loadStats() {
  const stored = localStorage.getItem('tunnel-vision-stats');
  if (!stored) {
    return { gamesPlayed: 0, gamesWon: 0, currentStreak: 0, maxStreak: 0 };
  }
  try {
    return JSON.parse(stored);
  } catch {
    return { gamesPlayed: 0, gamesWon: 0, currentStreak: 0, maxStreak: 0 };
  }
}

function saveStats(stats) {
  localStorage.setItem('tunnel-vision-stats', JSON.stringify(stats));
}

function recordWin() {
  const stats = loadStats();
  stats.gamesPlayed++;
  stats.gamesWon++;
  stats.currentStreak++;
  stats.maxStreak = Math.max(stats.maxStreak, stats.currentStreak);
  saveStats(stats);
}
