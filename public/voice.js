// ──────────────────────────────────────────────
//  PokéVoice — voice.js
//  Camera + Gemini Vision API (no training needed)
// ──────────────────────────────────────────────

const micBtn        = document.getElementById('mic-btn');
const statusText    = document.getElementById('status-text');
const pokemonInput  = document.getElementById('pokemon-input');
const searchBtn     = document.getElementById('search-btn');
const resultSection = document.getElementById('result');
const errorSection  = document.getElementById('error-msg');
const errorText     = document.getElementById('error-text');
const langBtns      = document.querySelectorAll('.lang-btn');
const koHint        = document.getElementById('ko-hint');

// ── Language state ───────────────────────────
let currentLang = 'en';

langBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    currentLang = btn.dataset.lang;
    langBtns.forEach(b => b.classList.toggle('active', b === btn));
    const isKo = currentLang === 'ko';
    koHint.classList.toggle('hidden', !isKo);
    statusText.textContent = isKo
      ? '마이크를 클릭하고 포켓몬 이름을 말하세요'
      : 'Click the mic and say a Pokémon name';
    pokemonInput.placeholder = isKo
      ? '또는 포켓몬 이름을 입력하세요...'
      : 'Or type a Pokémon name...';
    if (recognition) recognition.lang = isKo ? 'ko-KR' : 'en-US';
    // Pre-load Korean map in the background
    if (isKo) loadKoreanNames().catch(() => {});
  });
});

// ── Korean name map (via PokeAPI GraphQL) ─────
const KO_CACHE_KEY = 'pokevoice_ko_names_v1';
let koNameMap = null;

async function loadKoreanNames() {
  if (koNameMap) return koNameMap;

  const cached = localStorage.getItem(KO_CACHE_KEY);
  if (cached) {
    koNameMap = new Map(JSON.parse(cached));
    return koNameMap;
  }

  const query = `{
    pokemon_v2_pokemonspeciesname(where: {language_id: {_eq: 3}}) {
      name
      pokemon_species_id
    }
  }`;

  const res = await fetch('https://beta.pokeapi.co/graphql/v1beta', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) throw new Error('Failed to load Korean name data.');

  const json = await res.json();
  const entries = json.data.pokemon_v2_pokemonspeciesname.map(
    ({ name, pokemon_species_id }) => [name, pokemon_species_id]
  );

  koNameMap = new Map(entries);
  localStorage.setItem(KO_CACHE_KEY, JSON.stringify(entries));
  return koNameMap;
}

// ── Korean accuracy helpers ───────────────────

// Decompose a Hangul string into individual Jamo (consonants + vowels)
// so that fuzzy matching works at the phoneme level.
const CHO  = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
const JUNG = ['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅘ','ㅙ','ㅚ','ㅛ','ㅜ','ㅝ','ㅞ','ㅟ','ㅠ','ㅡ','ㅢ','ㅣ'];
const JONG = ['','ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅁ','ㅂ','ㅄ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];

function toJamo(str) {
  return [...str].map(ch => {
    const code = ch.charCodeAt(0);
    if (code < 0xAC00 || code > 0xD7A3) return ch;
    const idx  = code - 0xAC00;
    const jong = idx % 28;
    const jung = Math.floor(idx / 28) % 21;
    const cho  = Math.floor(idx / 28 / 21);
    return CHO[cho] + JUNG[jung] + (jong ? JONG[jong] : '');
  }).join('');
}

// Normalize a Korean string: remove spaces, NFC, to Jamo
function normKo(str) {
  return toJamo(str.normalize('NFC').replace(/\s+/g, ''));
}

// Levenshtein distance between two strings
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

// Given all voice alternatives, return exact match OR top-3 fuzzy candidates
function resolveKorean(alternatives, map) {
  // 1. Try exact match (normalized) across all alternatives
  for (const alt of alternatives) {
    const clean = alt.replace(/\s+/g, '').normalize('NFC');
    if (map.has(clean)) return { exact: clean };
  }

  // 2. Jamo-level fuzzy: score every alternative against every name
  const scored = new Map(); // name → best distance
  const allNames = [...map.keys()];
  const jamoAlts = alternatives.map(a => normKo(a));

  for (const name of allNames) {
    const jName = normKo(name);
    let best = Infinity;
    for (const jAlt of jamoAlts) {
      const dist = levenshtein(jAlt, jName);
      if (dist < best) best = dist;
    }
    scored.set(name, best);
  }

  const top3 = allNames
    .sort((a, b) => scored.get(a) - scored.get(b))
    .slice(0, 3)
    .filter(n => scored.get(n) <= 6); // skip if too different

  return top3.length ? { suggestions: top3 } : { none: true };
}

// Suggestions UI
const suggestionsEl = document.getElementById('suggestions');

function showSuggestions(names) {
  suggestionsEl.innerHTML =
    `<p>혹시 이 포켓몬인가요?</p>` +
    names.map(n =>
      `<button class="suggestion-chip" data-name="${n}">${n}</button>`
    ).join('');
  suggestionsEl.classList.remove('hidden');
  suggestionsEl.querySelectorAll('.suggestion-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      pokemonInput.value = btn.dataset.name;
      hideSuggestions();
      fetchPokemon(btn.dataset.name);
    });
  });
}

function hideSuggestions() {
  suggestionsEl.classList.add('hidden');
  suggestionsEl.innerHTML = '';
}

// ── Type matchup computation ──────────────────
// Cache fetched type data so we don't re-fetch on every search
const typeCache = {};

async function fetchTypeData(typeName) {
  if (typeCache[typeName]) return typeCache[typeName];
  const res = await fetch(`https://pokeapi.co/api/v2/type/${typeName}`);
  const data = await res.json();
  typeCache[typeName] = data.damage_relations;
  return typeCache[typeName];
}

async function computeMatchups(types) {
  const multipliers = {}; // type -> effective multiplier

  for (const { type } of types) {
    const rel = await fetchTypeData(type.name);
    rel.double_damage_from.forEach(t => { multipliers[t.name] = (multipliers[t.name] || 1) * 2; });
    rel.half_damage_from.forEach(t  => { multipliers[t.name] = (multipliers[t.name] || 1) * 0.5; });
    rel.no_damage_from.forEach(t    => { multipliers[t.name] = 0; });
  }

  const weak    = Object.entries(multipliers).filter(([, m]) => m > 1);
  const resist  = Object.entries(multipliers).filter(([, m]) => m > 0 && m < 1);
  const immune  = Object.entries(multipliers).filter(([, m]) => m === 0);

  // Sort by multiplier descending
  weak.sort((a, b) => b[1] - a[1]);
  resist.sort((a, b) => a[1] - b[1]);

  return { weak, resist, immune };
}

function multLabel(m) {
  if (m === 4)    return '×4';
  if (m === 2)    return '×2';
  if (m === 0.5)  return '½';
  if (m === 0.25) return '¼';
  return `×${m}`;
}

function renderMatchupGroup(el, title, entries, emptyMsg) {
  if (entries.length === 0) {
    el.innerHTML = `<span class="matchup-label">${title}</span><span class="matchup-none">${emptyMsg}</span>`;
    return;
  }
  const badges = entries.map(([type, mult]) =>
    `<span class="matchup-badge type-${type}">${type}<span class="mult">${multLabel(mult)}</span></span>`
  ).join('');
  el.innerHTML = `<span class="matchup-label">${title}</span><div class="matchup-badges">${badges}</div>`;
}

// ── Show error ───────────────────────────────
function showError(msg) {
  hideResult();
  errorText.textContent = msg;
  errorSection.classList.remove('hidden');
}

// ── Hide error ───────────────────────────────
function hideError() {
  errorSection.classList.add('hidden');
}

// ── Show loading placeholder ─────────────────
function showLoader() {
  hideError();
  resultSection.classList.remove('hidden');
  resultSection.innerHTML = '<div class="loader"></div>';
}

// ── Hide result ──────────────────────────────
function hideResult() {
  resultSection.classList.add('hidden');
  // Restore original card markup so IDs are available next time
  resultSection.innerHTML = originalCardHTML;
}

// Save original card HTML before any search so we can restore it
const originalCardHTML = resultSection.innerHTML;

// ── Fetch & render Pokémon ────────────────────
async function fetchPokemon(name) {
  if (!name.trim()) return;
  showLoader();

  try {
    let identifier;

    if (currentLang === 'ko') {
      // Resolve Korean name → species ID
      statusText.textContent = '한국어 이름 목록 불러오는 중...';
      const map = await loadKoreanNames();
      const id = map.get(name.trim());
      if (!id) {
        throw new Error(`"${name.trim()}"을(를) 찾을 수 없습니다. 정확한 한국어 이름을 입력해 주세요.`);
      }
      identifier = id;
    } else {
      identifier = name.trim().toLowerCase();
    }

    const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${identifier}`);
    if (!res.ok) {
      if (res.status === 404) throw new Error(`"${name}" not found. Try another name!`);
      throw new Error(`API error: ${res.status}`);
    }

    const data = await res.json();
    renderPokemon(data);
  } catch (err) {
    showError(err.message || 'Something went wrong. Please try again.');
  }
}

// ── Render Pokémon data into the card ─────────
function renderPokemon(data) {
  // Restore the card skeleton first (in case loader replaced it)
  resultSection.innerHTML = originalCardHTML;
  hideError();
  resultSection.classList.remove('hidden');

  // Grab freshly-restored elements
  const typesEl  = document.getElementById('types');
  const spriteEl = document.getElementById('pokemon-sprite');
  const nameEl   = document.getElementById('pokemon-name');
  const idEl     = document.getElementById('pokemon-id');

  // Types
  typesEl.innerHTML = data.types
    .map(t => `<span class="type-badge type-${t.type.name}">${t.type.name}</span>`)
    .join('');

  // Sprite — prefer official artwork, fall back to default sprite
  const artworkUrl = data.sprites?.other?.['official-artwork']?.front_default;
  const fallback   = data.sprites?.front_default;
  spriteEl.src = artworkUrl || fallback || '';
  spriteEl.alt = data.name;

  // Basic info
  nameEl.textContent = data.name;
  idEl.textContent   = `#${String(data.id).padStart(4, '0')}`;

  // Type matchups
  const weakEl   = document.getElementById('matchup-weak');
  const resistEl = document.getElementById('matchup-resist');
  const immuneEl = document.getElementById('matchup-immune');

  weakEl.innerHTML   = '<span class="matchup-label">Calculating…</span>';
  resistEl.innerHTML = '';
  immuneEl.innerHTML = '';

  computeMatchups(data.types).then(({ weak, resist, immune }) => {
    const isKo = currentLang === 'ko';
    renderMatchupGroup(weakEl,   isKo ? '🔴 약점 (Weak to)'       : '🔴 Weak to',    weak,   isKo ? '없음' : 'None');
    renderMatchupGroup(resistEl, isKo ? '🟢 저항 (Resistant to)'   : '🟢 Resistant to', resist, isKo ? '없음' : 'None');
    renderMatchupGroup(immuneEl, isKo ? '⚪ 무효 (Immune to)'       : '⚪ Immune to',  immune, isKo ? '없음' : 'None');
  });
}

// ──────────────────────────────────────────────
//  Voice Recognition
// ──────────────────────────────────────────────
const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;

let recognition = null;
let isListening  = false;

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.interimResults = false;
  recognition.maxAlternatives = 10; // more candidates → better fuzzy matching

  recognition.onstart = () => {
    isListening = true;
    micBtn.classList.add('listening');
    statusText.textContent = currentLang === 'ko'
      ? '듣고 있습니다… 포켓몬 이름을 말하세요'
      : 'Listening… say a Pokémon name';
    statusText.classList.add('active');
  };

  recognition.onresult = async (event) => {
    const result = event.results[0];
    const top = result[0].transcript.trim();

    if (currentLang !== 'ko') {
      statusText.textContent = `Heard: "${top}"`;
      pokemonInput.value = top;
      fetchPokemon(top);
      return;
    }

    // Collect all alternatives for Korean
    const alternatives = Array.from({ length: result.length }, (_, i) =>
      result[i].transcript.trim()
    );

    statusText.textContent = `들린 내용: "${top}"`;
    hideSuggestions();

    // Pre-load map (already cached after first use)
    let map;
    try {
      map = await loadKoreanNames();
    } catch {
      showError('포켓몬 이름 목록을 불러오지 못했습니다. 다시 시도해 주세요.');
      return;
    }

    const resolved = resolveKorean(alternatives, map);

    if (resolved.exact) {
      pokemonInput.value = resolved.exact;
      fetchPokemon(resolved.exact);
    } else if (resolved.suggestions) {
      statusText.textContent = '정확히 인식하지 못했습니다. 아래에서 선택해 주세요:';
      showSuggestions(resolved.suggestions);
    } else {
      showError(`"${top}"을(를) 찾을 수 없습니다. 다시 말하거나 직접 입력해 주세요.`);
    }
  };

  recognition.onerror = (event) => {
    stopListening();
    if (event.error === 'not-allowed') {
      showError(currentLang === 'ko'
        ? '마이크 접근이 거부되었습니다. 권한을 허용해 주세요.'
        : 'Microphone access denied. Please allow mic permissions.');
    } else if (event.error === 'no-speech') {
      statusText.textContent = currentLang === 'ko'
        ? '음성이 감지되지 않았습니다. 다시 시도해 주세요.'
        : 'No speech detected. Try again.';
    } else {
      showError(`Voice error: ${event.error}`);
    }
  };

  recognition.onend = () => {
    stopListening();
  };
} else {
  micBtn.title = 'Speech Recognition not supported in this browser';
  micBtn.style.opacity = '0.4';
  micBtn.style.cursor  = 'not-allowed';
  statusText.textContent = 'Voice input not supported – use the text box.';
}

function startListening() {
  if (!recognition || isListening) return;
  hideError();
  recognition.start();
}

function stopListening() {
  isListening = false;
  micBtn.classList.remove('listening');
  statusText.textContent = currentLang === 'ko'
    ? '마이크를 클릭하고 포켓몬 이름을 말하세요'
    : 'Click the mic and say a Pokémon name';
  statusText.classList.remove('active');
}

// ──────────────────────────────────────────────
//  Event Listeners
// ──────────────────────────────────────────────
micBtn.addEventListener('click', () => {
  if (isListening) {
    recognition.stop();
  } else {
    startListening();
  }
});

searchBtn.addEventListener('click', () => {
  fetchPokemon(pokemonInput.value);
});

pokemonInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') fetchPokemon(pokemonInput.value);
});
