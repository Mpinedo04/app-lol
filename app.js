const tagMeta = {
  all: { label: "Todos", color: "#c9aa71" },
  Assassin: { label: "Asesinos", single: "Asesino", color: "#e65f6d" },
  Fighter: { label: "Luchadores", single: "Luchador", color: "#d99152" },
  Mage: { label: "Magos", single: "Mago", color: "#8b8cf6" },
  Marksman: { label: "Tiradores", single: "Tirador", color: "#63d4c4" },
  Support: { label: "Apoyos", single: "Apoyo", color: "#78c66a" },
  Tank: { label: "Tanques", single: "Tanque", color: "#6aa6d8" },
};

const tagOrder = ["Assassin", "Fighter", "Mage", "Marksman", "Support", "Tank"];
const historyKey = "lol-champion-cup-history-v1";
const progressKey = "lol-champion-cup-current-v1";
const dataKey = "lol-champion-cup-data-v1";
const ddragon = "https://ddragon.leagueoflegends.com";
const pickDelay = 260;
const undoLimit = 50;
const portraitQuery = window.matchMedia("(max-width: 560px)");
const narrowQuery = window.matchMedia("(max-width: 980px)");
const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

const state = {
  version: "16.20.1",
  champions: [],
  championsById: new Map(),
  usingFallback: false,
  rounds: [],
  currentRound: 0,
  currentMatch: 0,
  selectedId: null,
  pending: false,
  sizeValue: "all",
  activeTag: "all",
  activeChart: "top10",
  eliminatedIds: new Set(),
  eliminationLog: [],
  choiceLog: [],
  currentEntrants: [],
  finished: false,
  summary: null,
  savedHistoryId: null,
  viewingHistoryEntry: null,
  history: [],
  undoStack: [],
  lastAdvanced: null,
  bracket: { boardSize: 1000, nodes: [], lines: [] },
  view: {
    x: 0,
    y: 0,
    scale: 1,
    fit: 1,
    width: 0,
    height: 0,
    dragging: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
    frame: 0,
    idleTimer: 0,
    pinch: null,
  },
};

const els = {
  arena: document.querySelector(".arena"),
  viewport: document.querySelector("#bracketViewport"),
  stage: document.querySelector("#bracketStage"),
  bracketLines: document.querySelector("#bracketLines"),
  lineLayer: document.querySelector("#lineLayer"),
  orbit: document.querySelector("#orbit"),
  duelPanel: document.querySelector("#duelPanel"),
  finalPanel: document.querySelector("#finalPanel"),
  finalHero: document.querySelector("#finalHero"),
  finalWinner: document.querySelector("#finalWinner"),
  finalMeta: document.querySelector("#finalMeta"),
  finalTopList: document.querySelector("#finalTopList"),
  finalSecondary: document.querySelector("#finalSecondary"),
  typeChart: document.querySelector("#typeChart"),
  typeFilter: document.querySelector("#typeFilter"),
  sizeSelect: document.querySelector("#sizeSelect"),
  newTournament: document.querySelector("#newTournament"),
  undoButton: document.querySelector("#undoButton"),
  summaryNewTournament: document.querySelector("#summaryNewTournament"),
  shareWinner: document.querySelector("#shareWinner"),
  copySummary: document.querySelector("#copySummary"),
  centerBracket: document.querySelector("#centerBracket"),
  zoomIn: document.querySelector("#zoomIn"),
  zoomOut: document.querySelector("#zoomOut"),
  roundLabel: document.querySelector("#roundLabel"),
  matchTitle: document.querySelector("#matchTitle"),
  matchMeta: document.querySelector("#matchMeta"),
  progressBar: document.querySelector("#progressBar"),
  progressText: document.querySelector("#progressText"),
  versionNote: document.querySelector("#versionNote"),
  leaderboardList: document.querySelector("#leaderboardList"),
  historyList: document.querySelector("#historyList"),
  leftChoice: document.querySelector("#leftChoice"),
  rightChoice: document.querySelector("#rightChoice"),
  template: document.querySelector("#choiceTemplate"),
};

const fallbackChampions = [
  ["Aatrox", "Aatrox", "la Espada Darkin", ["Fighter", "Tank"]],
  ["Ahri", "Ahri", "la Vastaya de Nueve Colas", ["Mage", "Assassin"]],
  ["Akali", "Akali", "la Asesina Sigilosa", ["Assassin"]],
  ["Ashe", "Ashe", "la Arquera de Hielo", ["Marksman", "Support"]],
  ["Darius", "Darius", "la Mano de Noxus", ["Fighter", "Tank"]],
  ["Ekko", "Ekko", "el Chico que Fragmentó el Tiempo", ["Assassin", "Fighter"]],
  ["Jinx", "Jinx", "la Bala Perdida", ["Marksman"]],
  ["Kaisa", "Kai'Sa", "la Hija del Vacío", ["Marksman", "Assassin"]],
  ["Lux", "Lux", "la Dama Luminosa", ["Mage", "Support"]],
  ["Sett", "Sett", "el Jefe", ["Fighter", "Tank"]],
  ["Yasuo", "Yasuo", "el Imperdonable", ["Fighter", "Assassin"]],
  ["Zed", "Zed", "el Maestro de las Sombras", ["Assassin"]],
].map(([id, name, title, tags]) => ({ id, name, title, tags, image: { full: `${id}.png` } }));

async function init() {
  const storedHistory = readJson(historyKey, []);
  state.history = Array.isArray(storedHistory) ? storedHistory : [];
  bindEvents();
  renderHistory();
  renderLeaderboard();
  await loadChampions();
  if (!restoreProgress(readJson(progressKey, null))) startTournament();
}

function bindEvents() {
  els.newTournament.addEventListener("click", requestNewTournament);
  els.summaryNewTournament.addEventListener("click", requestNewTournament);
  els.sizeSelect.addEventListener("change", () => {
    if (!confirmRestart()) {
      els.sizeSelect.value = state.sizeValue;
      return;
    }
    state.sizeValue = els.sizeSelect.value;
    startTournament();
  });
  els.typeFilter.addEventListener("click", (event) => {
    const button = event.target.closest(".type-chip");
    if (!button || button.disabled || button.dataset.tag === state.activeTag) return;
    if (!confirmRestart()) return;
    state.activeTag = button.dataset.tag;
    updateTypeFilters();
    updateSizeOptions();
    startTournament();
  });
  document.querySelectorAll(".chart-tab").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeChart = button.dataset.chart;
      renderFinalSummary();
    });
  });
  els.leftChoice.addEventListener("click", () => pickWinner(0));
  els.rightChoice.addEventListener("click", () => pickWinner(1));
  els.undoButton.addEventListener("click", undo);
  els.shareWinner.addEventListener("click", shareResult);
  els.copySummary.addEventListener("click", copySummary);
  els.finalSecondary.addEventListener("click", () => {
    if (state.viewingHistoryEntry) {
      closeHistoryEntry();
      return;
    }
    els.historyList.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
  els.historyList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-history-id]");
    if (!button) return;
    showHistoryEntry(button.dataset.historyId);
  });

  els.centerBracket.addEventListener("click", resetBracketView);
  els.zoomIn.addEventListener("click", () => zoomAt(0, 0, state.view.scale * 1.35));
  els.zoomOut.addEventListener("click", () => zoomAt(0, 0, state.view.scale / 1.35));
  els.viewport.addEventListener("wheel", onWheel, { passive: false });
  els.viewport.addEventListener("pointerdown", startBracketDrag);
  els.viewport.addEventListener("pointermove", moveBracketDrag);
  els.viewport.addEventListener("pointerup", endBracketDrag);
  els.viewport.addEventListener("pointercancel", endBracketDrag);
  els.viewport.addEventListener("touchstart", onTouchStart, { passive: false });
  els.viewport.addEventListener("touchmove", onTouchMove, { passive: false });
  els.viewport.addEventListener("touchend", onTouchEnd);
  els.viewport.addEventListener("touchcancel", onTouchEnd);
  new ResizeObserver(onViewportResize).observe(els.viewport);

  document.addEventListener("keydown", onKeyDown);
  portraitQuery.addEventListener("change", () => {
    els.leftChoice._id = undefined;
    els.rightChoice._id = undefined;
    renderDuel();
  });
}

/* ---------- Datos ---------- */

async function loadChampions() {
  const cached = readJson(dataKey, null);
  const hasCache = Boolean(cached?.version && Array.isArray(cached.champions) && cached.champions.length);

  try {
    const versions = await fetchJson(`${ddragon}/api/versions.json`);
    const latest = versions[0] || state.version;
    if (hasCache && cached.version === latest) {
      setChampions(cached.champions, cached.version);
    } else {
      const payload = await fetchJson(`${ddragon}/cdn/${latest}/data/es_ES/champion.json`);
      const champions = Object.values(payload.data).map(slimChampion);
      writeJson(dataKey, { version: latest, champions });
      setChampions(champions, latest);
    }
    els.versionNote.textContent = `${state.champions.length} campeones · Data Dragon ${state.version}`;
  } catch (error) {
    if (hasCache) {
      setChampions(cached.champions, cached.version);
      els.versionNote.textContent = `${state.champions.length} campeones · datos guardados ${state.version}`;
      showToast("Sin conexión con Riot: uso los datos guardados.");
    } else {
      state.usingFallback = true;
      setChampions(fallbackChampions, state.version);
      els.versionNote.textContent = `${state.champions.length} campeones · modo local`;
      showToast("No pude cargar Riot ahora mismo. He usado una lista local.");
    }
  }

  updateTypeFilters();
  updateSizeOptions();
}

function slimChampion(champion) {
  return {
    id: champion.id,
    key: champion.key,
    name: champion.name,
    title: champion.title,
    tags: champion.tags || [],
    image: { full: champion.image.full },
  };
}

function setChampions(champions, version) {
  state.version = version;
  state.champions = [...champions].sort((a, b) => a.name.localeCompare(b.name, "es"));
  state.championsById = new Map(state.champions.map((champion) => [champion.id, champion]));
}

async function fetchJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout?.(10000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Sin almacenamiento disponible: la app sigue funcionando sin guardar.
  }
}

function removeKey(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignorado.
  }
}

/* ---------- Filtros ---------- */

function getFilteredChampions() {
  if (state.activeTag === "all") return state.champions;
  return state.champions.filter((champion) => champion.tags?.includes(state.activeTag));
}

function updateTypeFilters() {
  const counts = countTags(state.champions);
  document.querySelectorAll(".type-chip").forEach((chip) => {
    const tag = chip.dataset.tag;
    const label = tagMeta[tag]?.label || tag;
    const count = tag === "all" ? state.champions.length : counts[tag] || 0;
    const active = tag === state.activeTag;
    chip.textContent = `${label} (${count})`;
    chip.classList.toggle("active", active);
    chip.setAttribute("aria-pressed", String(active));
    chip.disabled = tag !== "all" && count < 2;
  });
}

function countTags(champions) {
  return champions.reduce((acc, champion) => {
    getKnownTags(champion).forEach((tag) => {
      acc[tag] = (acc[tag] || 0) + 1;
    });
    return acc;
  }, {});
}

function updateSizeOptions() {
  const available = getFilteredChampions().length;
  const allOption = els.sizeSelect.querySelector('option[value="all"]');
  if (allOption) {
    allOption.textContent = `${tagLabel(state.activeTag)} (${available})`;
  }

  [...els.sizeSelect.options].forEach((option) => {
    if (option.value !== "all") {
      option.disabled = Number(option.value) > available;
    }
  });

  if (els.sizeSelect.selectedOptions[0]?.disabled) {
    els.sizeSelect.value = "all";
  }
  state.sizeValue = els.sizeSelect.value;
}

function getSelectedTournamentSize() {
  const available = getFilteredChampions().length;
  return state.sizeValue === "all" ? available : Math.min(Number(state.sizeValue), available);
}

function hasProgress() {
  return !state.finished && state.choiceLog.length > 0;
}

function confirmRestart() {
  return !hasProgress() || window.confirm("¿Empezar un torneo nuevo? Perderás el progreso del actual.");
}

function requestNewTournament() {
  if (confirmRestart()) startTournament();
}

/* ---------- Torneo ---------- */

function startTournament() {
  const pool = getFilteredChampions();
  if (pool.length < 2) return;

  state.viewingHistoryEntry = null;
  state.selectedId = null;
  state.pending = false;
  state.eliminatedIds = new Set();
  state.eliminationLog = [];
  state.choiceLog = [];
  state.finished = false;
  state.summary = null;
  state.savedHistoryId = null;
  state.undoStack = [];
  state.lastAdvanced = null;

  const entrants = shuffle([...pool]).slice(0, getSelectedTournamentSize());
  state.currentEntrants = entrants;
  state.rounds = buildRounds(entrants);
  state.currentRound = 0;
  state.currentMatch = findPlayableMatch(0, 0);

  buildBracket();
  resetBracketView();
  saveProgress();
  render();
  renderHistory();
  preloadUpcoming();
}

// Rellena la primera ronda hasta la siguiente potencia de 2. Los pases
// automáticos solo existen en la ronda 1 y se reparten por todo el cuadro,
// así ningún campeón recibe más de uno.
function buildRounds(entrants) {
  let size = 2;
  while (size < entrants.length) size *= 2;

  const matches = size / 2;
  const byes = size - entrants.length;
  const isBye = new Array(matches).fill(false);
  for (let i = 0; i < byes; i += 1) {
    isBye[Math.floor((i * matches) / byes)] = true;
  }

  const firstRound = [];
  let cursor = 0;
  for (let m = 0; m < matches; m += 1) {
    if (isBye[m]) {
      firstRound.push(entrants[cursor], null);
      cursor += 1;
    } else {
      firstRound.push(entrants[cursor], entrants[cursor + 1]);
      cursor += 2;
    }
  }

  const rounds = [firstRound];
  for (let length = matches; length >= 1; length /= 2) {
    rounds.push(new Array(length).fill(null));
  }

  for (let m = 0; m < matches; m += 1) {
    if (isBye[m]) rounds[1][m] = firstRound[m * 2];
  }

  return rounds;
}

function findPlayableMatch(roundIndex, from) {
  const round = state.rounds[roundIndex] || [];
  for (let m = from; m < round.length / 2; m += 1) {
    if (round[m * 2] && round[m * 2 + 1]) return m;
  }
  return -1;
}

function isByeSlot(slot) {
  const firstRound = state.rounds[0];
  return !firstRound[slot & ~1] || !firstRound[slot | 1];
}

function pickWinner(choiceIndex) {
  if (state.finished || state.pending || state.viewingHistoryEntry) return;

  const match = getCurrentMatch();
  const winner = match[choiceIndex];
  const loser = match[choiceIndex === 0 ? 1 : 0];
  if (!winner || !loser) return;

  pushUndo();
  state.pending = true;
  state.selectedId = winner.id;
  state.choiceLog.push({ champion: winner, roundIndex: state.currentRound });
  recordElimination(loser, winner);
  renderDuel();
  updateUndoButton();

  window.setTimeout(
    () => {
      state.rounds[state.currentRound + 1][state.currentMatch] = winner;
      state.lastAdvanced = { round: state.currentRound + 1, slot: state.currentMatch };
      advanceMatch();
      state.selectedId = null;
      state.pending = false;
      if (state.finished) {
        finishTournament();
      } else {
        saveProgress();
      }
      render();
      preloadUpcoming();
    },
    reducedMotionQuery.matches ? 60 : pickDelay,
  );
}

function recordElimination(champion, beatenBy) {
  if (state.eliminatedIds.has(champion.id)) return;

  state.eliminatedIds.add(champion.id);
  state.eliminationLog.push({
    champion,
    roundIndex: state.currentRound,
    matchIndex: state.currentMatch,
    order: state.eliminationLog.length,
    beatenById: beatenBy.id,
  });
}

function advanceMatch() {
  const next = findPlayableMatch(state.currentRound, state.currentMatch + 1);
  if (next !== -1) {
    state.currentMatch = next;
    return;
  }

  if (state.currentRound + 2 < state.rounds.length) {
    state.currentRound += 1;
    state.currentMatch = findPlayableMatch(state.currentRound, 0);
    return;
  }

  state.finished = true;
}

function finishTournament() {
  state.summary = buildSummary();
  state.history = [state.summary, ...state.history].slice(0, 25);
  state.savedHistoryId = state.summary.id;
  writeJson(historyKey, state.history);
  removeKey(progressKey);
  renderHistory();
}

function getCurrentMatch() {
  const round = state.rounds[state.currentRound] || [];
  return [round[state.currentMatch * 2], round[state.currentMatch * 2 + 1]];
}

/* ---------- Guardado y deshacer ---------- */

function serializeProgress() {
  const idOf = (champion) => (champion ? champion.id : null);
  return {
    v: 1,
    version: state.version,
    activeTag: state.activeTag,
    sizeValue: state.sizeValue,
    entrants: state.currentEntrants.map(idOf),
    rounds: state.rounds.map((round) => round.map(idOf)),
    currentRound: state.currentRound,
    currentMatch: state.currentMatch,
    eliminationLog: state.eliminationLog.map((entry) => ({
      id: entry.champion.id,
      roundIndex: entry.roundIndex,
      matchIndex: entry.matchIndex,
      order: entry.order,
      beatenById: entry.beatenById,
    })),
    choiceLog: state.choiceLog.map((choice) => ({ id: choice.champion.id, roundIndex: choice.roundIndex })),
  };
}

function applySnapshot(snapshot) {
  if (!snapshot || snapshot.v !== 1 || !Array.isArray(snapshot.rounds) || !Array.isArray(snapshot.entrants)) {
    return false;
  }

  const byId = state.championsById;
  const rounds = snapshot.rounds.map((round) => round.map((id) => (id === null ? null : byId.get(id))));
  const entrants = snapshot.entrants.map((id) => byId.get(id));
  const eliminationLog = (snapshot.eliminationLog || []).map((entry) => ({ ...entry, champion: byId.get(entry.id) }));
  const choiceLog = (snapshot.choiceLog || []).map((choice) => ({ ...choice, champion: byId.get(choice.id) }));

  if (
    rounds.some((round) => round.includes(undefined)) ||
    entrants.some((champion) => !champion) ||
    eliminationLog.some((entry) => !entry.champion) ||
    choiceLog.some((choice) => !choice.champion)
  ) {
    return false;
  }

  const round = rounds[snapshot.currentRound] || [];
  if (!round[snapshot.currentMatch * 2] || !round[snapshot.currentMatch * 2 + 1]) return false;

  state.rounds = rounds;
  state.currentEntrants = entrants;
  state.currentRound = snapshot.currentRound;
  state.currentMatch = snapshot.currentMatch;
  state.eliminationLog = eliminationLog;
  state.eliminatedIds = new Set(eliminationLog.map((entry) => entry.champion.id));
  state.choiceLog = choiceLog;
  state.finished = false;
  state.summary = null;
  state.selectedId = null;
  state.pending = false;
  state.viewingHistoryEntry = null;
  state.lastAdvanced = null;
  return true;
}

function restoreProgress(snapshot) {
  if (state.usingFallback || !snapshot) return false;
  if (!applySnapshot(snapshot)) return false;

  state.activeTag = tagMeta[snapshot.activeTag] ? snapshot.activeTag : "all";
  els.sizeSelect.value = snapshot.sizeValue || "all";
  updateTypeFilters();
  updateSizeOptions();
  state.undoStack = [];
  state.savedHistoryId = null;

  buildBracket();
  resetBracketView();
  render();
  preloadUpcoming();
  if (state.choiceLog.length) showToast("Torneo recuperado. Sigue donde lo dejaste.");
  return true;
}

function saveProgress() {
  if (state.usingFallback || state.finished) return;
  writeJson(progressKey, serializeProgress());
}

function pushUndo() {
  state.undoStack.push(serializeProgress());
  if (state.undoStack.length > undoLimit) state.undoStack.shift();
}

function undo() {
  if (state.pending || state.viewingHistoryEntry || !state.undoStack.length) return;

  const wasFinished = state.finished;
  if (!applySnapshot(state.undoStack.pop())) return;

  if (wasFinished && state.savedHistoryId) {
    state.history = state.history.filter((entry) => entry.id !== state.savedHistoryId);
    state.savedHistoryId = null;
    writeJson(historyKey, state.history);
    renderHistory();
  }

  saveProgress();
  render();
  preloadUpcoming();
}

function updateUndoButton() {
  els.undoButton.disabled = !state.undoStack.length || state.pending || Boolean(state.viewingHistoryEntry);
}

/* ---------- Render ---------- */

function render() {
  renderStatus();
  syncBracket();
  renderDuel();
  renderLeaderboard();
  updateUndoButton();
}

function roundName(roundIndex) {
  const roundsLeft = state.rounds.length - 1 - roundIndex;
  if (roundsLeft === 1) return "Final";
  if (roundsLeft === 2) return "Semifinales";
  if (roundsLeft === 3) return "Cuartos de final";
  if (roundsLeft === 4) return "Octavos de final";
  return null;
}

function renderStatus() {
  const totalDuels = Math.max(0, state.currentEntrants.length - 1);
  const played = state.choiceLog.length;
  setProgress(played, totalDuels);

  if (state.viewingHistoryEntry) {
    els.roundLabel.textContent = "Historial";
    els.matchTitle.textContent = state.viewingHistoryEntry.winner.name;
    els.matchMeta.textContent = formatHistoryMeta(state.viewingHistoryEntry);
    return;
  }

  if (state.finished) {
    const winner = state.rounds.at(-1)[0];
    els.roundLabel.textContent = "Ganador";
    els.matchTitle.textContent = winner ? winner.name : "Torneo terminado";
    els.matchMeta.textContent = winner ? capitalize(winner.title) : "Crea otro torneo para seguir.";
    return;
  }

  const totalRounds = state.rounds.length - 1;
  const roundNumber = state.currentRound + 1;
  const name = roundName(state.currentRound);
  const [left, right] = getCurrentMatch();
  const round = state.rounds[state.currentRound];
  let playable = 0;
  let ordinal = 0;
  for (let m = 0; m < round.length / 2; m += 1) {
    if (round[m * 2] && round[m * 2 + 1]) {
      playable += 1;
      if (m <= state.currentMatch) ordinal = playable;
    }
  }
  const byes = state.currentRound === 0 ? state.rounds[0].length - state.currentEntrants.length : 0;

  els.roundLabel.textContent = name
    ? `${name} · ronda ${roundNumber} de ${totalRounds}`
    : `Ronda ${roundNumber} de ${totalRounds}`;
  els.matchTitle.textContent = left && right ? `${left.name} vs ${right.name}` : "Preparando duelo";
  els.matchMeta.textContent = byes
    ? `Duelo ${ordinal} de ${playable} · ${byes} pasan directo a la ronda 2`
    : `Duelo ${ordinal} de ${playable}`;
}

function setProgress(played, total) {
  const ratio = total ? played / total : 0;
  els.progressBar.style.transform = `scaleX(${ratio})`;
  els.progressText.textContent = total ? `${played}/${total} duelos` : "";
}

function renderDuel() {
  const showFinal = Boolean(state.finished || state.viewingHistoryEntry);
  els.duelPanel.classList.toggle("hidden", showFinal);
  els.finalPanel.classList.toggle("hidden", !showFinal);
  if (showFinal) {
    renderFinalSummary();
    return;
  }

  const [left, right] = getCurrentMatch();
  fillChoice(els.leftChoice, left, 0);
  fillChoice(els.rightChoice, right, 1);
}

function fillChoice(button, champion, index) {
  const picked = Boolean(state.selectedId);
  button.classList.toggle("is-picked", Boolean(picked && champion && champion.id === state.selectedId));
  button.classList.toggle("is-dismissed", Boolean(picked && champion && champion.id !== state.selectedId));
  button.classList.toggle("is-empty", !champion);
  button.disabled = !champion;

  if (!champion || button._id === champion.id) return;
  button._id = champion.id;

  if (!button._parts) {
    button.appendChild(els.template.content.cloneNode(true));
    button._parts = {
      art: button.querySelector(".choice-art"),
      key: button.querySelector(".choice-key"),
      name: button.querySelector(".choice-name"),
      title: button.querySelector(".choice-title"),
      tags: button.querySelector(".choice-tags"),
    };
  }

  const parts = button._parts;
  parts.key.textContent = index === 0 ? "←" : "→";
  parts.name.textContent = champion.name;
  parts.title.textContent = capitalize(champion.title);
  parts.tags.replaceChildren(
    ...getKnownTags(champion).map((tag) => {
      const chip = document.createElement("span");
      chip.className = "tag-chip";
      chip.style.setProperty("--tag", tagMeta[tag].color);
      chip.textContent = tagMeta[tag].single;
      return chip;
    }),
  );
  setArt(parts.art, champion);
  button.setAttribute("aria-label", `Elegir a ${champion.name}`);
}

function setArt(img, champion) {
  const fallback = splashUrl(champion);
  img.classList.add("is-loading");
  img.onload = () => img.classList.remove("is-loading");
  img.onerror = () => {
    if (img.src !== fallback) {
      img.src = fallback;
    } else {
      img.classList.remove("is-loading");
    }
  };
  img.src = artUrl(champion);
  if (img.complete && img.naturalWidth) img.classList.remove("is-loading");
}

/* ---------- Bracket ---------- */

function boardSizeFor(slots) {
  if (slots >= 256) return 1500;
  if (slots >= 128) return 1300;
  if (slots >= 64) return 1120;
  return 1000;
}

function radiusForRound(roundIndex, maxRound, half) {
  if (roundIndex === maxRound) return 0;
  const outer = half * 0.86;
  const inner = half * 0.22;
  const usableRounds = Math.max(1, maxRound - 1);
  return outer - ((outer - inner) * roundIndex) / usableRounds;
}

// Cada nodo queda en el ángulo medio de sus dos "hijos", así las líneas forman un árbol.
function slotPosition(roundIndex, slot, count, maxRound, boardSize, pairSpread) {
  const half = boardSize / 2;
  const radius = radiusForRound(roundIndex, maxRound, half);
  if (radius === 0) return { x: half, y: half };

  let degrees;
  if (roundIndex === 0) {
    const matches = count / 2;
    const matchArc = 360 / matches;
    const center = ((slot >> 1) + 0.5) * matchArc;
    degrees = center + matchArc * pairSpread * (slot % 2 === 0 ? -1 : 1);
  } else {
    degrees = ((slot + 0.5) * 360) / count;
  }

  const angle = ((degrees - 90) * Math.PI) / 180;
  return { x: half + Math.cos(angle) * radius, y: half + Math.sin(angle) * radius };
}

function nodeSizeFor(roundIndex, count, maxRound, boardSize, pairSpread) {
  if (roundIndex === maxRound) return Math.round(boardSize * 0.09);

  const half = boardSize / 2;
  const radius = radiusForRound(roundIndex, maxRound, half);
  const circumference = 2 * Math.PI * radius;
  const spacing = roundIndex === 0 ? (circumference / (count / 2)) * pairSpread * 2 : circumference / count;
  const ringGap = maxRound > 1 ? (half * 0.64) / (maxRound - 1) : half;
  return Math.round(clamp(Math.min(spacing * 0.86, ringGap * 0.9), 14, 72));
}

function buildBracket() {
  const rounds = state.rounds;
  const maxRound = rounds.length - 1;
  const firstRound = rounds[0];
  const boardSize = boardSizeFor(firstRound.length);
  const byes = firstRound.length - state.currentEntrants.length;
  // Con muchos pases, los cruces reales quedan aislados y la pareja puede separarse más.
  const pairSpread = byes >= firstRound.length / 4 ? 0.38 : 0.25;

  state.bracket = { boardSize, nodes: [], lines: [] };
  els.stage.style.width = `${boardSize}px`;
  els.stage.style.height = `${boardSize}px`;
  els.stage.classList.toggle("dense", firstRound.length >= 64);
  els.bracketLines.setAttribute("viewBox", `0 0 ${boardSize} ${boardSize}`);

  const positions = rounds.map((round, r) =>
    round.map((_, slot) => slotPosition(r, slot, round.length, maxRound, boardSize, pairSpread)),
  );
  const lineFragment = document.createDocumentFragment();
  const orbitFragment = document.createDocumentFragment();

  for (let r = 0; r < maxRound; r += 1) {
    for (let slot = 0; slot < rounds[r].length; slot += 1) {
      if (r === 0 && isByeSlot(slot)) continue;
      const from = positions[r][slot];
      const to = positions[r + 1][slot >> 1];
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", from.x.toFixed(1));
      line.setAttribute("y1", from.y.toFixed(1));
      line.setAttribute("x2", to.x.toFixed(1));
      line.setAttribute("y2", to.y.toFixed(1));
      line.setAttribute("class", "bracket-line");
      lineFragment.appendChild(line);
      state.bracket.lines.push({ el: line, round: r, slot, cls: "bracket-line" });
    }
  }

  rounds.forEach((round, r) => {
    const size = nodeSizeFor(r, round.length, maxRound, boardSize, pairSpread);
    state.bracket.nodes[r] = round.map((_, slot) => {
      if (r === 0 && isByeSlot(slot)) return null;
      const point = positions[r][slot];
      const el = document.createElement("div");
      el.style.cssText = `left:${point.x.toFixed(1)}px;top:${point.y.toFixed(1)}px;width:${size}px;height:${size}px`;
      orbitFragment.appendChild(el);
      return { el, round: r, slot, champId: undefined, cls: "", img: null };
    });
  });

  els.lineLayer.replaceChildren(lineFragment);
  els.orbit.replaceChildren(orbitFragment);
  syncBracket();
}

// Solo toca el DOM de los nodos y líneas que han cambiado.
function syncBracket() {
  const { nodes, lines } = state.bracket;
  if (!nodes.length) return;

  const maxRound = state.rounds.length - 1;
  const live = !state.finished && !state.viewingHistoryEntry;
  const currentA = state.currentMatch * 2;
  const currentB = currentA + 1;
  const advanced = state.lastAdvanced;

  for (const ring of nodes) {
    for (const node of ring) {
      if (!node) continue;
      const champion = state.rounds[node.round][node.slot];
      const id = champion ? champion.id : null;
      if (node.champId !== id) setNodeChampion(node, champion);

      let cls = "orbit-node";
      if (!champion) cls += " empty";
      else if (state.eliminatedIds.has(id)) cls += " eliminated";
      else if (node.round > 0) cls += " advanced";
      if (node.round === maxRound) cls += state.finished ? " final champion" : " final";
      if (live && node.round === state.currentRound && (node.slot === currentA || node.slot === currentB)) {
        cls += " current";
      }
      if (advanced && node.round === advanced.round && node.slot === advanced.slot) cls += " just-advanced";

      if (node.cls !== cls) {
        node.el.className = cls;
        node.cls = cls;
      }
    }
  }

  for (const line of lines) {
    const child = state.rounds[line.round][line.slot];
    const winner = state.rounds[line.round + 1][line.slot >> 1];
    const cls = child && winner && child.id === winner.id ? "bracket-line hot" : "bracket-line";
    if (line.cls !== cls) {
      line.el.setAttribute("class", cls);
      line.cls = cls;
    }
  }
}

function setNodeChampion(node, champion) {
  node.champId = champion ? champion.id : null;
  if (!champion) {
    node.img?.remove();
    node.img = null;
    node.el.removeAttribute("title");
    return;
  }

  if (!node.img) {
    node.img = document.createElement("img");
    node.img.alt = "";
    node.img.decoding = "async";
    node.img.draggable = false;
    if (node.round === 0) node.img.fetchPriority = "low";
    node.el.appendChild(node.img);
  }
  node.img.src = iconUrl(champion);
  node.el.title = champion.name;
}

/* ---------- Pan y zoom ---------- */

function onViewportResize(entries) {
  const { width, height } = entries[0].contentRect;
  if (!width || !height) return;
  const relative = state.view.scale / state.view.fit;
  state.view.width = width;
  state.view.height = height;
  state.view.fit = computeFitScale();
  state.view.scale = state.view.fit * (Number.isFinite(relative) ? relative : 1);
  scheduleTransform();
}

function computeFitScale() {
  const { width, height } = state.view;
  if (!width || !height) return 1;
  return Math.max(0.05, (Math.min(width, height) * 0.97) / state.bracket.boardSize);
}

function resetBracketView() {
  state.view.width = els.viewport.clientWidth;
  state.view.height = els.viewport.clientHeight;
  state.view.fit = computeFitScale();
  state.view.x = 0;
  state.view.y = 0;
  state.view.scale = state.view.fit;
  scheduleTransform();
}

function clampScale(scale) {
  const { fit } = state.view;
  return clamp(scale, fit * 0.6, Math.max(fit * 6, 2));
}

function scheduleTransform() {
  if (state.view.frame) return;
  state.view.frame = requestAnimationFrame(applyTransform);
}

function applyTransform() {
  const view = state.view;
  view.frame = 0;
  const scaled = state.bracket.boardSize * view.scale;
  const x = view.width / 2 + view.x - scaled / 2;
  const y = view.height / 2 + view.y - scaled / 2;
  els.stage.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${view.scale})`;
}

// will-change solo mientras se mueve: al parar, el navegador vuelve a pintar nítido.
function markInteracting() {
  els.stage.classList.add("is-moving");
  window.clearTimeout(state.view.idleTimer);
  state.view.idleTimer = window.setTimeout(() => els.stage.classList.remove("is-moving"), 180);
}

function zoomAt(screenX, screenY, nextScale) {
  const view = state.view;
  const oldScale = view.scale;
  const scale = clampScale(nextScale);
  const localX = (screenX - view.x) / oldScale;
  const localY = (screenY - view.y) / oldScale;
  view.scale = scale;
  view.x = screenX - localX * scale;
  view.y = screenY - localY * scale;
  markInteracting();
  scheduleTransform();
}

function toViewportCenter(clientX, clientY) {
  const rect = els.viewport.getBoundingClientRect();
  return { x: clientX - rect.left - rect.width / 2, y: clientY - rect.top - rect.height / 2 };
}

function onWheel(event) {
  event.preventDefault();
  const point = toViewportCenter(event.clientX, event.clientY);
  zoomAt(point.x, point.y, state.view.scale * Math.exp(-event.deltaY * 0.0015));
}

function startBracketDrag(event) {
  if (event.pointerType === "touch" || event.button !== 0 || event.target.closest("button")) return;

  const view = state.view;
  view.dragging = true;
  view.pointerId = event.pointerId;
  view.startX = event.clientX;
  view.startY = event.clientY;
  view.originX = view.x;
  view.originY = view.y;
  els.viewport.classList.add("is-dragging");
  els.viewport.setPointerCapture(event.pointerId);
}

function moveBracketDrag(event) {
  const view = state.view;
  if (!view.dragging || event.pointerId !== view.pointerId) return;

  view.x = view.originX + event.clientX - view.startX;
  view.y = view.originY + event.clientY - view.startY;
  markInteracting();
  scheduleTransform();
}

function endBracketDrag(event) {
  const view = state.view;
  if (!view.dragging || event.pointerId !== view.pointerId) return;

  view.dragging = false;
  view.pointerId = null;
  els.viewport.classList.remove("is-dragging");
  if (els.viewport.hasPointerCapture(event.pointerId)) {
    els.viewport.releasePointerCapture(event.pointerId);
  }
}

// En táctil: un dedo hace scroll de la página, dos dedos mueven y hacen zoom.
function readPinch(touches) {
  const a = toViewportCenter(touches[0].clientX, touches[0].clientY);
  const b = toViewportCenter(touches[1].clientX, touches[1].clientY);
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
}

function onTouchStart(event) {
  if (event.touches.length !== 2) return;
  event.preventDefault();
  const view = state.view;
  view.pinch = { ...readPinch(event.touches), scale: view.scale, viewX: view.x, viewY: view.y };
}

function onTouchMove(event) {
  const view = state.view;
  if (!view.pinch || event.touches.length !== 2) return;
  event.preventDefault();

  const start = view.pinch;
  const now = readPinch(event.touches);
  const scale = clampScale(start.scale * (now.distance / start.distance));
  const localX = (start.x - start.viewX) / start.scale;
  const localY = (start.y - start.viewY) / start.scale;
  view.scale = scale;
  view.x = now.x - localX * scale;
  view.y = now.y - localY * scale;
  markInteracting();
  scheduleTransform();
}

function onTouchEnd(event) {
  if (event.touches.length < 2) state.view.pinch = null;
}

/* ---------- Teclado ---------- */

function onKeyDown(event) {
  if (event.defaultPrevented || event.altKey) return;
  if (event.target.closest?.("input, select, textarea, [contenteditable]")) return;

  const isUndo = ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") || event.key === "Backspace";
  if (isUndo) {
    event.preventDefault();
    undo();
    return;
  }
  if (event.ctrlKey || event.metaKey) return;

  if (event.key === "ArrowLeft") {
    event.preventDefault();
    pickWinner(0);
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    pickWinner(1);
  }
}

/* ---------- Precarga de imágenes ---------- */

const imageCache = new Map();

function preloadImage(url) {
  if (imageCache.has(url)) {
    const img = imageCache.get(url);
    imageCache.delete(url);
    imageCache.set(url, img);
    return;
  }

  const img = new Image();
  img.decoding = "async";
  img.src = url;
  img.decode?.().catch(() => undefined);
  imageCache.set(url, img);
  if (imageCache.size > 24) imageCache.delete(imageCache.keys().next().value);
}

function upcomingMatches(limit) {
  const matches = [];
  let roundIndex = state.currentRound;
  let matchIndex = state.currentMatch + 1;

  while (matches.length < limit && roundIndex < state.rounds.length - 1) {
    const round = state.rounds[roundIndex];
    for (; matchIndex < round.length / 2 && matches.length < limit; matchIndex += 1) {
      const a = round[matchIndex * 2];
      const b = round[matchIndex * 2 + 1];
      if (a && b) matches.push([a, b]);
    }
    roundIndex += 1;
    matchIndex = 0;
  }

  return matches;
}

function preloadUpcoming() {
  if (state.finished) return;
  upcomingMatches(3).forEach(([a, b]) => {
    preloadImage(artUrl(a));
    preloadImage(artUrl(b));
  });
}

/* ---------- Top 10 y resumen ---------- */

function renderLeaderboard() {
  if (els.leaderboardList._summary === state.summary) return;
  els.leaderboardList._summary = state.summary;
  renderTopList(els.leaderboardList, state.summary?.top10 || [], "Se completa al terminar");
}

function renderTopList(container, rows, emptyText) {
  container.replaceChildren();

  if (!rows.length) {
    const empty = document.createElement("li");
    empty.className = "top-empty";
    empty.textContent = emptyText;
    container.appendChild(empty);
    return;
  }

  rows.forEach((row) => {
    const li = document.createElement("li");
    li.className = "top-row";

    const rank = document.createElement("span");
    rank.className = "top-rank";
    rank.textContent = `${row.place}`;

    const img = document.createElement("img");
    img.src = iconUrl(row.champion);
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";

    const text = document.createElement("span");
    text.className = "top-text";

    const name = document.createElement("strong");
    name.textContent = row.champion.name;

    const detail = document.createElement("small");
    detail.textContent = row.detail;

    text.append(name, detail);
    li.append(rank, img, text);
    container.appendChild(li);
  });
}

function getTournamentTop10() {
  const finalWinner = state.finished ? state.rounds.at(-1)?.[0] : null;
  if (!finalWinner) return [];

  // A igual ronda, gana el que cayó contra alguien que llegó más lejos.
  const outRound = new Map(state.eliminationLog.map((entry) => [entry.champion.id, entry.roundIndex]));
  const reach = (id) => (id === finalWinner.id ? Infinity : outRound.get(id) ?? -1);
  const eliminated = [...state.eliminationLog].sort(
    (a, b) => b.roundIndex - a.roundIndex || reach(b.beatenById) - reach(a.beatenById) || b.order - a.order,
  );

  const rows = [{ place: 1, champion: finalWinner, detail: "Ganador" }];
  for (const entry of eliminated) {
    if (rows.length >= 10) break;
    rows.push({ place: rows.length + 1, champion: entry.champion, detail: eliminationDetail(entry.roundIndex) });
  }
  return rows;
}

function eliminationDetail(roundIndex) {
  const roundsLeft = state.rounds.length - 1 - roundIndex;
  if (roundsLeft === 1) return "Finalista";
  if (roundsLeft === 2) return "Semifinales";
  if (roundsLeft === 3) return "Cuartos";
  if (roundsLeft === 4) return "Octavos";
  return `Ronda ${roundIndex + 1}`;
}

function buildSummary() {
  const winner = state.rounds.at(-1)[0];
  const top10 = getTournamentTop10();
  return {
    id: `${Date.now()}-${winner.id}`,
    createdAt: new Date().toISOString(),
    dataDragonVersion: state.version,
    filterType: state.activeTag,
    tournamentSize: state.currentEntrants.length,
    winner: serializeChampion(winner),
    top10: top10.map((row) => ({ place: row.place, champion: serializeChampion(row.champion), detail: row.detail })),
    typeStatsTop10: calculateTop10TypeStats(top10),
    typeStatsChoices: calculateChoiceTypeStats(state.choiceLog),
  };
}

function getVisibleSummary() {
  return state.viewingHistoryEntry || (state.finished ? state.summary : null);
}

function renderFinalSummary() {
  const summary = getVisibleSummary();
  els.finalSecondary.textContent = state.viewingHistoryEntry ? "Volver al torneo" : "Ver historial";
  updateChartTabs();
  if (!summary) return;

  const key = `${summary.id}:${state.activeChart}`;
  if (els.finalPanel._key === key) return;
  els.finalPanel._key = key;

  els.finalHero.style.backgroundImage = `url("${centeredUrl(summary.winner)}")`;
  els.finalWinner.textContent = summary.winner.name;
  els.finalMeta.textContent = formatHistoryMeta(summary);
  renderTopList(els.finalTopList, summary.top10, "Sin top disponible");
  renderTypeChart(state.activeChart === "top10" ? summary.typeStatsTop10 : summary.typeStatsChoices);
}

function renderTypeChart(stats) {
  const total = tagOrder.reduce((sum, tag) => sum + (stats?.[tag] || 0), 0);
  if (!total) {
    els.typeChart.innerHTML = '<p class="chart-empty">Sin datos todavía.</p>';
    return;
  }

  let current = -90;
  const slices = tagOrder
    .filter((tag) => stats[tag] > 0)
    .map((tag) => {
      const value = stats[tag];
      const angle = (value / total) * 360;
      const slice = { tag, value, start: current, end: current + angle };
      current += angle;
      return slice;
    });

  const paths = slices
    .map((slice) => {
      if (slice.end - slice.start >= 359.99) {
        return `<circle cx="50" cy="50" r="36" fill="${tagMeta[slice.tag].color}"></circle>`;
      }
      const largeArc = slice.end - slice.start > 180 ? 1 : 0;
      const start = polarSvg(50, 50, 36, slice.end);
      const end = polarSvg(50, 50, 36, slice.start);
      return `<path d="M 50 50 L ${start.x} ${start.y} A 36 36 0 ${largeArc} 0 ${end.x} ${end.y} Z" fill="${tagMeta[slice.tag].color}"></path>`;
    })
    .join("");

  const legend = slices
    .map((slice) => {
      const percent = Math.round((slice.value / total) * 100);
      return `<li><span style="background:${tagMeta[slice.tag].color}"></span><strong>${tagMeta[slice.tag].label}</strong><em>${percent}%</em></li>`;
    })
    .join("");

  els.typeChart.innerHTML = `
    <svg class="pie-chart" viewBox="0 0 100 100" aria-hidden="true">
      ${paths}
      <circle cx="50" cy="50" r="21" style="fill: var(--panel)"></circle>
    </svg>
    <ul class="chart-legend">${legend}</ul>
  `;
}

function polarSvg(cx, cy, r, angle) {
  const radians = (angle * Math.PI) / 180;
  return { x: cx + r * Math.cos(radians), y: cy + r * Math.sin(radians) };
}

function updateChartTabs() {
  document.querySelectorAll(".chart-tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.chart === state.activeChart);
  });
}

function calculateTop10TypeStats(top10) {
  const stats = createEmptyTypeStats();
  top10.forEach((row, index) => {
    addChampionTags(stats, row.champion, Math.max(1, 10 - index));
  });
  return stats;
}

function calculateChoiceTypeStats(choices) {
  const stats = createEmptyTypeStats();
  choices.forEach((choice) => {
    const champion = choice.champion || choice;
    const roundIndex = Number.isFinite(choice.roundIndex) ? choice.roundIndex : 0;
    addChampionTags(stats, champion, roundIndex + 1);
  });
  return stats;
}

function createEmptyTypeStats() {
  return tagOrder.reduce((acc, tag) => {
    acc[tag] = 0;
    return acc;
  }, {});
}

function addChampionTags(stats, champion, points) {
  const tags = getKnownTags(champion);
  if (!tags.length) return;
  const split = points / tags.length;
  tags.forEach((tag) => {
    stats[tag] += split;
  });
}

function getKnownTags(champion) {
  return (champion.tags || []).filter((tag) => tagOrder.includes(tag));
}

function serializeChampion(champion) {
  return {
    id: champion.id,
    name: champion.name,
    title: champion.title,
    tags: champion.tags || [],
    image: champion.image,
  };
}

/* ---------- Historial ---------- */

function renderHistory() {
  els.historyList.replaceChildren();

  if (!state.history.length) {
    const empty = document.createElement("p");
    empty.className = "history-empty";
    empty.textContent = "Aún no hay torneos terminados.";
    els.historyList.appendChild(empty);
    return;
  }

  state.history.slice(0, 5).forEach((entry) => {
    const card = document.createElement("article");
    card.className = "history-card";
    card.classList.toggle("active", state.viewingHistoryEntry?.id === entry.id);

    const img = document.createElement("img");
    img.src = iconUrl(entry.winner);
    img.alt = "";
    img.loading = "lazy";

    const text = document.createElement("span");
    const name = document.createElement("strong");
    name.textContent = entry.winner.name;
    const meta = document.createElement("small");
    meta.textContent = `${formatDate(entry.createdAt)} · ${tagLabel(entry.filterType)}`;
    const top = document.createElement("em");
    top.textContent = entry.top10
      .slice(0, 3)
      .map((row) => row.champion.name)
      .join(", ");
    text.append(name, meta, top);

    const button = document.createElement("button");
    button.type = "button";
    button.dataset.historyId = entry.id;
    button.textContent = "Ver";

    card.append(img, text, button);
    els.historyList.appendChild(card);
  });
}

function showHistoryEntry(id) {
  const entry = state.history.find((item) => item.id === id);
  if (!entry) return;
  state.viewingHistoryEntry = entry;
  state.activeChart = "top10";
  render();
  renderHistory();
  if (narrowQuery.matches) els.arena.scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeHistoryEntry() {
  state.viewingHistoryEntry = null;
  render();
  renderHistory();
}

function formatHistoryMeta(entry) {
  return `${formatDate(entry.createdAt)} · ${entry.tournamentSize} campeones · ${tagLabel(entry.filterType)}`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function tagLabel(tag) {
  return tagMeta[tag]?.label || "Todos";
}

/* ---------- Compartir ---------- */

async function shareResult() {
  const text = buildSummaryText();
  if (navigator.share && getVisibleSummary()) {
    try {
      await navigator.share({ title: "LoL Champion Cup", text });
    } catch {
      // El usuario canceló.
    }
    return;
  }
  await writeClipboard(text);
}

async function copySummary() {
  await writeClipboard(buildSummaryText());
}

async function writeClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast("Resumen copiado.");
  } catch {
    showToast("No se pudo copiar el resumen.");
  }
}

function buildSummaryText() {
  const summary = getVisibleSummary();
  if (!summary) return "Estoy jugando Champion Cup de League of Legends.";

  const topLine = summary.top10.map((row) => `${row.place}. ${row.champion.name}`).join(" | ");
  const stats = summary.typeStatsTop10;
  const favoriteType = tagOrder
    .map((tag) => ({ tag, value: stats[tag] || 0 }))
    .sort((a, b) => b.value - a.value)[0]?.tag;

  return [
    `Mi campeón favorito en Champion Cup es ${summary.winner.name}.`,
    `Filtro: ${tagLabel(summary.filterType)} · ${summary.tournamentSize} campeones.`,
    `Tipo favorito: ${tagLabel(favoriteType)}.`,
    `Top 10: ${topLine}`,
  ].join("\n");
}

/* ---------- Utilidades ---------- */

function iconUrl(champion) {
  return `${ddragon}/cdn/${state.version}/img/champion/${champion.image.full}`;
}

function centeredUrl(champion) {
  return `${ddragon}/cdn/img/champion/centered/${champion.id}_0.jpg`;
}

function loadingUrl(champion) {
  return `${ddragon}/cdn/img/champion/loading/${champion.id}_0.jpg`;
}

function splashUrl(champion) {
  return `${ddragon}/cdn/img/champion/splash/${champion.id}_0.jpg`;
}

// Arte vertical en móvil (tarjetas altas) y splash centrado en el resto.
function artUrl(champion) {
  return portraitQuery.matches ? loadingUrl(champion) : centeredUrl(champion);
}

function capitalize(text) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

function showToast(message) {
  document.querySelector(".toast")?.remove();
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.setAttribute("role", "status");
  toast.textContent = message;
  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), 2600);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function shuffle(items) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

init();
