import { historyEvents } from "./data/events.js";

const state = {
  round: 1,
  score: 0,
  streak: 0,
  locked: false,
};

const elements = {
  score: document.querySelector("#score"),
  streak: document.querySelector("#streak"),
  best: document.querySelector("#best"),
  round: document.querySelector("#round"),
  feedback: document.querySelector("#feedback"),
  earlier: document.querySelector("#earlier"),
  later: document.querySelector("#later"),
  reset: document.querySelector("#reset"),
  baseRegion: document.querySelector("#base-region"),
  baseTitle: document.querySelector("#base-title"),
  baseYear: document.querySelector("#base-year"),
  baseClue: document.querySelector("#base-clue"),
  candidateRegion: document.querySelector("#candidate-region"),
  candidateTitle: document.querySelector("#candidate-title"),
  candidateClue: document.querySelector("#candidate-clue"),
};

function formatYear(year) {
  return year < 0 ? `西元前 ${Math.abs(year)} 年` : `${year} 年`;
}

function pickRound(seed) {
  const first = historyEvents[seed % historyEvents.length];
  let second = historyEvents[(seed * 3 + 4) % historyEvents.length];

  if (first.id === second.id) {
    second = historyEvents[(seed + 1) % historyEvents.length];
  }

  return [first, second];
}

function getBestStreak() {
  return Number(localStorage.getItem("historygame-best") || 0);
}

function setBestStreak(value) {
  localStorage.setItem("historygame-best", String(value));
}

function render() {
  const [base, candidate] = pickRound(state.round);
  const best = Math.max(getBestStreak(), state.streak);

  elements.score.textContent = `分數 ${state.score}`;
  elements.streak.textContent = `連勝 ${state.streak}`;
  elements.best.textContent = `最佳 ${best}`;
  elements.round.textContent = `第 ${state.round} 回合`;
  elements.earlier.disabled = state.locked;
  elements.later.disabled = state.locked;

  elements.baseRegion.textContent = base.region;
  elements.baseTitle.textContent = base.title;
  elements.baseYear.textContent = formatYear(base.year);
  elements.baseClue.textContent = base.clue;

  elements.candidateRegion.textContent = candidate.region;
  elements.candidateTitle.textContent = candidate.title;
  elements.candidateClue.textContent = candidate.clue;
}

function answer(choice) {
  if (state.locked) return;

  const [base, candidate] = pickRound(state.round);
  const correct = candidate.year < base.year ? "earlier" : "later";
  const isCorrect = choice === correct;

  state.locked = true;
  state.streak = isCorrect ? state.streak + 1 : 0;
  state.score += isCorrect ? 100 + state.streak * 20 : 0;
  setBestStreak(Math.max(getBestStreak(), state.streak));

  elements.feedback.textContent = isCorrect
    ? `正確：${candidate.title} 是 ${formatYear(candidate.year)}。`
    : `答錯了：${candidate.title} 是 ${formatYear(candidate.year)}。`;

  render();

  window.setTimeout(() => {
    state.round += 1;
    state.locked = false;
    render();
  }, 900);
}

function resetGame() {
  state.round = 1;
  state.score = 0;
  state.streak = 0;
  state.locked = false;
  elements.feedback.textContent = "判斷右側事件比左側事件更早或更晚。";
  render();
}

elements.earlier.addEventListener("click", () => answer("earlier"));
elements.later.addEventListener("click", () => answer("later"));
elements.reset.addEventListener("click", resetGame);

render();
