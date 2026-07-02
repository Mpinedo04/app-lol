const tagMeta = {
  all: { label: "Todos", color: "#c9aa71" },
  Assassin: { label: "Asesinos", color: "#e65f6d" },
  Fighter: { label: "Luchadores", color: "#d99152" },
  Mage: { label: "Magos", color: "#8b8cf6" },
  Marksman: { label: "Tiradores", color: "#63d4c4" },
  Support: { label: "Apoyos", color: "#78c66a" },
  Tank: { label: "Tanques", color: "#6aa6d8" },
};

const tagOrder = ["Assassin", "Fighter", "Mage", "Marksman", "Support", "Tank"];
const historyKey = "lol-champion-cup-history-v1";

const state = {
  version: "16.13.1",
  champions: [],
  rounds: [],
  currentRound: 0,
  currentMatch: 0,
  selectedId: null,
  tournamentSize: "all",
  activeTag: "all",
  activeChart: "top10",
  eliminatedIds: new Set(),
  eliminationLog: [],
  choiceLog: [],
  currentEntrants: [],
  finished: false,
  tournamentSaved: false,
  viewingHistoryEntry: null,
  view: {
    x: 0,
    y: 0,
    scale: 1,
    dragging: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
  },
};

const els = {
  arena: document.querySelector(".arena"),
  bracketBoard: document.querySelector(".bracket-board"),
  duelPanel: document.querySelector("#duelPanel"),
  finalPanel: document.querySelector("#finalPanel"),
  finalHero: document.querySelector("#finalHero"),
  finalWinner: document.querySelector("#finalWinner"),
  finalMeta: document.querySelector("#finalMeta"),
  finalTopList: document.querySelector("#finalTopList"),
  typeChart: document.querySelector("#typeChart"),
  typeFilter: document.querySelector("#typeFilter"),
  sizeSelect: document.querySelector("#sizeSelect"),
  newTournament: document.querySelector("#newTournament"),
  summaryNewTournament: document.querySelector("#summaryNewTournament"),
  shareWinner: document.querySelector("#shareWinner"),
  copySummary: document.querySelector("#copySummary"),
  showHistory: document.querySelector("#showHistory"),
  clearStats: document.querySelector("#clearStats"),
  roundLabel: document.querySelector("#roundLabel"),
  matchTitle: document.querySelector("#matchTitle"),
  matchMeta: document.querySelector("#matchMeta"),
  versionNote: document.querySelector("#versionNote"),
  leaderboardList: document.querySelector("#leaderboardList"),
  historyList: document.querySelector("#historyList"),
  lineLayer: document.querySelector("#lineLayer"),
  orbit: document.querySelector("#orbit"),
  centerCrown: document.querySelector("#centerCrown"),
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
  ["Ekko", "Ekko", "el Chico que Fragmento el Tiempo", ["Assassin", "Fighter"]],
  ["Jinx", "Jinx", "la Bala Perdida", ["Marksman"]],
  ["Kaisa", "Kai'Sa", "la Hija del Vacio", ["Marksman", "Assassin"]],
  ["Lux", "Lux", "la Dama Luminosa", ["Mage", "Support"]],
  ["Sett", "Sett", "el Jefe", ["Fighter", "Tank"]],
  ["Yasuo", "Yasuo", "el Imperdonable", ["Fighter", "Assassin"]],
  ["Zed", "Zed", "el Maestro de las Sombras", ["Assassin"]],
].map(([id, name, title, tags]) => ({ id, name, title, tags, image: { full: `${id}.png` } }));

async function init() {
  bindEvents();
  renderHistory();
  renderLeaderboard();
  await loadChampions();
  startTournament();
}

function bindEvents() {
  els.newTournament.addEventListener("click", startTournament);
  els.summaryNewTournament.addEventListener("click", startTournament);
  els.sizeSelect.addEventListener("change", () => {
    state.tournamentSize = getSelectedTournamentSize();
    startTournament();
  });
  els.typeFilter.addEventListener("click", (event) => {
    const button = event.target.closest(".type-chip");
    if (!button || button.disabled) return;
    state.activeTag = button.dataset.tag;
    updateTypeFilters();
    updateSizeOptions();
    startTournament();
  });
  document.querySelectorAll(".chart-tab").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeChart = button.dataset.chart;
      updateChartTabs();
      renderFinalSummary();
    });
  });
  els.leftChoice.addEventListener("click", () => pickWinner(0));
  els.rightChoice.addEventListener("click", () => pickWinner(1));
  els.shareWinner.addEventListener("click", shareResult);
  els.copySummary.addEventListener("click", copySummary);
  els.showHistory.addEventListener("click", () => {
    els.historyList.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
  els.historyList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-history-id]");
    if (!button) return;
    showHistoryEntry(button.dataset.historyId);
  });
  els.clearStats.addEventListener("click", resetBracketView);
  els.arena.addEventListener("wheel", zoomBracket, { passive: false });
  els.arena.addEventListener("pointerdown", startBracketDrag);
  els.arena.addEventListener("pointermove", moveBracketDrag);
  els.arena.addEventListener("pointerup", endBracketDrag);
  els.arena.addEventListener("pointercancel", endBracketDrag);
}

async function loadChampions() {
  try {
    const versions = await fetchJson("https://ddragon.leagueoflegends.com/api/versions.json");
    state.version = versions[0] || state.version;
    const url = `https://ddragon.leagueoflegends.com/cdn/${state.version}/data/es_ES/champion.json`;
    const payload = await fetchJson(url);
    state.champions = Object.values(payload.data).sort((a, b) => a.name.localeCompare(b.name, "es"));
    updateTypeFilters();
    updateSizeOptions();
    els.versionNote.textContent = `${state.champions.length} campeones - Data Dragon ${state.version}`;
  } catch (error) {
    state.champions = fallbackChampions;
    updateTypeFilters();
    updateSizeOptions();
    els.versionNote.textContent = `${state.champions.length} campeones - modo local`;
    showToast("No pude cargar Riot ahora mismo. He usado una lista local.");
  }
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function startTournament() {
  const pool = getFilteredChampions();
  if (!pool.length) return;

  state.viewingHistoryEntry = null;
  state.tournamentSize = getSelectedTournamentSize();
  state.currentRound = 0;
  state.currentMatch = 0;
  state.selectedId = null;
  state.eliminatedIds = new Set();
  state.eliminationLog = [];
  state.choiceLog = [];
  state.finished = false;
  state.tournamentSaved = false;

  const entrants = shuffle([...pool]).slice(0, state.tournamentSize);
  state.currentEntrants = entrants;
  state.rounds = buildRounds(entrants);
  applyByesForRound(0);

  els.bracketBoard.classList.toggle("mega", entrants.length > 64);
  els.bracketBoard.classList.toggle("dense", entrants.length > 32 && entrants.length <= 64);
  resetBracketView(false);

  render();
}

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
    chip.textContent = `${label} (${count})`;
    chip.classList.toggle("active", tag === state.activeTag);
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
    const label = state.activeTag === "all" ? "Todos" : tagMeta[state.activeTag].label;
    allOption.textContent = `${label} (${available})`;
  }

  [...els.sizeSelect.options].forEach((option) => {
    if (option.value !== "all") {
      option.disabled = Number(option.value) > available;
    }
  });

  const selected = els.sizeSelect.selectedOptions[0];
  if (selected?.disabled) {
    els.sizeSelect.value = "all";
  }
}

function getSelectedTournamentSize() {
  const available = getFilteredChampions().length;
  return els.sizeSelect.value === "all" ? available : Math.min(Number(els.sizeSelect.value), available);
}

function buildRounds(entrants) {
  const rounds = [entrants];
  let size = entrants.length;

  while (size > 1) {
    size = Math.ceil(size / 2);
    rounds.push(Array.from({ length: size }, () => null));
  }

  return rounds;
}

function applyByesForRound(roundIndex) {
  const round = state.rounds[roundIndex];
  const nextRound = state.rounds[roundIndex + 1];
  if (!round || !nextRound || round.length % 2 === 0) return;

  const byeChampion = round[round.length - 1];
  if (byeChampion) {
    nextRound[nextRound.length - 1] = byeChampion;
  }
}

function pickWinner(choiceIndex) {
  if (state.finished || state.selectedId || state.viewingHistoryEntry) return;

  const match = getCurrentMatch();
  const winner = match[choiceIndex];
  const loser = match[choiceIndex === 0 ? 1 : 0];
  if (!winner) return;

  state.selectedId = winner.id;
  state.choiceLog.push({
    champion: winner,
    roundIndex: state.currentRound,
  });
  recordElimination(loser);
  renderDuel();

  window.setTimeout(() => {
    state.rounds[state.currentRound + 1][state.currentMatch] = winner;
    advanceMatch();
    state.selectedId = null;
    render();
  }, 240);
}

function recordElimination(champion) {
  if (!champion || state.eliminatedIds.has(champion.id)) return;

  state.eliminatedIds.add(champion.id);
  state.eliminationLog.push({
    champion,
    roundIndex: state.currentRound,
    matchIndex: state.currentMatch,
    order: state.eliminationLog.length,
  });
}

function advanceMatch() {
  const matchesInRound = getMatchesInRound(state.currentRound);
  if (state.currentMatch + 1 < matchesInRound) {
    state.currentMatch += 1;
    return;
  }

  if (state.currentRound + 2 < state.rounds.length) {
    state.currentRound += 1;
    state.currentMatch = 0;
    applyByesForRound(state.currentRound);
    return;
  }

  state.finished = true;
  saveCompletedTournament();
}

function getCurrentMatch() {
  const round = state.rounds[state.currentRound] || [];
  return [round[state.currentMatch * 2], round[state.currentMatch * 2 + 1]];
}

function getMatchesInRound(roundIndex) {
  return Math.floor((state.rounds[roundIndex]?.length || 0) / 2);
}

function render() {
  renderStatus();
  renderLines();
  renderOrbit();
  renderDuel();
  renderCenter();
  renderLeaderboard();
  renderHistory();
  renderFinalSummary();
}

function renderStatus() {
  const totalRounds = state.rounds.length - 1;

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
    els.matchMeta.textContent = winner ? winner.title : "Crea otro torneo para seguir.";
    return;
  }

  const roundNumber = state.currentRound + 1;
  const championCount = state.rounds[state.currentRound].filter(Boolean).length;
  const matchesInRound = getMatchesInRound(state.currentRound);
  const byes = state.rounds[state.currentRound].length % 2;
  const [left, right] = getCurrentMatch();
  els.roundLabel.textContent = `Ronda ${roundNumber} de ${totalRounds} - ${championCount} campeones`;
  els.matchTitle.textContent = left && right ? `${left.name} vs ${right.name}` : "Preparando duelo";
  els.matchMeta.textContent = byes
    ? `Duelo ${state.currentMatch + 1} de ${matchesInRound} - 1 pase automatico`
    : `Duelo ${state.currentMatch + 1} de ${matchesInRound}`;
}

function renderDuel() {
  const showFinal = state.finished || state.viewingHistoryEntry;
  els.duelPanel.classList.toggle("hidden", showFinal);
  els.finalPanel.classList.toggle("hidden", !showFinal);
  if (showFinal) return;

  const [left, right] = getCurrentMatch();
  fillChoice(els.leftChoice, left, 0);
  fillChoice(els.rightChoice, right, 1);

  els.rightChoice.style.visibility = "visible";
  document.querySelector(".versus-mark").textContent = "VS";
}

function fillChoice(button, champion, index) {
  button.innerHTML = "";
  button.disabled = !champion || state.finished;
  button.classList.toggle("is-picked", Boolean(champion && champion.id === state.selectedId));

  if (!champion) return;

  const fragment = els.template.content.cloneNode(true);
  fragment.querySelector(".choice-art").style.backgroundImage = `url("${splashUrl(champion)}")`;
  fragment.querySelector(".choice-seed").textContent = index === 0 ? "Elige izquierda" : "Elige derecha";
  fragment.querySelector(".choice-name").textContent = champion.name;
  fragment.querySelector(".choice-title").textContent = champion.title;
  button.appendChild(fragment);
  button.setAttribute("aria-label", `Elegir ${champion.name}`);
}

function renderCenter() {
  const finalWinner = state.viewingHistoryEntry?.winner || state.rounds.at(-1)?.[0];
  const label = els.centerCrown.querySelector("span");
  label.textContent = finalWinner ? finalWinner.name : "Final";
}

function renderOrbit() {
  els.orbit.innerHTML = "";

  const maxRound = state.rounds.length - 1;
  state.rounds.forEach((round, roundIndex) => {
    const radius = radiusForRound(roundIndex, maxRound);
    const count = round.length;

    round.forEach((champion, slotIndex) => {
      const point = polarPoint(slotIndex, count, radius);
      const node = document.createElement("div");
      node.className = "orbit-node";
      node.style.left = `${point.x}%`;
      node.style.top = `${point.y}%`;

      const currentSlots = [state.currentMatch * 2, state.currentMatch * 2 + 1];
      if (!champion) node.classList.add("empty");
      if (champion && state.eliminatedIds.has(champion.id)) node.classList.add("eliminated");
      if (roundIndex > 0 && champion) node.classList.add("winner");
      if (!state.finished && !state.viewingHistoryEntry && roundIndex === state.currentRound && currentSlots.includes(slotIndex)) {
        node.classList.add("current");
      }

      if (champion) {
        const img = document.createElement("img");
        img.src = tileUrl(champion);
        img.alt = champion.name;
        img.decoding = "async";
        img.loading = "lazy";
        node.title = champion.name;
        node.appendChild(img);
      }

      els.orbit.appendChild(node);
    });
  });
}

function renderLines() {
  els.lineLayer.innerHTML = "";
  const maxRound = state.rounds.length - 1;

  for (let roundIndex = 0; roundIndex < maxRound; roundIndex += 1) {
    const fromRound = state.rounds[roundIndex];
    const toRound = state.rounds[roundIndex + 1];
    const fromRadius = radiusForRound(roundIndex, maxRound, 500);
    const toRadius = radiusForRound(roundIndex + 1, maxRound, 500);
    const matchesInRound = Math.floor(fromRound.length / 2);

    for (let matchIndex = 0; matchIndex < matchesInRound; matchIndex += 1) {
      const aIndex = matchIndex * 2;
      const bIndex = aIndex + 1;
      const winner = toRound[matchIndex];
      const a = polarPoint(aIndex, fromRound.length, fromRadius, 500);
      const b = polarPoint(bIndex, fromRound.length, fromRadius, 500);
      const next = polarPoint(matchIndex, toRound.length, toRadius, 500);

      addLine(a, next, Boolean(winner));
      addLine(b, next, Boolean(winner));
      addDot(a, Boolean(fromRound[aIndex]));
      addDot(b, Boolean(fromRound[bIndex]));
      addDot(next, Boolean(winner));
    }

    if (fromRound.length % 2 === 1) {
      const byeIndex = fromRound.length - 1;
      const byeTargetIndex = toRound.length - 1;
      const byeWinner = toRound[byeTargetIndex];
      const byeFrom = polarPoint(byeIndex, fromRound.length, fromRadius, 500);
      const byeTo = polarPoint(byeTargetIndex, toRound.length, toRadius, 500);
      addLine(byeFrom, byeTo, Boolean(byeWinner));
      addDot(byeFrom, Boolean(fromRound[byeIndex]));
      addDot(byeTo, Boolean(byeWinner));
    }
  }
}

function addLine(from, to, hot) {
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("x1", from.x);
  line.setAttribute("y1", from.y);
  line.setAttribute("x2", to.x);
  line.setAttribute("y2", to.y);
  line.setAttribute("class", hot ? "bracket-line hot" : "bracket-line");
  els.lineLayer.appendChild(line);
}

function addDot(point, hot) {
  const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  circle.setAttribute("cx", point.x);
  circle.setAttribute("cy", point.y);
  circle.setAttribute("r", hot ? 4.2 : 3.2);
  circle.setAttribute("class", hot ? "bracket-dot hot" : "bracket-dot");
  els.lineLayer.appendChild(circle);
}

function radiusForRound(roundIndex, maxRound, scale = 50) {
  if (roundIndex === maxRound) return 0;
  const outer = scale * 0.43;
  const inner = scale * 0.11;
  const usableRounds = Math.max(1, maxRound - 1);
  return outer - ((outer - inner) * roundIndex) / usableRounds;
}

function polarPoint(index, count, radius, center = 50) {
  if (radius === 0 || count === 1) return { x: center, y: center };
  const angle = (-90 + (360 / count) * index) * (Math.PI / 180);
  return {
    x: center + Math.cos(angle) * radius,
    y: center + Math.sin(angle) * radius,
  };
}

function renderLeaderboard() {
  const rows = getTournamentTop10();
  renderTopList(els.leaderboardList, rows, "Se completa al terminar");
}

function renderTopList(container, rows, emptyText) {
  container.innerHTML = "";

  if (!rows.length) {
    const empty = document.createElement("li");
    empty.className = "top-empty";
    empty.innerHTML = `<span></span><strong>${emptyText}</strong>`;
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
    img.alt = row.champion.name;
    img.loading = "lazy";

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

  const rows = [
    {
      place: 1,
      champion: finalWinner,
      detail: "Ganador",
    },
  ];

  const eliminated = [...state.eliminationLog].sort(
    (a, b) => b.roundIndex - a.roundIndex || b.order - a.order,
  );

  eliminated.forEach((entry) => {
    if (rows.length >= 10) return;
    if (entry.champion.id === finalWinner.id) return;

    rows.push({
      place: rows.length + 1,
      champion: entry.champion,
      detail: eliminationDetail(entry.roundIndex),
    });
  });

  return rows;
}

function eliminationDetail(roundIndex) {
  const roundsLeft = state.rounds.length - 1 - roundIndex;
  if (roundsLeft === 1) return "Finalista";
  if (roundsLeft === 2) return "Semifinales";
  if (roundsLeft === 3) return "Cuartos";
  return `Ronda ${roundIndex + 1}`;
}

function renderFinalSummary() {
  const summary = getVisibleSummary();
  if (!summary) {
    els.finalPanel.classList.add("hidden");
    return;
  }

  els.finalPanel.classList.remove("hidden");
  els.finalHero.style.backgroundImage = `url("${splashUrl(summary.winner)}")`;
  els.finalWinner.textContent = summary.winner.name;
  els.finalMeta.textContent = `${formatDate(summary.createdAt)} - ${summary.tournamentSize} campeones - ${tagLabel(summary.filterType)}`;
  renderTopList(els.finalTopList, summary.top10, "Sin top disponible");
  renderTypeChart(state.activeChart === "top10" ? summary.typeStatsTop10 : summary.typeStatsChoices);
  updateChartTabs();
}

function getVisibleSummary() {
  if (state.viewingHistoryEntry) return state.viewingHistoryEntry;
  if (!state.finished) return null;

  const winner = state.rounds.at(-1)?.[0];
  if (!winner) return null;

  const top10 = getTournamentTop10();
  return {
    createdAt: new Date().toISOString(),
    dataDragonVersion: state.version,
    filterType: state.activeTag,
    tournamentSize: state.currentEntrants.length,
    winner,
    top10,
    typeStatsTop10: calculateTop10TypeStats(top10),
    typeStatsChoices: calculateChoiceTypeStats(state.choiceLog),
  };
}

function renderTypeChart(stats) {
  const total = tagOrder.reduce((sum, tag) => sum + (stats?.[tag] || 0), 0);
  if (!total) {
    els.typeChart.innerHTML = '<p class="chart-empty">Sin datos todavia.</p>';
    return;
  }

  let current = -90;
  const slices = tagOrder
    .filter((tag) => stats[tag] > 0)
    .map((tag) => {
      const value = stats[tag];
      const angle = (value / total) * 360;
      const slice = {
        tag,
        value,
        start: current,
        end: current + angle,
      };
      current += angle;
      return slice;
    });

  const paths = slices
    .map((slice) => {
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
      <circle cx="50" cy="50" r="21" fill="#111216"></circle>
    </svg>
    <ul class="chart-legend">${legend}</ul>
  `;
}

function polarSvg(cx, cy, r, angle) {
  const radians = (angle * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(radians),
    y: cy + r * Math.sin(radians),
  };
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

function saveCompletedTournament() {
  if (state.tournamentSaved) return;
  const winner = state.rounds.at(-1)?.[0];
  if (!winner) return;

  const top10 = getTournamentTop10();
  const entry = {
    id: `${Date.now()}-${winner.id}`,
    createdAt: new Date().toISOString(),
    dataDragonVersion: state.version,
    filterType: state.activeTag,
    tournamentSize: state.currentEntrants.length,
    winner: serializeChampion(winner),
    top10: top10.map((row) => ({
      place: row.place,
      champion: serializeChampion(row.champion),
      detail: row.detail,
    })),
    typeStatsTop10: calculateTop10TypeStats(top10),
    typeStatsChoices: calculateChoiceTypeStats(state.choiceLog),
  };

  const history = [entry, ...readHistory()].slice(0, 25);
  localStorage.setItem(historyKey, JSON.stringify(history));
  state.tournamentSaved = true;
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

function renderHistory() {
  const history = readHistory();
  els.historyList.innerHTML = "";

  if (!history.length) {
    const empty = document.createElement("p");
    empty.className = "history-empty";
    empty.textContent = "Aun no hay torneos terminados.";
    els.historyList.appendChild(empty);
    return;
  }

  history.slice(0, 5).forEach((entry) => {
    const card = document.createElement("article");
    card.className = "history-card";

    const topThree = entry.top10
      .slice(0, 3)
      .map((row) => row.champion.name)
      .join(", ");

    card.innerHTML = `
      <img src="${iconUrl(entry.winner)}" alt="${entry.winner.name}" loading="lazy">
      <span>
        <strong>${entry.winner.name}</strong>
        <small>${formatDate(entry.createdAt)} - ${tagLabel(entry.filterType)}</small>
        <em>${topThree}</em>
      </span>
      <button type="button" data-history-id="${entry.id}">Abrir</button>
    `;
    els.historyList.appendChild(card);
  });
}

function readHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(historyKey));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function showHistoryEntry(id) {
  const entry = readHistory().find((item) => item.id === id);
  if (!entry) return;
  state.viewingHistoryEntry = entry;
  state.activeChart = "top10";
  renderStatus();
  renderDuel();
  renderCenter();
  renderFinalSummary();
}

function formatHistoryMeta(entry) {
  return `${formatDate(entry.createdAt)} - ${entry.tournamentSize} campeones - ${tagLabel(entry.filterType)}`;
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

async function shareResult() {
  const text = buildSummaryText();
  if (navigator.share && (state.finished || state.viewingHistoryEntry)) {
    await navigator.share({ title: "LoL Champion Cup", text }).catch(() => undefined);
    return;
  }
  await writeClipboard(text);
}

async function copySummary() {
  await writeClipboard(buildSummaryText());
}

async function writeClipboard(text) {
  await navigator.clipboard?.writeText(text).catch(() => undefined);
  showToast("Resumen copiado.");
}

function buildSummaryText() {
  const summary = getVisibleSummary();
  if (!summary) return "Estoy jugando Champion Cup de League of Legends.";

  const topLine = summary.top10
    .slice(0, 10)
    .map((row) => `${row.place}. ${row.champion.name}`)
    .join(" | ");
  const stats = summary.typeStatsTop10;
  const favoriteType = tagOrder
    .map((tag) => ({ tag, value: stats[tag] || 0 }))
    .sort((a, b) => b.value - a.value)[0]?.tag;

  return [
    `Mi campeon favorito en Champion Cup es ${summary.winner.name}.`,
    `Filtro: ${tagLabel(summary.filterType)} - ${summary.tournamentSize} campeones.`,
    `Tipo favorito: ${tagLabel(favoriteType)}.`,
    `Top 10: ${topLine}`,
  ].join("\n");
}

function resetBracketView(showMessage = true) {
  const isMega = els.bracketBoard.classList.contains("mega");
  const visibleWidth = els.arena.clientWidth || window.innerWidth;
  const boardWidth = els.bracketBoard.offsetWidth || visibleWidth;

  state.view.x = 0;
  state.view.y = 0;
  state.view.scale = isMega ? clamp((visibleWidth * 1.55) / boardWidth, 0.84, 1.08) : 1;
  updateBoardTransform();
  if (showMessage) showToast("Bracket centrado.");
}

function zoomBracket(event) {
  if (event.target.closest(".duel-panel, .final-panel")) return;
  event.preventDefault();

  const oldScale = state.view.scale;
  const nextScale = clamp(oldScale * Math.exp(-event.deltaY * 0.0015), 0.55, 3.2);
  const rect = els.arena.getBoundingClientRect();
  const screenX = event.clientX - (rect.left + rect.width / 2);
  const screenY = event.clientY - (rect.top + rect.height / 2);
  const localX = (screenX - state.view.x) / oldScale;
  const localY = (screenY - state.view.y) / oldScale;

  state.view.scale = nextScale;
  state.view.x = screenX - localX * nextScale;
  state.view.y = screenY - localY * nextScale;
  updateBoardTransform();
}

function startBracketDrag(event) {
  if (event.button !== 0 || event.target.closest(".duel-panel, .final-panel, button, select")) return;

  state.view.dragging = true;
  state.view.pointerId = event.pointerId;
  state.view.startX = event.clientX;
  state.view.startY = event.clientY;
  state.view.originX = state.view.x;
  state.view.originY = state.view.y;
  els.arena.classList.add("is-dragging");
  els.arena.setPointerCapture(event.pointerId);
}

function moveBracketDrag(event) {
  if (!state.view.dragging || event.pointerId !== state.view.pointerId) return;

  state.view.x = state.view.originX + event.clientX - state.view.startX;
  state.view.y = state.view.originY + event.clientY - state.view.startY;
  updateBoardTransform();
}

function endBracketDrag(event) {
  if (!state.view.dragging || event.pointerId !== state.view.pointerId) return;

  state.view.dragging = false;
  state.view.pointerId = null;
  els.arena.classList.remove("is-dragging");
  if (els.arena.hasPointerCapture(event.pointerId)) {
    els.arena.releasePointerCapture(event.pointerId);
  }
}

function updateBoardTransform() {
  els.bracketBoard.style.setProperty("--pan-x", `${state.view.x}px`);
  els.bracketBoard.style.setProperty("--pan-y", `${state.view.y}px`);
  els.bracketBoard.style.setProperty("--zoom", state.view.scale);
}

function iconUrl(champion) {
  return `https://ddragon.leagueoflegends.com/cdn/${state.version}/img/champion/${champion.image.full}`;
}

function tileUrl(champion) {
  return `https://ddragon.leagueoflegends.com/cdn/img/champion/tiles/${champion.id}_0.jpg`;
}

function splashUrl(champion) {
  return `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${champion.id}_0.jpg`;
}

function showToast(message) {
  document.querySelector(".toast")?.remove();
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), 2300);
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
