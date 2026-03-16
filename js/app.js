/**
 * Main application logic.
 */

(async function () {
  const today = getTodayDateString();
  const cardName = getDailyCardName();

  // UI elements
  const guessForm = document.getElementById('guess-form');
  const guessInput = document.getElementById('guess-input');
  const guessList = document.getElementById('guess-list');
  const inputHint = document.getElementById('input-hint');
  const helpBtn = document.getElementById('help-btn');
  const helpModal = document.getElementById('help-modal');
  const helpClose = document.getElementById('help-close');
  const winModal = document.getElementById('win-modal');
  const winClose = document.getElementById('win-close');
  const winMessage = document.getElementById('win-message');
  const shareBtn = document.getElementById('share-btn');

  // Card slots
  const slotName = document.getElementById('slot-name');
  const slotMana = document.getElementById('slot-mana');
  const slotTypeLine = document.getElementById('slot-type');
  const slotText = document.getElementById('slot-text');
  const slotRarity = document.getElementById('slot-rarity');
  const slotPt = document.getElementById('slot-pt');
  const slotCmc = document.getElementById('slot-cmc');
  const slotArtist = document.getElementById('slot-artist');
  const cardOutline = document.getElementById('card-outline');
  const cardSlots = document.getElementById('card-slots');
  const cardOverlayImg = document.getElementById('card-overlay-img');

  // Fetch card data from Scryfall
  let cardData = null;
  try {
    cardData = await fetchCardData(cardName);
  } catch (e) {
    inputHint.textContent = 'Error loading today\'s card. Please try again later.';
    inputHint.classList.add('error');
    return;
  }

  // Load or create game state
  let state = loadGameState(today) || createFreshState();
  if (!state.constraints) state.constraints = { cmc: [], pow: [], tou: [] };
  if (!state.textMatches) state.textMatches = { oracle: [], type: [], artist: [], name: [] };

  // Replay existing guesses on page load
  replayGuesses();

  if (state.solved) {
    disableInput();
    // Skip animation on reload, just show the result
    const imgUrl = getCardFullImageUrl(cardData);
    if (imgUrl) {
      cardOverlayImg.src = imgUrl;
      cardOverlayImg.alt = cardData.name;
      cardOverlayImg.classList.add('visible');
      cardSlots.classList.add('faded');
    }
    showWinState();
  }

  // Debug reset
  document.getElementById('debug-btn').addEventListener('click', () => {
    if (confirm('Clear all Tunnel Vision data and reload?')) {
      Object.keys(localStorage)
        .filter(k => k.startsWith('tunnel-vision'))
        .forEach(k => localStorage.removeItem(k));
      location.reload();
    }
  });

  // Help modal
  helpBtn.addEventListener('click', () => helpModal.classList.add('active'));
  helpClose.addEventListener('click', () => helpModal.classList.remove('active'));
  helpModal.addEventListener('click', (e) => {
    if (e.target === helpModal) helpModal.classList.remove('active');
  });

  winClose.addEventListener('click', () => winModal.classList.remove('active'));
  winModal.addEventListener('click', (e) => {
    if (e.target === winModal) winModal.classList.remove('active');
  });
  shareBtn.addEventListener('click', shareResults);

  // Form submission
  guessForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const raw = guessInput.value.trim();
    if (!raw) return;

    const query = parseQuery(raw);
    if (!query) {
      showHint('Could not parse that query. Try c:red, t:creature, cmc=3', true);
      return;
    }

    const result = evaluateGuess(query, cardData);
    if (!result) {
      showHint('Unknown query type', true);
      return;
    }

    const guess = {
      raw,
      query,
      correct: result.correct,
      category: result.category,
      hint: result.hint,
      reveals: result.reveals,
      constraint: result.constraint || null,
    };

    state.guesses.push(guess);

    // Handle correct reveals (skip 'all' — that's handled after the mill animation)
    if (result.correct && result.reveals && result.reveals !== 'all') {
      revealSlot(result.reveals);
      if (!state.revealed.includes(result.reveals)) {
        state.revealed.push(result.reveals);
      }
    }

    // Track text matches for partial reveals
    if (result.correct) {
      trackTextMatch(result.category, query.value);
    }

    // Track constraints for slot display
    if (result.constraint) {
      const c = result.constraint;
      const field = c.field;
      if (state.constraints[field]) {
        state.constraints[field].push({ comparator: c.comparator, value: c.value });
        updateConstraintDisplay(field);
      }
    }

    addGuessRow(guess);

    // Check win
    if (result.category === 'name' && result.correct) {
      state.solved = true;
      saveGameState(today, state);
      disableInput();
      // Hide the entire card outline so nothing shows behind mill cards
      playMillAnimation(() => {
        revealAll();
        // Let the player see the revealed card before showing the modal
        setTimeout(() => showWinState(), 1500);
      });
    } else {
      saveGameState(today, state);
      showHint(result.hint);
    }

    guessInput.value = '';
    guessInput.focus();
  });


  /**
   * Track a correct text match and update the redacted display.
   */
  function trackTextMatch(category, value) {
    switch (category) {
      case 'oracle':
      case 'keyword':
        if (!state.textMatches.oracle.includes(value.toLowerCase())) {
          state.textMatches.oracle.push(value.toLowerCase());
        }
        updateRedactedSlot('oracle');
        break;
      case 'type':
        if (!state.textMatches.type.includes(value.toLowerCase())) {
          state.textMatches.type.push(value.toLowerCase());
        }
        updateRedactedSlot('type');
        break;
      case 'artist':
        if (!state.textMatches.artist.includes(value.toLowerCase())) {
          state.textMatches.artist.push(value.toLowerCase());
        }
        updateRedactedSlot('artist');
        break;
    }
  }


  /**
   * Render a text with only matched substrings visible, rest as underscores.
   * Preserves spaces and newlines but blanks unmatched letters/digits.
   */
  function redactText(fullText, matchedTerms) {
    if (!fullText || matchedTerms.length === 0) return null;

    // Build a boolean mask: true = revealed
    const mask = new Array(fullText.length).fill(false);

    for (const term of matchedTerms) {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`\\b${escaped}\\b`, 'gi');
      let m;
      while ((m = re.exec(fullText)) !== null) {
        for (let i = m.index; i < m.index + m[0].length; i++) {
          mask[i] = true;
        }
      }
    }

    // Build output: show only revealed chars, hide everything else
    let result = '';
    let i = 0;
    while (i < fullText.length) {
      if (mask[i]) {
        // Find the full revealed span
        let end = i;
        while (end < fullText.length && mask[end]) end++;
        result += fullText.slice(i, end);
        i = end;
      } else {
        // Skip hidden characters, collapse into a single space
        while (i < fullText.length && !mask[i]) i++;
        if (result.length > 0 && i < fullText.length) result += '  ';
      }
    }
    return result.trim() || null;
  }


  /**
   * Update a slot to show redacted text based on accumulated matches.
   */
  function updateRedactedSlot(field) {
    const matches = state.textMatches[field] || [];
    if (matches.length === 0) return;

    let fullText, slotEl;
    switch (field) {
      case 'oracle':
        fullText = cardData.oracle_text || '';
        slotEl = slotText;
        break;
      case 'type':
        fullText = cardData.type_line || '';
        slotEl = slotTypeLine;
        break;
      case 'artist':
        fullText = cardData.artist || '';
        slotEl = slotArtist;
        break;
      default:
        return;
    }

    const redacted = redactText(fullText, matches);
    if (redacted) {
      slotEl.textContent = redacted;
      slotEl.style.fontFamily = "'Consolas', 'Monaco', monospace";
      slotEl.classList.add('redacted');
    }
  }


  function addGuessRow(guess) {
    const row = document.createElement('div');
    row.className = 'guess-row';

    const icon = document.createElement('span');
    icon.className = `guess-icon ${guess.correct ? 'correct' : 'wrong'}`;
    icon.textContent = guess.correct ? '\u2713' : '\u2717';

    const querySpan = document.createElement('span');
    querySpan.className = 'guess-query';
    querySpan.textContent = guess.raw;

    const hintSpan = document.createElement('span');
    hintSpan.className = 'guess-hint';
    hintSpan.textContent = guess.hint;

    row.appendChild(icon);
    row.appendChild(querySpan);
    row.appendChild(hintSpan);
    guessList.appendChild(row);
    guessList.scrollTop = guessList.scrollHeight;
  }


  function revealSlot(slot) {
    switch (slot) {
      case 'color':
        updateCardBorderColor();
        break;
      case 'mana':
        slotMana.innerHTML = renderManaCost(cardData.mana_cost) || 'N/A';
        slotMana.classList.add('revealed');
        break;
      case 'cmc':
        slotCmc.textContent = `MV: ${cardData.cmc}`;
        slotCmc.classList.add('revealed');
        break;
      case 'type':
        // Type is handled by redaction — just mark as having matches
        break;
      case 'pt':
        if (cardData.power !== undefined) {
          slotPt.textContent = `${cardData.power}/${cardData.toughness}`;
          slotPt.classList.add('revealed');
        }
        break;
      case 'rarity':
        slotRarity.textContent = capitalize(cardData.rarity || 'N/A');
        slotRarity.classList.add('revealed');
        break;
      case 'artist':
        // Artist is handled by redaction
        break;
      case 'all':
        revealAll();
        break;
    }
  }


  function revealAll() {
    slotName.textContent = cardData.name;
    slotName.classList.add('revealed');

    slotMana.innerHTML = renderManaCost(cardData.mana_cost) || 'N/A';
    slotMana.classList.add('revealed');

    slotCmc.textContent = `MV: ${cardData.cmc}`;
    slotCmc.classList.add('revealed');

    slotTypeLine.textContent = cardData.type_line || 'N/A';
    slotTypeLine.style.fontFamily = '';
    slotTypeLine.classList.add('revealed');

    slotText.textContent = cardData.oracle_text || '(no text)';
    slotText.style.fontFamily = '';
    slotText.classList.add('revealed');

    slotRarity.textContent = capitalize(cardData.rarity || 'N/A');
    slotRarity.classList.add('revealed');

    if (cardData.power !== undefined) {
      slotPt.textContent = `${cardData.power}/${cardData.toughness}`;
      slotPt.classList.add('revealed');
    }

    slotArtist.textContent = cardData.artist || 'N/A';
    slotArtist.style.fontFamily = '';
    slotArtist.classList.add('revealed');

    updateCardBorderColor();
    cardOutline.classList.add('revealed');
  }


  /**
   * Mill animation: card-shaped layers peel off the card outline and scatter,
   * like milling cards off a library to reveal the named card underneath.
   */
  function playMillAnimation(onComplete) {
    const cardRect = cardOutline.getBoundingClientRect();
    const cardCount = 6;
    const staggerMs = 200;

    // Hide the slots and show the card image immediately behind the mill cards
    cardSlots.classList.add('faded');
    const imgUrl = getCardFullImageUrl(cardData);
    if (imgUrl) {
      cardOverlayImg.src = imgUrl;
      cardOverlayImg.alt = cardData.name;
      cardOverlayImg.classList.add('visible');
    }

    // Stack mill cards on top, each one peels off with a delay
    for (let i = 0; i < cardCount; i++) {
      const card = document.createElement('div');
      card.className = 'mill-card';

      // Position exactly over the card outline
      card.style.left = cardRect.left + 'px';
      card.style.top = cardRect.top + 'px';
      card.style.width = cardRect.width + 'px';
      card.style.height = cardRect.height + 'px';
      card.style.zIndex = 60 + (cardCount - i); // top card peels first

      // Each card flies in a different direction
      const angle = (Math.random() * 60 - 30);
      const xDrift = (Math.random() * 400 - 200);
      card.style.setProperty('--mill-delay', `${i * staggerMs}ms`);
      card.style.setProperty('--mill-rotate', `${angle}deg`);
      card.style.setProperty('--mill-x', `${xDrift}px`);
      card.style.setProperty('--mill-duration', '0.6s');

      const inner = document.createElement('div');
      inner.className = 'mill-card-back-pattern';
      card.appendChild(inner);

      document.body.appendChild(card);
    }

    // After all cards have milled, clean up
    const totalMs = cardCount * staggerMs + 700;
    setTimeout(() => {
      document.querySelectorAll('.mill-card').forEach(el => el.remove());
      onComplete();
    }, totalMs);
  }




  function updateCardBorderColor() {
    const colors = cardData.colors || [];
    const colorMap = { W: '#f9faf4', U: '#0e68ab', B: '#150b00', R: '#d3202a', G: '#00733e' };

    if (colors.length === 0) {
      cardOutline.style.borderColor = '#aaa';
    } else if (colors.length === 1) {
      cardOutline.style.borderColor = colorMap[colors[0]] || '#777';
    } else {
      cardOutline.style.borderColor = '#c9a82a';
    }
  }


  function updateConstraintDisplay(field) {
    const constraints = state.constraints[field] || [];
    if (constraints.length === 0) return;

    let lowerBound = -Infinity;
    let upperBound = Infinity;

    for (const c of constraints) {
      switch (c.comparator) {
        case '>': upperBound = Math.min(upperBound, c.value); break;
        case '>=': upperBound = Math.min(upperBound, c.value - 1); break;
        case '<': lowerBound = Math.max(lowerBound, c.value); break;
        case '<=': lowerBound = Math.max(lowerBound, c.value + 1); break;
      }
    }

    const parts = [];
    if (lowerBound > -Infinity) parts.push(`\u2265 ${lowerBound}`);
    if (upperBound < Infinity) parts.push(`\u2264 ${upperBound}`);

    const display = parts.join(', ');
    if (!display) return;

    let slotEl;
    if (field === 'cmc') slotEl = slotCmc;
    else if (field === 'pow' || field === 'tou') slotEl = slotPt;
    else return;

    if (slotEl.classList.contains('revealed')) return;
    slotEl.innerHTML = `<span class="slot-constraint">${display}</span>`;
  }


  function getCardFullImageUrl(card) {
    if (card.image_uris) return card.image_uris.normal || card.image_uris.large;
    if (card.card_faces && card.card_faces[0]?.image_uris) {
      return card.card_faces[0].image_uris.normal || card.card_faces[0].image_uris.large;
    }
    return null;
  }


  function showWinState() {
    winMessage.textContent = `${cardData.name} in ${state.guesses.length} guess${state.guesses.length === 1 ? '' : 'es'}!`;
    winModal.classList.add('active');
  }


  function disableInput() {
    guessInput.disabled = true;
    guessForm.querySelector('button').disabled = true;
  }


  function showHint(text, isError = false) {
    inputHint.textContent = text;
    inputHint.classList.toggle('error', isError);
  }


  function replayGuesses() {
    for (const guess of state.guesses) {
      addGuessRow(guess);
      if (guess.correct && guess.reveals) {
        revealSlot(guess.reveals);
      }
    }
    // Replay constraint displays
    for (const field of ['cmc', 'pow', 'tou']) {
      if (state.constraints[field]?.length > 0) {
        updateConstraintDisplay(field);
      }
    }
    // Replay redacted text slots
    for (const field of ['oracle', 'type', 'artist']) {
      if (state.textMatches[field]?.length > 0) {
        updateRedactedSlot(field);
      }
    }
  }


  function shareResults() {
    const guessIcons = state.guesses.map(g => g.correct ? '\u{1F7E9}' : '\u{1F7E5}').join('');
    const text = `Tunnel Vision ${today}\n${state.guesses.length} guesses\n${guessIcons}`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        shareBtn.textContent = 'Copied!';
        setTimeout(() => shareBtn.textContent = 'Share Results', 2000);
      });
    }
  }
})();
