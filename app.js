const state = {
  version: "16.13.1",
  champions: [],
  rounds: [],
  currentRound: 0,
  currentMatch: 0,
  selectedId: null,
  tournamentSize: "all",
  eliminatedIds: new Set(),
  eliminationLog: [],
  finished: false,
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
  sizeSelect: document.querySelector("#sizeSelect"),
  newTournament: document.querySelector("#newTournament"),
  shareWinner: document.querySelector("#shareWinner"),
  clearStats: document.querySelector("#clearStats"),
  roundLabel: document.querySelector("#roundLabel"),
  matchTitle: document.querySelector("#matchTitle"),
  matchMeta: document.querySelector("#matchMeta"),
  versionNote: document.querySelector("#versionNote"),
  leaderboardList: document.querySelector("#leaderboardList"),
  lineLayer: document.querySelector("#lineLayer"),
  orbit: document.querySelector("#orbit"),
  centerCrown: document.querySelector("#centerCrown"),
  leftChoice: document.querySelector("#leftChoice"),
  rightChoice: document.querySelector("#rightChoice"),
  template: document.querySelector("#choiceTemplate"),
};

const fallbackChampions = [
  ["Aatrox", "Aatrox", "la Espada Darkin"],
  ["Ahri", "Ahri", "la Vastaya de Nueve Colas"],
  ["Akali", "Akali", "la Asesina Sigilosa"],
  ["Ashe", "Ashe", "la Arquera de Hielo"],
  ["Darius", "Darius", "la Mano de Noxus"],
  ["Ekko", "Ekko", "el Chico que Fragmentó el Tiempo"],
  ["Jinx", "Jinx", "la Bala Perdida"],
  ["Kaisa", "Kai'Sa", "la Hija del Vacío"],
  ["Lux", "Lux", "la Dama Luminosa"],
  ["Sett", "Sett", "el Jefe"],
  ["Yasuo", "Yasuo", "el Imperdonable"],
  ["Zed", "Zed", "el Maestro de las Sombras"],
].map(([id, name, title]) => ({ id, name, title, tags: [], image: { full: `${id}.png` } }));

const statKey = "lol-champion-cup-stats";

async function init() {
  bindEvents();
  renderLeaderboard();
  await loadChampions();
  startTournament();
}

function bindEvents() {
  els.newTournament.addEventListener("click", startTournament);
  els.sizeSelect.addEventListener("change", () => {
    state.tournamentSize = getSelectedTournamentSize();
    startTournament();
  });
  els.leftChoice.addEventListener("click", () => pickWinner(0));
  els.rightChoice.addEventListener("click", () => pickWinner(1));
  els.shareWinner.addEventListener("click", shareResult);
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
    updateSizeOptions();
    els.versionNote.textContent = `${state.champions.length} campeones · Data Dragon ${state.version}`;
  } catch (error) {
    state.champions = fallbackChampions;
    updateSizeOptions();
    els.versionNote.textContent = `${state.champions.length} campeones · modo local`;
    showToast("No pude cargar Riot ahora mismo. He usado una lista local.");
  }
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function startTournament() {
  if (!state.champions.length) return;

  state.tournamentSize = getSelectedTournamentSize();
  state.currentRound = 0;
  state.currentMatch = 0;
  state.selectedId = null;
  state.eliminatedIds = new Set();
  state.eliminationLog = [];
  state.finished = false;

  const entrants = shuffle([...state.champions]).slice(0, state.tournamentSize);
  state.rounds = buildRounds(entrants);
  applyByesForRound(0);

  els.bracketBoard.classList.toggle("mega", entrants.length > 64);
  els.bracketBoard.classList.toggle("dense", entrants.length > 32 && entrants.length <= 64);
  resetBracketView(false);

  render();
}

function updateSizeOptions() {
  const allOption = els.sizeSelect.querySelector('option[value="all"]');
  if (allOption) {
    allOption.textContent = `Todos (${state.champions.length})`;
  }

  [...els.sizeSelect.options].forEach((option) => {
    if (option.value !== "all") {
      option.disabled = Number(option.value) > state.champions.length;
    }
  });
}

function getSelectedTournamentSize() {
  return els.sizeSelect.value === "all"
    ? state.champions.length
    : Math.min(Number(els.sizeSelect.value), state.champions.length);
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
  if (state.finished || state.selectedId) return;

  const match = getCurrentMatch();
  const winner = match[choiceIndex];
  const loser = match[choiceIndex === 0 ? 1 : 0];
  if (!winner) return;

  state.selectedId = winner.id;
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
  const winner = state.rounds.at(-1)[0];
  if (winner) saveWinner(winner);
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
}

function renderStatus() {
  const totalRounds = state.rounds.length - 1;

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
  els.roundLabel.textContent = `Ronda ${roundNumber} de ${totalRounds} · ${championCount} campeones`;
  els.matchTitle.textContent = left && right ? `${left.name} vs ${right.name}` : "Preparando duelo";
  els.matchMeta.textContent = byes
    ? `Duelo ${state.currentMatch + 1} de ${matchesInRound} · 1 pase automático`
    : `Duelo ${state.currentMatch + 1} de ${matchesInRound}`;
}

function renderDuel() {
  const winner = state.finished ? state.rounds.at(-1)[0] : null;
  const [left, right] = state.finished ? [winner, null] : getCurrentMatch();

  fillChoice(els.leftChoice, left, 0);
  fillChoice(els.rightChoice, right, 1);

  els.rightChoice.style.visibility = state.finished ? "hidden" : "visible";
  document.querySelector(".versus-mark").textContent = state.finished ? "★" : "VS";
}

function fillChoice(button, champion, index) {
  button.innerHTML = "";
  button.disabled = !champion || state.finished;
  button.classList.toggle("is-picked", Boolean(champion && champion.id === state.selectedId));

  if (!champion) return;

  const fragment = els.template.content.cloneNode(true);
  fragment.querySelector(".choice-art").style.backgroundImage = `url("${splashUrl(champion)}")`;
  fragment.querySelector(".choice-seed").textContent = state.finished
    ? "Campeón"
    : index === 0
      ? "Elige izquierda"
      : "Elige derecha";
  fragment.querySelector(".choice-name").textContent = champion.name;
  fragment.querySelector(".choice-title").textContent = champion.title;
  button.appendChild(fragment);
  button.setAttribute("aria-label", `Elegir ${champion.name}`);
}

function renderCenter() {
  const finalWinner = state.rounds.at(-1)?.[0];
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
      if (!state.finished && roundIndex === state.currentRound && currentSlots.includes(slotIndex)) {
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

function iconUrl(champion) {
  return `https://ddragon.leagueoflegends.com/cdn/${state.version}/img/champion/${champion.image.full}`;
}

function tileUrl(champion) {
  return `https://ddragon.leagueoflegends.com/cdn/img/champion/tiles/${champion.id}_0.jpg`;
}

function splashUrl(champion) {
  return `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${champion.id}_0.jpg`;
}

function saveWinner(champion) {
  const stats = readStats();
  const current = stats[champion.id] || { wins: 0, name: champion.name, image: champion.image.full };
  stats[champion.id] = {
    ...current,
    wins: current.wins + 1,
    name: champion.name,
    image: champion.image.full,
  };
  localStorage.setItem(statKey, JSON.stringify(stats));
}

function renderLeaderboard() {
  const rows = getTournamentTop10();

  els.leaderboardList.innerHTML = "";

  if (!rows.length) {
    const empty = document.createElement("li");
    empty.className = "top-empty";
    empty.innerHTML = "<span></span><strong>Se completa al terminar</strong>";
    els.leaderboardList.appendChild(empty);
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
    els.leaderboardList.appendChild(li);
  });
}

function getTournamentTop10() {
  const rows = [];
  const finalWinner = state.finished ? state.rounds.at(-1)?.[0] : null;

  if (!finalWinner) return rows;

  rows.push({
    place: 1,
    champion: finalWinner,
    detail: "Ganador",
  });

  const eliminated = [...state.eliminationLog].sort(
    (a, b) => b.roundIndex - a.roundIndex || b.order - a.order,
  );

  eliminated.forEach((entry) => {
    if (rows.length >= 10) return;
    if (finalWinner && entry.champion.id === finalWinner.id) return;

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
  if (event.target.closest(".duel-panel")) return;
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
  if (event.button !== 0 || event.target.closest(".duel-panel, button, select")) return;

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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function readStats() {
  try {
    return JSON.parse(localStorage.getItem(statKey)) || {};
  } catch {
    return {};
  }
}

async function shareResult() {
  const winner = state.rounds.at(-1)?.[0];
  const text = winner
    ? `Mi campeón favorito en Champion Cup es ${winner.name}.`
    : "Estoy jugando Champion Cup de League of Legends.";

  if (navigator.share) {
    await navigator.share({ title: "LoL Champion Cup", text }).catch(() => undefined);
    return;
  }

  await navigator.clipboard?.writeText(text).catch(() => undefined);
  showToast("Resultado copiado.");
}

function showToast(message) {
  document.querySelector(".toast")?.remove();
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), 2300);
}

function shuffle(items) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

init();
