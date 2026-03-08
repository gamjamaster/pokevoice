// ──────────────────────────────────────────────
//  PokéScan — scan.js
//  Camera + Gemini Vision API (no training needed)
// ──────────────────────────────────────────────

// ── DOM Elements ──────────────────────────────
const video             = document.getElementById('camera');
const snapCanvas        = document.getElementById('snap-canvas');
const cameraPlaceholder = document.getElementById('camera-placeholder');
const scanningIndicator = document.getElementById('scanning-indicator');
const startBtn          = document.getElementById('start-btn');
const snapBtn           = document.getElementById('snap-btn');
const stopBtn           = document.getElementById('stop-btn');
const predictionBar     = document.getElementById('prediction-bar');
const predName          = document.getElementById('pred-name');
const predConfidence    = document.getElementById('pred-confidence');
const predFill          = document.getElementById('pred-fill');
const scanStatus        = document.getElementById('scan-status');
const resultSection     = document.getElementById('result');
const errorSection      = document.getElementById('error-msg');
const errorText         = document.getElementById('error-text');
// ── State ─────────────────────────────────────
let stream         = null;
let isScanning     = false;
let isBusy         = false;     // prevents overlapping Gemini calls
let autoScanTimer  = null;
let lastDetected   = '';

const MIN_SCAN_COOLDOWN = 5000; // minimum ms between Gemini calls
let lastScanTime = 0;
let rateLimitedUntil = 0;

// Save original card HTML
const originalCardHTML = resultSection.innerHTML;

// ──────────────────────────────────────────────
//  API Key is stored server-side in server.py
// ──────────────────────────────────────────────
scanStatus.textContent = 'Ready! Start the camera to scan Pokémon.';

// ──────────────────────────────────────────────
//  Camera
// ──────────────────────────────────────────────
async function startCamera() {
  // Camera API requires HTTPS on non-localhost origins
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showError(
      'Camera not available. This page must be opened via HTTPS.\n' +
      'Use: https://' + location.hostname + ':8443/scan.html'
    );
    return;
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false
    });

    video.srcObject = stream;
    await video.play();

    snapCanvas.width  = video.videoWidth;
    snapCanvas.height = video.videoHeight;

    cameraPlaceholder.classList.add('hidden');
    video.classList.remove('hidden');
    startBtn.classList.add('hidden');
    stopBtn.classList.remove('hidden');
    hideError();

    isScanning = true;

    snapBtn.classList.remove('hidden');
    scanStatus.textContent = 'Camera on — press "Scan Now" to identify a Pokémon.';
  } catch (err) {
    if (err.name === 'NotAllowedError') {
      showError('Camera access denied. Please allow camera permissions.');
    } else if (err.name === 'NotFoundError') {
      showError('No camera found on this device.');
    } else {
      showError(`Camera error: ${err.message}`);
    }
  }
}

function stopCamera() {
  isScanning = false;

  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }

  video.srcObject = null;
  video.classList.add('hidden');
  cameraPlaceholder.classList.remove('hidden');
  startBtn.classList.remove('hidden');
  snapBtn.classList.add('hidden');
  stopBtn.classList.add('hidden');
  predictionBar.classList.add('hidden');
  scanningIndicator.classList.add('hidden');

  scanStatus.textContent = 'Camera stopped.';
}

startBtn.addEventListener('click', startCamera);
stopBtn.addEventListener('click', stopCamera);

// ──────────────────────────────────────────────
//  Gemini Vision — Capture & Identify
// ──────────────────────────────────────────────
function captureFrame() {
  const ctx = snapCanvas.getContext('2d');
  ctx.drawImage(video, 0, 0, snapCanvas.width, snapCanvas.height);
  // Convert to base64 JPEG (smaller than PNG)
  return snapCanvas.toDataURL('image/jpeg', 0.8).split(',')[1];
}

async function identifyWithGemini() {
  if (isBusy || !isScanning) return;

  // Rate limit protection
  const now = Date.now();
  if (now < rateLimitedUntil) {
    const waitSec = Math.ceil((rateLimitedUntil - now) / 1000);
    scanStatus.textContent = `Rate limited — please wait ${waitSec}s before scanning again.`;
    return;
  }
  if (now - lastScanTime < MIN_SCAN_COOLDOWN) {
    scanStatus.textContent = 'Please wait a few seconds between scans.';
    return;
  }

  isBusy = true;
  lastScanTime = now;

  scanningIndicator.classList.remove('hidden');
  predictionBar.classList.remove('hidden');
  predName.textContent = 'Analyzing…';
  predConfidence.textContent = '';
  predFill.style.width = '100%';
  predFill.className = 'prediction-fill scanning';

  try {
    const base64 = captureFrame();

    const body = {
      contents: [{
        parts: [
          {
            text: `You are a Pokémon identification expert. Look at this image and identify the Pokémon shown.

Rules:
- If you see a Pokémon (toy, card, drawing, plushie, game screenshot, cosplay, or any depiction), respond with ONLY the English Pokémon name in lowercase (e.g. "pikachu", "charizard", "mewtwo").
- If you see multiple Pokémon, identify the most prominent one.
- Use the official English name that works with the PokéAPI (e.g. "mr-mime" not "mr. mime", "farfetchd" not "farfetch'd").
- If no Pokémon is visible, respond with exactly "none".
- Do NOT add any explanation, punctuation, or extra text. Just the name or "none".`
          },
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: base64
            }
          }
        ]
      }]
    };

    const res = await fetch('/api/identify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }
    );

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const errMsg = errData?.error?.message || `API error ${res.status}`;
      if (res.status === 429) {
        // Rate limited — wait 60 seconds before allowing next scan
        rateLimitedUntil = Date.now() + 60000;
        throw new Error('Rate limit reached. Wait ~60s then press Scan Now again.');
      }
      if (res.status === 405) {
        throw new Error(`Model not supported (HTTP 405). Set a valid GEMINI_MODEL environment variable on the server (e.g. gemma-3-27b-it).`);
      }
      if (res.status === 400 || res.status === 403) {
        throw new Error(`Invalid API key or quota exceeded: ${errMsg}`);
      }
      throw new Error(errMsg);
    }

    const json = await res.json();
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim().toLowerCase() || '';

    // Clean up the response
    const pokemonName = text.replace(/[^a-z0-9-]/g, '');

    if (!pokemonName || pokemonName === 'none') {
      predName.textContent = 'No Pokémon detected';
      predConfidence.textContent = '';
      predFill.style.width = '0%';
      predFill.className = 'prediction-fill low';
      scanStatus.textContent = 'No Pokémon found — try pointing at a Pokémon image.';
    } else {
      predName.textContent = pokemonName;
      predConfidence.textContent = 'Gemini AI';
      predFill.style.width = '100%';
      predFill.className = 'prediction-fill high';
      scanStatus.textContent = `Identified: ${pokemonName} — Fetching data…`;

      if (pokemonName !== lastDetected) {
        lastDetected = pokemonName;
        await fetchPokemon(pokemonName);
      } else {
        scanStatus.textContent = `Still seeing: ${pokemonName}`;
      }
    }
  } catch (err) {
    console.error('Gemini error:', err);
    predName.textContent = 'Error';
    predFill.style.width = '0%';
    predFill.className = 'prediction-fill low';
    scanStatus.textContent = `Error: ${err.message}`;
  } finally {
    isBusy = false;
    scanningIndicator.classList.add('hidden');
  }
}

// Manual scan button only — no auto-scan to avoid rate limits
snapBtn.addEventListener('click', () => {
  identifyWithGemini();
});

// ──────────────────────────────────────────────
//  PokéAPI Fetch & Render
// ──────────────────────────────────────────────
const typeCache = {};

async function fetchTypeData(typeName) {
  if (typeCache[typeName]) return typeCache[typeName];
  const res = await fetch(`https://pokeapi.co/api/v2/type/${typeName}`);
  const data = await res.json();
  typeCache[typeName] = data.damage_relations;
  return typeCache[typeName];
}

async function computeMatchups(types) {
  const multipliers = {};
  for (const { type } of types) {
    const rel = await fetchTypeData(type.name);
    rel.double_damage_from.forEach(t => { multipliers[t.name] = (multipliers[t.name] || 1) * 2; });
    rel.half_damage_from.forEach(t  => { multipliers[t.name] = (multipliers[t.name] || 1) * 0.5; });
    rel.no_damage_from.forEach(t    => { multipliers[t.name] = 0; });
  }

  const weak   = Object.entries(multipliers).filter(([, m]) => m > 1);
  const resist = Object.entries(multipliers).filter(([, m]) => m > 0 && m < 1);
  const immune = Object.entries(multipliers).filter(([, m]) => m === 0);

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

async function fetchPokemon(name) {
  if (!name.trim()) return;
  hideError();

  try {
    const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${name.trim().toLowerCase()}`);
    if (!res.ok) {
      if (res.status === 404) throw new Error(`"${name}" not found in PokéAPI.`);
      throw new Error(`API error: ${res.status}`);
    }

    const data = await res.json();
    renderPokemon(data);
    scanStatus.textContent = `Found: ${data.name.charAt(0).toUpperCase() + data.name.slice(1)} — Keep scanning!`;
  } catch (err) {
    scanStatus.textContent = `Could not fetch "${name}". Still scanning…`;
    console.warn(err.message);
  }
}

function renderPokemon(data) {
  resultSection.innerHTML = originalCardHTML;
  hideError();
  resultSection.classList.remove('hidden');

  const typesEl  = document.getElementById('types');
  const spriteEl = document.getElementById('pokemon-sprite');
  const nameEl   = document.getElementById('pokemon-name');
  const idEl     = document.getElementById('pokemon-id');

  typesEl.innerHTML = data.types
    .map(t => `<span class="type-badge type-${t.type.name}">${t.type.name}</span>`)
    .join('');

  const artworkUrl = data.sprites?.other?.['official-artwork']?.front_default;
  const fallback   = data.sprites?.front_default;
  spriteEl.src = artworkUrl || fallback || '';
  spriteEl.alt = data.name;

  nameEl.textContent = data.name;
  idEl.textContent   = `#${String(data.id).padStart(4, '0')}`;

  const weakEl   = document.getElementById('matchup-weak');
  const resistEl = document.getElementById('matchup-resist');
  const immuneEl = document.getElementById('matchup-immune');

  weakEl.innerHTML   = '<span class="matchup-label">Calculating…</span>';
  resistEl.innerHTML = '';
  immuneEl.innerHTML = '';

  computeMatchups(data.types).then(({ weak, resist, immune }) => {
    renderMatchupGroup(weakEl,   '🔴 Weak to',      weak,   'None');
    renderMatchupGroup(resistEl, '🟢 Resistant to',  resist, 'None');
    renderMatchupGroup(immuneEl, '⚪ Immune to',     immune, 'None');
  });
}

// ── Error helpers ─────────────────────────────
function showError(msg) {
  errorText.textContent = msg;
  errorSection.classList.remove('hidden');
}

function hideError() {
  errorSection.classList.add('hidden');
}
