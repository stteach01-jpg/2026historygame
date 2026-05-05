const BOARD_SIZE = 36;
const FINISH = BOARD_SIZE - 1;
const PLAYER_COLORS = ["#d94f30", "#1f6f8b", "#5f5aa2", "#317b22", "#b45f06", "#7a3e75"];
const boardQuestions = window.boardQuestions;

const state = {
  players: [],
  currentPlayerIndex: 0,
  round: 0,
  dice: null,
  pendingQuestion: null,
  usedQuestionKeys: new Set(),
  teacherLog: [],
  answerRevealed: false,
  winner: null,
};

const elements = {
  setupPanel: document.querySelector("#setup-panel"),
  playLayout: document.querySelector("#play-layout"),
  loginForm: document.querySelector("#login-form"),
  playerId: document.querySelector("#player-id"),
  setupPlayerList: document.querySelector("#setup-player-list"),
  setupMessage: document.querySelector("#setup-message"),
  startGame: document.querySelector("#start-game"),
  board: document.querySelector("#board"),
  turnLabel: document.querySelector("#turn-label"),
  diceLabel: document.querySelector("#dice-label"),
  roundLabel: document.querySelector("#round-label"),
  toggleTeacher: document.querySelector("#toggle-teacher"),
  toggleProjector: document.querySelector("#toggle-projector"),
  currentPlayer: document.querySelector("#current-player"),
  positionLabel: document.querySelector("#position-label"),
  rollDice: document.querySelector("#roll-dice"),
  questionCard: document.querySelector("#question-card"),
  questionMeta: document.querySelector("#question-meta"),
  questionTitle: document.querySelector("#question-title"),
  answers: document.querySelector("#answers"),
  message: document.querySelector("#message"),
  playerList: document.querySelector("#player-list"),
  projectionPlayer: document.querySelector("#projection-player"),
  projectionPosition: document.querySelector("#projection-position"),
  projectionDice: document.querySelector("#projection-dice"),
  projectionMeta: document.querySelector("#projection-meta"),
  projectionQuestion: document.querySelector("#projection-question"),
  projectionAnswers: document.querySelector("#projection-answers"),
  projectionAnswer: document.querySelector("#projection-answer"),
  teacherPanel: document.querySelector("#teacher-panel"),
  questionCount: document.querySelector("#question-count"),
  revealAnswer: document.querySelector("#reveal-answer"),
  markCorrect: document.querySelector("#mark-correct"),
  markWrong: document.querySelector("#mark-wrong"),
  forceNext: document.querySelector("#force-next"),
  teacherLog: document.querySelector("#teacher-log"),
  reset: document.querySelector("#reset"),
};

function boardDisplayOrder() {
  const rows = [];

  for (let row = 5; row >= 0; row -= 1) {
    const start = row * 6;
    const cells = Array.from({ length: 6 }, (_, index) => start + index);
    rows.push(row % 2 === 0 ? cells : cells.reverse());
  }

  return rows.flat();
}

function getQuestion(square) {
  return boardQuestions.find((question) => question.square === square);
}

function questionKey(question, index) {
  return question.id ?? `${question.square}-${index}-${question.question}`;
}

function getNextQuestion(square) {
  const exactSquareCandidates = boardQuestions
    .map((question, index) => ({ question, key: questionKey(question, index) }))
    .filter((entry) => entry.question.square === square && !state.usedQuestionKeys.has(entry.key));

  const candidates =
    exactSquareCandidates.length > 0
      ? exactSquareCandidates
      : boardQuestions
          .map((question, index) => ({ question, key: questionKey(question, index) }))
          .filter((entry) => !state.usedQuestionKeys.has(entry.key));

  if (candidates.length === 0) return null;

  const picked = candidates[Math.floor(Math.random() * candidates.length)];
  state.usedQuestionKeys.add(picked.key);
  return picked.question;
}

function getCurrentPlayer() {
  return state.players[state.currentPlayerIndex];
}

function playerLabel(player) {
  return player.id;
}

function normalizePlayerId(value) {
  return value.trim().toUpperCase();
}

function isValidPlayerId(value) {
  return /^\d{3}-\d{2}$/.test(value);
}

function describeSquare(square) {
  if (square === 0) return "起點";
  if (square === FINISH) return "終點";
  return `第 ${square} 格`;
}

function addPlayer(id) {
  const normalized = normalizePlayerId(id);

  if (!isValidPlayerId(normalized)) {
    setMessage("請輸入班級與座號，例如 902-02。");
    return;
  }

  if (state.players.some((player) => player.id === normalized)) {
    setMessage(`${normalized} 已經加入。`);
    return;
  }

  if (state.players.length >= PLAYER_COLORS.length) {
    setMessage("目前最多支援 6 位玩家。");
    return;
  }

  state.players.push({
    id: normalized,
    position: 0,
    previousPosition: 0,
    color: PLAYER_COLORS[state.players.length],
  });

  elements.playerId.value = "";
  setMessage(`${normalized} 已加入。`);
  renderSetupPlayers();
}

function startGame() {
  if (state.players.length === 0) {
    setMessage("請至少加入 1 位玩家。");
    return;
  }

  state.round = 1;
  state.currentPlayerIndex = 0;
  state.dice = null;
  state.pendingQuestion = null;
  state.usedQuestionKeys = new Set();
  state.teacherLog = [];
  state.answerRevealed = false;
  state.winner = null;
  elements.setupPanel.classList.add("is-hidden");
  elements.playLayout.classList.remove("is-hidden");
  setMessage("輪到第一位玩家擲骰子。");
  render();
}

function rollDice() {
  const player = getCurrentPlayer();

  if (!player || state.pendingQuestion || state.winner) return;

  const dice = Math.floor(Math.random() * 6) + 1;
  const from = player.position;
  const to = Math.min(FINISH, from + dice);
  const question = getNextQuestion(to);

  state.dice = dice;
  player.previousPosition = from;
  player.position = to;

  if (!question) {
    setMessage("本局題庫已全部使用，請重新開始一局。");
    render();
    return;
  }

  state.pendingQuestion = {
    playerIndex: state.currentPlayerIndex,
    from,
    to,
    question,
    choiceOrder: shuffledChoiceOrder(question.choices.length),
  };
  state.answerRevealed = false;
  addTeacherLog(`${playerLabel(player)} 擲出 ${dice}，從${describeSquare(from)}到${describeSquare(to)}。`);

  setMessage(`${playerLabel(player)} 擲出 ${dice}，前進到${describeSquare(to)}。答對才能留在這裡。`);
  render();
}

function answerQuestion(choiceIndex) {
  const pending = state.pendingQuestion;
  if (!pending) return;

  const isCorrect = choiceIndex === pending.question.answer;
  resolveQuestion(isCorrect);
}

function resolveQuestion(isCorrect) {
  const pending = state.pendingQuestion;
  if (!pending) return;

  const player = state.players[pending.playerIndex];

  if (isCorrect) {
    if (pending.to === FINISH) {
      state.winner = player;
      state.pendingQuestion = null;
      state.answerRevealed = false;
      addTeacherLog(`${playerLabel(player)} 答對終點題並獲勝。`);
      setMessage(`${playerLabel(player)} 答對終點題，獲勝！`);
      render();
      return;
    }

    addTeacherLog(`${playerLabel(player)} 答對，停在${describeSquare(pending.to)}。`);
    setMessage(`答對！${playerLabel(player)} 留在${describeSquare(pending.to)}。${pending.question.explanation}`);
  } else {
    player.position = pending.from;
    addTeacherLog(`${playerLabel(player)} 答錯，退回${describeSquare(pending.from)}。`);
    setMessage(
      `答錯，${playerLabel(player)} 退回${describeSquare(pending.from)}。正解：${
        pending.question.choices[pending.question.answer]
      }。${pending.question.explanation}`,
    );
  }

  state.pendingQuestion = null;
  state.answerRevealed = false;
  advanceTurn();
  render();
}

function revealAnswer() {
  if (!state.pendingQuestion) {
    setMessage("目前沒有待答題目。");
    return;
  }

  state.answerRevealed = true;
  addTeacherLog(`顯示答案：${state.pendingQuestion.question.choices[state.pendingQuestion.question.answer]}`);
  render();
}

function forceNextTurn() {
  if (state.winner) return;

  if (state.pendingQuestion) {
    const pending = state.pendingQuestion;
    const player = state.players[pending.playerIndex];
    player.position = pending.from;
    state.pendingQuestion = null;
    state.answerRevealed = false;
    addTeacherLog(`${playerLabel(player)} 的題目略過，回到${describeSquare(pending.from)}。`);
    setMessage(`${playerLabel(player)} 的題目已略過，回到${describeSquare(pending.from)}。`);
  } else {
    addTeacherLog("教師手動切換到下一位玩家。");
    setMessage("已切換到下一位玩家。");
  }

  advanceTurn();
  render();
}

function advanceTurn() {
  if (state.players.length === 0) return;

  state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
  if (state.currentPlayerIndex === 0) {
    state.round += 1;
  }
}

function resetGame() {
  state.players = [];
  state.currentPlayerIndex = 0;
  state.round = 0;
  state.dice = null;
  state.pendingQuestion = null;
  state.usedQuestionKeys = new Set();
  state.teacherLog = [];
  state.answerRevealed = false;
  state.winner = null;
  elements.setupPanel.classList.remove("is-hidden");
  elements.playLayout.classList.add("is-hidden");
  elements.playerId.value = "";
  setMessage("加入玩家後開始遊戲。");
  renderSetupPlayers();
  render();
}

function addTeacherLog(message) {
  state.teacherLog.unshift(`${new Date().toLocaleTimeString("zh-TW", { hour12: false })} ${message}`);
  state.teacherLog = state.teacherLog.slice(0, 8);
}

function setMessage(message) {
  elements.message.textContent = message;
  elements.setupMessage.textContent = message;
}

function shuffledChoiceOrder(length) {
  const order = Array.from({ length }, (_, index) => index);

  for (let index = order.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [order[index], order[swapIndex]] = [order[swapIndex], order[index]];
  }

  return order;
}

function renderSetupPlayers() {
  elements.setupPlayerList.innerHTML = "";

  if (state.players.length === 0) {
    elements.setupPlayerList.innerHTML = '<span class="empty-state">尚未加入玩家</span>';
    return;
  }

  state.players.forEach((player) => {
    const tag = document.createElement("span");
    tag.className = "player-tag";
    tag.style.setProperty("--player-color", player.color);
    tag.textContent = playerLabel(player);
    elements.setupPlayerList.append(tag);
  });
}

function renderBoard() {
  elements.board.innerHTML = "";

  boardDisplayOrder().forEach((square) => {
    const cell = document.createElement("div");
    const question = getQuestion(square);
    const playersHere = state.players.filter((player) => player.position === square);

    cell.className = "board-cell";
    if (square === 0) cell.classList.add("start-cell");
    if (square === FINISH) cell.classList.add("finish-cell");
    if (state.pendingQuestion?.to === square) cell.classList.add("active-cell");

    const label = document.createElement("span");
    label.className = "cell-number";
    label.textContent = square === 0 ? "起點" : square === FINISH ? "終點" : String(square);

    const title = document.createElement("strong");
    title.textContent = square === 0 ? "登入出發" : question?.unit ?? "歷史挑戰";

    const grade = document.createElement("span");
    grade.className = "cell-grade";
    grade.textContent = square === 0 ? "START" : question?.grade ?? "";

    const tokens = document.createElement("div");
    tokens.className = "tokens";
    playersHere.forEach((player) => {
      const token = document.createElement("span");
      token.className = "token";
      token.style.setProperty("--player-color", player.color);
      token.textContent = player.id.slice(-2);
      tokens.append(token);
    });

    cell.append(label, title, grade, tokens);
    elements.board.append(cell);
  });
}

function renderQuestion() {
  const pending = state.pendingQuestion;
  elements.answers.innerHTML = "";

  if (!pending) {
    elements.questionCard.classList.add("is-hidden");
    return;
  }

  const { question, to } = pending;
  elements.questionCard.classList.remove("is-hidden");
  elements.questionMeta.textContent = `${describeSquare(to)}｜${question.grade}｜${question.unit}`;
  elements.questionTitle.textContent = question.question;

  pending.choiceOrder.forEach((choiceIndex) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = question.choices[choiceIndex];
    button.addEventListener("click", () => answerQuestion(choiceIndex));
    elements.answers.append(button);
  });
}

function renderProjection() {
  const player = getCurrentPlayer();
  const pending = state.pendingQuestion;
  elements.projectionAnswers.innerHTML = "";

  elements.projectionPlayer.textContent = player ? `目前玩家 ${playerLabel(player)}` : "目前玩家 -";
  elements.projectionPosition.textContent = player ? `位置：${describeSquare(player.position)}` : "位置：起點";
  elements.projectionDice.textContent = state.dice ? `骰子 ${state.dice}` : "骰子 -";

  if (!pending) {
    elements.projectionMeta.textContent = state.winner ? "比賽結束" : "等待擲骰";
    elements.projectionQuestion.textContent = state.winner
      ? `${playerLabel(state.winner)} 獲勝！`
      : "請看棋盤與教師操作，輪到玩家時擲骰。";
    elements.projectionAnswer.classList.add("is-hidden");
    return;
  }

  const { question, to } = pending;
  elements.projectionMeta.textContent = `${describeSquare(to)}｜${question.grade}｜${question.unit}`;
  elements.projectionQuestion.textContent = question.question;

  pending.choiceOrder.forEach((choiceIndex, displayIndex) => {
    const choice = document.createElement("div");
    choice.className = "projection-choice";
    if (state.answerRevealed && choiceIndex === question.answer) choice.classList.add("is-answer");
    choice.textContent = `${String.fromCharCode(65 + displayIndex)}. ${question.choices[choiceIndex]}`;
    elements.projectionAnswers.append(choice);
  });

  if (state.answerRevealed) {
    elements.projectionAnswer.classList.remove("is-hidden");
    elements.projectionAnswer.textContent = `正解：${question.choices[question.answer]}｜${question.explanation}`;
  } else {
    elements.projectionAnswer.classList.add("is-hidden");
  }
}

function renderPlayers() {
  elements.playerList.innerHTML = "";

  state.players.forEach((player, index) => {
    const row = document.createElement("div");
    row.className = "player-row";
    if (index === state.currentPlayerIndex && !state.winner) row.classList.add("is-current");

    const dot = document.createElement("span");
    dot.className = "player-dot";
    dot.style.setProperty("--player-color", player.color);

    const name = document.createElement("strong");
    name.textContent = playerLabel(player);

    const position = document.createElement("span");
    position.textContent = describeSquare(player.position);

    row.append(dot, name, position);
    elements.playerList.append(row);
  });
}

function renderStatus() {
  const player = getCurrentPlayer();

  elements.turnLabel.textContent = state.winner
    ? `勝利 ${playerLabel(state.winner)}`
    : player
      ? `輪到 ${playerLabel(player)}`
      : "尚未開始";
  elements.diceLabel.textContent = state.dice ? `骰子 ${state.dice}` : "骰子 -";
  elements.roundLabel.textContent = `第 ${state.round} 回合`;
  elements.currentPlayer.textContent = player ? playerLabel(player) : "-";
  elements.positionLabel.textContent = player ? `位置：${describeSquare(player.position)}` : "位置：起點";
  elements.rollDice.disabled = Boolean(state.pendingQuestion || state.winner);
  elements.questionCount.textContent = `已出題 ${state.usedQuestionKeys.size} / ${boardQuestions.length}`;
  elements.revealAnswer.disabled = !state.pendingQuestion;
  elements.markCorrect.disabled = !state.pendingQuestion;
  elements.markWrong.disabled = !state.pendingQuestion;
  elements.forceNext.disabled = state.players.length === 0 || Boolean(state.winner);
  elements.teacherLog.textContent = state.teacherLog.length > 0 ? state.teacherLog.join("\n") : "尚未開始課堂紀錄。";
}

function render() {
  renderBoard();
  renderQuestion();
  renderProjection();
  renderPlayers();
  renderStatus();
}

elements.loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addPlayer(elements.playerId.value);
});
elements.startGame.addEventListener("click", startGame);
elements.rollDice.addEventListener("click", rollDice);
elements.toggleTeacher.addEventListener("click", () => {
  elements.teacherPanel.classList.toggle("is-collapsed");
});
elements.toggleProjector.addEventListener("click", () => {
  document.body.classList.toggle("projection-mode");
  elements.toggleProjector.textContent = document.body.classList.contains("projection-mode") ? "返回棋盤" : "投影模式";
});
elements.revealAnswer.addEventListener("click", revealAnswer);
elements.markCorrect.addEventListener("click", () => resolveQuestion(true));
elements.markWrong.addEventListener("click", () => resolveQuestion(false));
elements.forceNext.addEventListener("click", forceNextTurn);
elements.reset.addEventListener("click", resetGame);

renderSetupPlayers();
render();
