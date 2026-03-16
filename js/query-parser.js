/**
 * Parses Scryfall-style syntax and matches against card attributes.
 */

const COLOR_MAP = {
  white: 'W', w: 'W',
  blue: 'U', u: 'U',
  black: 'B', b: 'B',
  red: 'R', r: 'R',
  green: 'G', g: 'G',
};

const COLOR_NAMES = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' };

const RARITY_MAP = {
  common: 'common', c: 'common',
  uncommon: 'uncommon', u: 'uncommon',
  rare: 'rare', r: 'rare',
  mythic: 'mythic', m: 'mythic',
};

function parseQuery(input) {
  input = input.trim().toLowerCase();
  if (!input) return null;

  // Negation prefix: -c:red, -t:creature, etc.
  let negated = false;
  if (input.startsWith('-')) {
    negated = true;
    input = input.slice(1);
  }

  // Name guess: "name:something" (negation doesn't apply)
  if (input.startsWith('name:')) {
    return { type: 'name', value: input.slice(5).trim() };
  }

  let match;

  // Color identity: id:urg, identity:wubrg
  match = input.match(/^(?:id|identity|ci):(.+)$/);
  if (match) return { type: 'identity', value: match[1].trim(), negated };

  // Color count: c>1, c=2, c<=1, colors>=2
  match = input.match(/^(?:c|color|colors)(>=|<=|!=|>|<|=)(\d+)$/);
  if (match) return { type: 'colorcount', comparator: match[1], value: parseInt(match[2]), negated };

  // Color: c:red, c=r, c=red (treat = with non-numeric as color query)
  match = input.match(/^(?:c|color|colors)[:=](.+)$/);
  if (match) return { type: 'color', value: match[1].trim(), negated };

  // Type
  match = input.match(/^(?:t|type):(.+)$/);
  if (match) return { type: 'type', value: match[1].trim(), negated };

  // CMC / Mana Value
  match = input.match(/^(?:cmc|mv)(>=|<=|!=|>|<|=)(\d+)$/);
  if (match) return { type: 'cmc', comparator: match[1], value: parseInt(match[2]), negated };

  // Loyalty
  match = input.match(/^(?:loy|loyalty)(>=|<=|!=|>|<|=)(\d+)$/);
  if (match) return { type: 'loyalty', comparator: match[1], value: parseInt(match[2]), negated };

  // Power
  match = input.match(/^(?:pow|power)(>=|<=|!=|>|<|=)(.+)$/);
  if (match) return { type: 'power', comparator: match[1], value: match[2].trim(), negated };

  // Toughness
  match = input.match(/^(?:tou|toughness)(>=|<=|!=|>|<|=)(.+)$/);
  if (match) return { type: 'toughness', comparator: match[1], value: match[2].trim(), negated };

  // Rarity
  match = input.match(/^(?:r|rarity):(.+)$/);
  if (match) return { type: 'rarity', value: match[1].trim(), negated };

  // Set
  match = input.match(/^(?:s|e|set|edition):(.+)$/);
  if (match) return { type: 'set', value: match[1].trim(), negated };

  // Mana cost: m:{R}, m:R, m:{2}{R}, mana:{W}{U}
  match = input.match(/^(?:m|mana):(.+)$/);
  if (match) return { type: 'mana', value: match[1].trim(), negated };

  // Produces mana
  match = input.match(/^(?:produces):(.+)$/);
  if (match) return { type: 'produces', value: match[1].trim(), negated };

  // Oracle text
  match = input.match(/^(?:o|oracle):(.+)$/);
  if (match) return { type: 'oracle', value: match[1].trim(), negated };

  // Full oracle text (alias for o: in our context)
  match = input.match(/^(?:fo|fulloracle):(.+)$/);
  if (match) return { type: 'oracle', value: match[1].trim(), negated };

  // Flavor text
  match = input.match(/^(?:ft|flavor):(.+)$/);
  if (match) return { type: 'flavor', value: match[1].trim(), negated };

  // Artist
  match = input.match(/^(?:a|artist):(.+)$/);
  if (match) return { type: 'artist', value: match[1].trim(), negated };

  // Keywords
  match = input.match(/^(?:k|keyword|keywords):(.+)$/);
  if (match) return { type: 'keyword', value: match[1].trim(), negated };

  // Is/has tags: is:triggered, is:activated, is:modal, etc.
  match = input.match(/^(?:is|has):(.+)$/);
  if (match) return { type: 'is', value: match[1].trim(), negated };

  // Bare text = name guess
  return { type: 'name', value: input };
}


function evaluateGuess(query, card) {
  if (!query) return null;

  let result;
  switch (query.type) {
    case 'name': return evaluateName(query, card);
    case 'color': result = evaluateColor(query, card); break;
    case 'colorcount': result = evaluateColorCount(query, card); break;
    case 'identity': result = evaluateIdentity(query, card); break;
    case 'type': result = evaluateType(query, card); break;
    case 'mana': result = evaluateMana(query, card); break;
    case 'cmc': result = evaluateCmc(query, card); break;
    case 'loyalty': result = evaluateLoyalty(query, card); break;
    case 'power': result = evaluatePower(query, card); break;
    case 'toughness': result = evaluateToughness(query, card); break;
    case 'rarity': result = evaluateRarity(query, card); break;
    case 'set': result = evaluateSet(query, card); break;
    case 'oracle': result = evaluateOracle(query, card); break;
    case 'flavor': result = evaluateFlavor(query, card); break;
    case 'produces': result = evaluateProduces(query, card); break;
    case 'keyword': result = evaluateKeyword(query, card); break;
    case 'artist': result = evaluateArtist(query, card); break;
    case 'is': result = evaluateIs(query, card); break;
    default: return { correct: false, category: 'unknown', hint: 'Unknown query type' };
  }

  // Apply negation: flip correct/incorrect, suppress reveals
  if (query.negated) {
    result.correct = !result.correct;
    result.hint = result.hint;
    result.reveals = null; // negated guesses never reveal slots
    result.constraint = null;
  }

  return result;
}


function evaluateName(query, card) {
  const correct = query.value.toLowerCase().trim() === card.name.toLowerCase().trim();
  return {
    correct,
    category: 'name',
    hint: correct ? card.name : 'Wrong name',
    reveals: correct ? 'all' : null,
  };
}


function evaluateColor(query, card) {
  const val = query.value.toLowerCase().trim();
  const cardColors = card.colors || [];

  let correct = false;
  let hint = '';

  if (val === 'colorless' || val === 'c') {
    correct = cardColors.length === 0;
    hint = correct ? 'Colorless' : 'Not colorless';
  } else if (val === 'multicolor' || val === 'multi' || val === 'm') {
    correct = cardColors.length >= 2;
    hint = correct ? 'Multicolor' : 'Not multicolor';
  } else if (val === 'mono' || val === 'monocolor') {
    correct = cardColors.length === 1;
    hint = correct ? 'Mono-colored' : 'Not mono-colored';
  } else {
    const colorCode = COLOR_MAP[val] || val.toUpperCase();
    correct = cardColors.includes(colorCode);
    const colorName = COLOR_NAMES[colorCode] || val;
    hint = correct ? colorName : `Not ${colorName}`;
  }

  // Color guess reveals the card border color but NOT the mana cost symbols
  return { correct, category: 'color', hint, reveals: correct ? 'color' : null };
}


function evaluateColorCount(query, card) {
  const cardCount = (card.colors || []).length;
  const comp = query.comparator;
  const val = query.value;
  const correct = compareNumeric(cardCount, comp, val);

  let hint = '';
  if (correct) {
    hint = `${cardCount} color${cardCount !== 1 ? 's' : ''}`;
  } else if (comp === '=') {
    hint = `Not ${val} colors`;
  } else {
    hint = getConstraintHint('Colors', cardCount, comp, val);
  }

  return { correct, category: 'color', hint, reveals: correct ? 'color' : null };
}


/**
 * Mana cost matching. Accepts formats like:
 *   m:{R}  m:R  m:{2}{R}  m:2R  m:{W}{U}
 * Normalizes input to bracket notation and checks if the card's mana_cost contains those symbols.
 * Does NOT reveal the full mana cost — just confirms presence in the guess list.
 */
function evaluateMana(query, card) {
  const cardMana = (card.mana_cost || '').toUpperCase();
  if (!cardMana) {
    return { correct: false, category: 'mana', hint: 'No mana cost', reveals: null };
  }

  let val = query.value.toUpperCase();

  // Normalize bare symbols to bracket notation: "2R" -> "{2}{R}", "WU" -> "{W}{U}"
  if (!val.includes('{')) {
    val = val.split('').map(ch => `{${ch}}`).join('');
  }

  // Check if every symbol in the guess appears in the card's mana cost
  const guessSymbols = val.match(/\{[^}]+\}/g) || [];
  if (guessSymbols.length === 0) {
    return { correct: false, category: 'mana', hint: 'Invalid mana syntax', reveals: null };
  }

  // Track remaining mana to match against (to handle duplicates)
  let remaining = cardMana;
  let allFound = true;
  for (const sym of guessSymbols) {
    const idx = remaining.indexOf(sym);
    if (idx === -1) {
      allFound = false;
      break;
    }
    remaining = remaining.slice(0, idx) + remaining.slice(idx + sym.length);
  }

  // Exact match = correct, partial containment = also counts as correct info
  const isExact = allFound && remaining.length === 0;
  const correct = allFound;

  let hint;
  if (isExact) {
    hint = 'Exact mana cost';
  } else if (correct) {
    hint = `Contains ${val}`;
  } else {
    hint = `Mana cost doesn't include ${val}`;
  }

  return { correct, category: 'mana', hint, reveals: isExact ? 'mana' : null };
}


function evaluateType(query, card) {
  const val = query.value.toLowerCase();
  const typeLine = (card.type_line || '').toLowerCase();
  const correct = matchWholeWord(typeLine, val);
  return {
    correct,
    category: 'type',
    hint: correct ? capitalize(val) : `Not ${val}`,
    reveals: correct ? 'type' : null,
  };
}


function evaluateCmc(query, card) {
  const cardCmc = card.cmc;
  const val = query.value;
  const comp = query.comparator;
  const correct = compareNumeric(cardCmc, comp, val);

  let hint = '';
  if (correct) {
    hint = `MV is ${cardCmc}`;
  } else if (comp === '=') {
    // No directional hint for exact guesses
    hint = `Not ${val}`;
  } else {
    // Only give direction when user explicitly used > or <
    hint = getConstraintHint('MV', cardCmc, comp, val);
  }

  return {
    correct, category: 'cmc', hint,
    reveals: correct ? 'cmc' : null,
    // Pass constraint info for slot display
    constraint: correct ? null : { field: 'cmc', comparator: comp, value: val, cardValue: cardCmc },
  };
}


function evaluatePower(query, card) {
  if (!card.power) {
    return { correct: false, category: 'power', hint: `Not ${query.value}`, reveals: null };
  }
  if (query.value === '*' || card.power === '*') {
    const correct = card.power === query.value;
    return { correct, category: 'power', hint: correct ? 'Power is *' : 'Not *', reveals: correct ? 'pt' : null };
  }
  const cardVal = parseInt(card.power);
  const guessVal = parseInt(query.value);
  if (isNaN(cardVal) || isNaN(guessVal)) {
    return { correct: false, category: 'power', hint: 'Invalid', reveals: null };
  }
  const comp = query.comparator;
  const correct = compareNumeric(cardVal, comp, guessVal);
  let hint = '';
  if (correct) {
    hint = `Power is ${card.power}`;
  } else if (comp === '=') {
    hint = `Not ${guessVal}`;
  } else {
    hint = getConstraintHint('Power', cardVal, comp, guessVal);
  }
  return {
    correct, category: 'power', hint, reveals: correct ? 'pt' : null,
    constraint: correct ? null : { field: 'pow', comparator: comp, value: guessVal, cardValue: cardVal },
  };
}


function evaluateToughness(query, card) {
  if (!card.toughness) {
    return { correct: false, category: 'toughness', hint: `Not ${query.value}`, reveals: null };
  }
  if (query.value === '*' || card.toughness === '*') {
    const correct = card.toughness === query.value;
    return { correct, category: 'toughness', hint: correct ? 'Toughness is *' : 'Not *', reveals: correct ? 'pt' : null };
  }
  const cardVal = parseInt(card.toughness);
  const guessVal = parseInt(query.value);
  if (isNaN(cardVal) || isNaN(guessVal)) {
    return { correct: false, category: 'toughness', hint: 'Invalid', reveals: null };
  }
  const comp = query.comparator;
  const correct = compareNumeric(cardVal, comp, guessVal);
  let hint = '';
  if (correct) {
    hint = `Toughness is ${card.toughness}`;
  } else if (comp === '=') {
    hint = `Not ${guessVal}`;
  } else {
    hint = getConstraintHint('Toughness', cardVal, comp, guessVal);
  }
  return {
    correct, category: 'toughness', hint, reveals: correct ? 'pt' : null,
    constraint: correct ? null : { field: 'tou', comparator: comp, value: guessVal, cardValue: cardVal },
  };
}


function evaluateIdentity(query, card) {
  const val = query.value.toLowerCase().trim();
  const cardIdentity = (card.color_identity || []);

  let correct = false;
  let hint = '';

  if (val === 'colorless' || val === 'c') {
    correct = cardIdentity.length === 0;
    hint = correct ? 'Colorless identity' : 'Not colorless identity';
  } else {
    const colorCode = COLOR_MAP[val] || val.toUpperCase();
    correct = cardIdentity.includes(colorCode);
    const colorName = COLOR_NAMES[colorCode] || val;
    hint = correct ? `${colorName} in identity` : `${colorName} not in identity`;
  }

  return { correct, category: 'identity', hint, reveals: null };
}


function evaluateLoyalty(query, card) {
  if (!card.loyalty) {
    return { correct: false, category: 'loyalty', hint: `Not ${query.value}`, reveals: null };
  }
  const cardVal = parseInt(card.loyalty);
  const guessVal = query.value;
  const comp = query.comparator;
  if (isNaN(cardVal)) {
    return { correct: false, category: 'loyalty', hint: 'Invalid', reveals: null };
  }
  const correct = compareNumeric(cardVal, comp, guessVal);
  let hint = '';
  if (correct) {
    hint = `Loyalty is ${card.loyalty}`;
  } else if (comp === '=') {
    hint = `Not ${guessVal}`;
  } else {
    hint = getConstraintHint('Loyalty', cardVal, comp, guessVal);
  }
  return { correct, category: 'loyalty', hint, reveals: correct ? 'pt' : null };
}


function evaluateSet(query, card) {
  const val = query.value.toLowerCase();
  const cardSet = (card.set || '').toLowerCase();
  const cardSetName = (card.set_name || '').toLowerCase();
  const correct = val === cardSet || cardSetName.includes(val);
  return {
    correct,
    category: 'set',
    hint: correct ? capitalize(card.set_name || card.set) : `Not ${val}`,
    reveals: null,
  };
}


function evaluateFlavor(query, card) {
  const val = query.value.toLowerCase().trim();
  if (BLOCKED_ORACLE_WORDS.has(val)) {
    return {
      correct: false,
      category: 'flavor',
      hint: `"${query.value}" is too common`,
      reveals: null,
    };
  }
  const text = (card.flavor_text || '').toLowerCase();
  if (!text) {
    return { correct: false, category: 'flavor', hint: 'No flavor text', reveals: null };
  }
  const correct = matchWholeWord(text, val);
  return {
    correct,
    category: 'flavor',
    hint: correct ? `Flavor contains "${query.value}"` : `No "${query.value}" in flavor`,
    reveals: null,
  };
}


function evaluateProduces(query, card) {
  const val = query.value.toLowerCase().trim();
  const produced = (card.produced_mana || []).map(m => m.toLowerCase());

  const colorCode = COLOR_MAP[val] || val.toUpperCase();
  const correct = produced.includes(colorCode.toLowerCase());
  const colorName = COLOR_NAMES[colorCode] || val;

  return {
    correct,
    category: 'produces',
    hint: correct ? `Produces ${colorName}` : `Doesn't produce ${colorName}`,
    reveals: null,
  };
}


function evaluateRarity(query, card) {
  const val = RARITY_MAP[query.value] || query.value;
  const correct = card.rarity === val;
  return {
    correct,
    category: 'rarity',
    hint: correct ? capitalize(card.rarity) : `Not ${val}`,
    reveals: correct ? 'rarity' : null,
  };
}


// Common English words that are too generic to be useful oracle guesses
const BLOCKED_ORACLE_WORDS = new Set([
  'a', 'an', 'the', 'to', 'of', 'in', 'on', 'at', 'is', 'it',
  'or', 'and', 'for', 'if', 'as', 'by', 'up', 'its', 'has', 'may',
  'can', 'do', 'no', 'not', 'you', 'your', 'that', 'this', 'with',
  'from', 'are', 'was', 'be', 'each', 'all', 'any', 'one', 'they',
  'them', 'then', 'than', 'when', 'get', 'gets', 'got', 'put', 'end',
  'into', 'card', 'cards',
]);

function evaluateOracle(query, card) {
  const val = query.value.toLowerCase().trim();
  if (BLOCKED_ORACLE_WORDS.has(val)) {
    return {
      correct: false,
      category: 'oracle',
      hint: `"${query.value}" is too common`,
      reveals: null,
    };
  }
  const text = (card.oracle_text || '').toLowerCase();
  const correct = matchWholeWord(text, val);
  return {
    correct,
    category: 'oracle',
    hint: correct ? `Contains "${query.value}"` : `No "${query.value}"`,
    reveals: null,
  };
}


function evaluateKeyword(query, card) {
  const keywords = (card.keywords || []).map(k => k.toLowerCase());
  const val = query.value.toLowerCase();
  const correct = keywords.includes(val);
  return {
    correct,
    category: 'keyword',
    hint: correct ? capitalize(query.value) : `No ${query.value}`,
    reveals: null,
  };
}


function evaluateArtist(query, card) {
  const val = query.value.toLowerCase();
  const artist = (card.artist || '').toLowerCase();
  // Allow full name match or matching whole words within the name
  const correct = artist === val || matchWholeWord(artist, val);
  return {
    correct,
    category: 'artist',
    hint: correct ? 'Correct artist' : 'Different artist',
    reveals: correct ? 'artist' : null,
  };
}


/**
 * Evaluate is:/has: tags by pattern-matching card data.
 * Supports common Scryfall-style tags.
 */
function evaluateIs(query, card) {
  const val = query.value.toLowerCase();
  const text = (card.oracle_text || '').toLowerCase();
  const typeLine = (card.type_line || '').toLowerCase();
  const keywords = (card.keywords || []).map(k => k.toLowerCase());

  const checks = {
    // Ability types
    triggered: () => /\b(when|whenever|at the beginning)\b/.test(text),
    activated: () => /\{[^}]*\}.*:/.test(card.oracle_text || ''),
    static: () => text.length > 0 && !checks.triggered() && !checks.activated(),
    modal: () => /\bchoose (one|two|three|four|five|any number)\b/.test(text),

    // Card properties
    vanilla: () => !text || text.trim() === '',
    legendary: () => typeLine.includes('legendary'),
    historic: () => typeLine.includes('legendary') || typeLine.includes('artifact') || typeLine.includes('saga'),
    token: () => text.includes('create') && text.includes('token'),
    etb: () => /\b(enters|enters the battlefield)\b/.test(text),
    dies: () => /\b(dies|when .+ dies)\b/.test(text),
    sacrifice: () => text.includes('sacrifice'),
    exile: () => text.includes('exile'),
    counter: () => /\bcounter(s)?\b/.test(text) && !/\bcounters?\s+target\b/.test(text) || text.includes('+1/+1') || text.includes('-1/-1'),
    counters: () => text.includes('+1/+1') || text.includes('-1/-1') || /\bput .+ counter/.test(text),
    counterspell: () => /\bcounter target\b/.test(text),
    draw: () => text.includes('draw'),
    discard: () => text.includes('discard'),
    mill: () => text.includes('mill') || /\bput .+ from .+ library .+ into .+ graveyard\b/.test(text),
    lifegain: () => /\b(gain|gains) .+ life\b/.test(text),
    lifeloss: () => /\b(lose|loses) .+ life\b/.test(text),
    removal: () => /\b(destroy|exile|deals? .+ damage to)\b/.test(text),
    burn: () => /\bdeals? .+ damage\b/.test(text),
    ramp: () => /\b(add|adds) \{/.test(card.oracle_text || '') || /\bsearch .+ library .+ land\b/.test(text),
    tutor: () => /\bsearch .+ library\b/.test(text),
    equipment: () => typeLine.includes('equipment'),
    aura: () => typeLine.includes('aura'),
    saga: () => typeLine.includes('saga'),
    vehicle: () => typeLine.includes('vehicle'),
    planeswalker: () => typeLine.includes('planeswalker'),
    permanent: () => /\b(creature|artifact|enchantment|planeswalker|land|battle)\b/.test(typeLine) && !typeLine.includes('instant') && !typeLine.includes('sorcery'),
    spell: () => typeLine.includes('instant') || typeLine.includes('sorcery'),
    flash: () => keywords.includes('flash'),
    flying: () => keywords.includes('flying'),
    haste: () => keywords.includes('haste'),
    trample: () => keywords.includes('trample'),
    deathtouch: () => keywords.includes('deathtouch'),
    lifelink: () => keywords.includes('lifelink'),
    hexproof: () => keywords.includes('hexproof'),
    indestructible: () => keywords.includes('indestructible'),
  };

  const checkFn = checks[val];
  if (!checkFn) {
    return {
      correct: false,
      category: 'is',
      hint: `Unknown tag "${val}"`,
      reveals: null,
    };
  }

  const correct = checkFn();
  return {
    correct,
    category: 'is',
    hint: correct ? `Yes, is ${val}` : `Not ${val}`,
    reveals: null,
  };
}


function compareNumeric(cardVal, comparator, guessVal) {
  switch (comparator) {
    case '=': return cardVal === guessVal;
    case '>': return cardVal > guessVal;
    case '<': return cardVal < guessVal;
    case '>=': return cardVal >= guessVal;
    case '<=': return cardVal <= guessVal;
    case '!=': return cardVal !== guessVal;
    default: return cardVal === guessVal;
  }
}


/**
 * Only called for > / < / >= / <= comparators that were WRONG.
 * Tells the user the constraint they now know.
 * e.g. if user said cmc>3 and it's wrong, card CMC is ≤ 3.
 */
function getConstraintHint(label, _actual, comp, guessVal) {
  // The user's guess was wrong, so the opposite is true
  switch (comp) {
    case '>': return `${label} ≤ ${guessVal}`;
    case '>=': return `${label} < ${guessVal}`;
    case '<': return `${label} ≥ ${guessVal}`;
    case '<=': return `${label} > ${guessVal}`;
    default: return '';
  }
}


/**
 * Render a mana cost string like "{1}{R}" into HTML img elements
 * using Scryfall's SVG symbol API.
 */
function renderManaCost(manaCost) {
  if (!manaCost) return '';
  // Match each {X} symbol
  return manaCost.replace(/\{([^}]+)\}/g, (_, symbol) => {
    // Scryfall SVG URL - symbol needs to be URL-encoded
    const encoded = encodeURIComponent(symbol);
    return `<img class="mana-symbol" src="https://svgs.scryfall.io/card-symbols/${encoded}.svg" alt="{${symbol}}" title="{${symbol}}">`;
  });
}


function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}


/**
 * Check if `term` appears as a whole word (or whole multi-word phrase) in `text`.
 * "chris" does NOT match "Christopher", but "christopher" does.
 * "3 damage" matches "deals 3 damage to".
 */
function matchWholeWord(text, term) {
  // Escape regex special chars in the term
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?:^|\\b|\\s)${escaped}(?:$|\\b|\\s)`, 'i');
  return re.test(text);
}
