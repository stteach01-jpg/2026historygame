const BOARD_SIZE = 36;
const FINISH = BOARD_SIZE - 1;
const PLAYER_COLORS = ["#d94f30", "#1f6f8b", "#5f5aa2", "#317b22", "#b45f06", "#7a3e75"];
const boardQuestions = window.boardQuestions;
const firebaseConfig = window.historyGameFirebaseConfig;
const firebaseReady = Boolean(window.firebase && firebaseConfig);
const firebaseApp = firebaseReady ? firebase.initializeApp(firebaseConfig) : null;
const auth = firebaseReady ? firebaseApp.auth() : null;
const db = firebaseReady ? firebaseApp.firestore() : null;

const state = {
  mode: "local",
  role: "teacher",
  roomCode: "",
  devicePlayerId: "",
  roomData: null,
  unsubscribeRoom: null,
  unsubscribePlayers: null,
  unsubscribeActions: null,
  players: [],
  currentPlayerIndex: 0,
  round: 0,
  dice: null,
  pendingQuestion: null,
  usedQuestionKeys: new Set(),
  teacherLog: [],
  remoteActions: [],
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
  roomCode: document.querySelector("#room-code"),
  createRoom: document.querySelector("#create-room"),
  joinRoomTeacher: document.querySelector("#join-room-teacher"),
  joinRoomStudent: document.querySelector("#join-room-student"),
  useLocal: document.querySelector("#use-local"),
  roomStatus: document.querySelector("#room-status"),
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
  questionModal: document.querySelector("#question-modal"),
  modalQuestionMeta: document.querySelector("#modal-question-meta"),
  modalQuestionTitle: document.querySelector("#modal-question-title"),
  modalAnswers: document.querySelector("#modal-answers"),
  modalNote: document.querySelector("#modal-note"),
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
  resetRoom: document.querySelector("#reset-room"),
  clearPlayers: document.querySelector("#clear-players"),
  exportRecord: document.querySelector("#export-record"),
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

function getRoomRef() {
  return db.collection("rooms").doc(state.roomCode);
}

function getPlayersRef() {
  return getRoomRef().collection("players");
}

function getActionsRef() {
  return getRoomRef().collection("actions");
}

function getDevicePlayerStorageKey(roomCode) {
  return `history-monopoly-player-${roomCode}`;
}

function normalizeRoomCode(value) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 12) || "HISGAME";
}

function syncUsedQuestionsFromRoom() {
  state.usedQuestionKeys = new Set(state.roomData?.usedQuestionIds ?? []);
}

function applyRoomTurn() {
  const currentPlayerId = state.roomData?.currentPlayerId;
  const index = state.players.findIndex((player) => player.id === currentPlayerId);
  state.currentPlayerIndex = index >= 0 ? index : 0;
  state.round = state.roomData?.round ?? 0;
  state.dice = state.roomData?.dice ?? null;
  state.pendingQuestion = state.roomData?.pendingQuestion ?? null;
  state.winner = state.roomData?.winner ? state.players.find((player) => player.id === state.roomData.winner) : null;
  state.answerRevealed = Boolean(state.roomData?.answerRevealed);
  syncUsedQuestionsFromRoom();

  const needsStudentBinding = state.mode === "firebase" && state.role === "student" && !state.devicePlayerId;

  if ((state.roomData?.status === "playing" || state.roomData?.status === "finished") && !needsStudentBinding) {
    elements.setupPanel.classList.add("is-hidden");
    elements.playLayout.classList.remove("is-hidden");
  } else if (needsStudentBinding) {
    elements.setupPanel.classList.remove("is-hidden");
    elements.playLayout.classList.add("is-hidden");
    setMessage("請先輸入自己的玩家代號，將這台裝置綁定到座號。");
  }

  if (state.mode === "firebase") {
    setRoomStatus(
      `${state.role === "teacher" ? "教師" : "學生"}房間 ${state.roomCode}｜${state.roomData?.status ?? "waiting"}｜玩家 ${
        state.players.length
      } 人`,
    );
  }
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

function setRoomStatus(message) {
  elements.roomStatus.textContent = message;
}

async function connectRoom(role, createIfMissing = false) {
  if (!firebaseReady) {
    setRoomStatus("Firebase 未載入，維持單機模式。");
    setMessage("Firebase 未載入，請檢查網路；目前仍可使用單機模式。");
    return;
  }

  if (!auth.currentUser) {
    try {
      await auth.signInAnonymously();
    } catch (error) {
      setRoomStatus("Firebase Anonymous Auth 尚未啟用。");
      setMessage("Firebase Anonymous Auth 尚未啟用；請到 Firebase Console 開啟匿名登入，或先使用單機模式。");
      console.error(error);
      return;
    }
  }

  const roomCode = normalizeRoomCode(elements.roomCode.value);
  elements.roomCode.value = roomCode;
  state.mode = "firebase";
  state.role = role;
  state.roomCode = roomCode;
  state.devicePlayerId = role === "student" ? localStorage.getItem(getDevicePlayerStorageKey(roomCode)) || "" : "";

  const roomRef = getRoomRef();
  const roomSnapshot = await roomRef.get();

  if (!roomSnapshot.exists) {
    if (!createIfMissing) {
      setRoomStatus(`找不到房間 ${roomCode}，請教師先建立。`);
      setMessage(`找不到房間 ${roomCode}。`);
      return;
    }

    await roomRef.set({
      status: "waiting",
      currentPlayerId: null,
      dice: null,
      usedQuestionIds: [],
      winner: null,
      round: 0,
      pendingQuestion: null,
      answerRevealed: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  }

  subscribeRoom();
  setRoomStatus(`${role === "teacher" ? "教師" : "學生"}已連線房間 ${roomCode}`);
  setMessage(`已連線房間 ${roomCode}。`);
}

function disconnectRoom() {
  if (state.unsubscribeRoom) state.unsubscribeRoom();
  if (state.unsubscribePlayers) state.unsubscribePlayers();
  if (state.unsubscribeActions) state.unsubscribeActions();
  state.unsubscribeRoom = null;
  state.unsubscribePlayers = null;
  state.unsubscribeActions = null;
  state.mode = "local";
  state.role = "teacher";
  state.roomCode = "";
  state.roomData = null;
  state.remoteActions = [];
  setRoomStatus("目前：單機模式");
  setMessage("已切換回單機模式。");
  render();
}

function subscribeRoom() {
  if (state.unsubscribeRoom) state.unsubscribeRoom();
  if (state.unsubscribePlayers) state.unsubscribePlayers();
  if (state.unsubscribeActions) state.unsubscribeActions();

  state.unsubscribeRoom = getRoomRef().onSnapshot((snapshot) => {
    state.roomData = snapshot.exists ? snapshot.data() : null;
    if (state.roomData) applyRoomTurn();
    render();
  });

  state.unsubscribePlayers = getPlayersRef().onSnapshot((snapshot) => {
    state.players = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => (a.joinedAtMillis ?? 0) - (b.joinedAtMillis ?? 0) || a.id.localeCompare(b.id));
    if (state.roomData) applyRoomTurn();
    renderSetupPlayers();
    render();
  });

  state.unsubscribeActions = getActionsRef()
    .orderBy("createdAt", "desc")
    .limit(80)
    .onSnapshot((snapshot) => {
      state.remoteActions = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          type: data.type ?? "",
          message: data.message ?? "",
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : null,
        };
      });
      render();
    });
}

function describeSquare(square) {
  if (square === 0) return "起點";
  if (square === FINISH) return "終點";
  return `第 ${square} 格`;
}

async function addPlayer(id) {
  const normalized = normalizePlayerId(id);

  if (!isValidPlayerId(normalized)) {
    setMessage("請輸入班級與座號，例如 902-02。");
    return;
  }

  if (state.players.some((player) => player.id === normalized)) {
    if (state.mode === "firebase") {
      state.devicePlayerId = normalized;
      localStorage.setItem(getDevicePlayerStorageKey(state.roomCode), normalized);
      await getPlayersRef().doc(normalized).set({ lastSeenAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
      await addRemoteAction("join", `${normalized} 已在本裝置綁定。`);
      if (state.roomData) applyRoomTurn();
      setMessage(`${normalized} 已綁定到這台裝置；輪到你時可以擲骰與作答。`);
      render();
      return;
    }
    setMessage(`${normalized} 已經加入。`);
    return;
  }

  if (state.players.length >= PLAYER_COLORS.length) {
    setMessage("目前最多支援 6 位玩家。");
    return;
  }

  const player = {
    id: normalized,
    position: 0,
    previousPosition: 0,
    color: PLAYER_COLORS[state.players.length],
    joinedAtMillis: Date.now(),
  };

  if (state.mode === "firebase") {
    state.devicePlayerId = normalized;
    localStorage.setItem(getDevicePlayerStorageKey(state.roomCode), normalized);
    await getPlayersRef().doc(normalized).set(player, { merge: true });
    await addRemoteAction("join", `${normalized} 加入房間。`);
  } else {
    state.players.push(player);
  }

  elements.playerId.value = "";
  setMessage(`${normalized} 已加入。`);
  renderSetupPlayers();
}

async function addRemoteAction(type, message) {
  if (state.mode !== "firebase") return;

  await getActionsRef().add({
    type,
    message,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
}

async function startGame() {
  if (state.players.length === 0) {
    setMessage("請至少加入 1 位玩家。");
    return;
  }

  if (state.mode === "firebase" && state.role !== "teacher") {
    setMessage("只有教師可以開始房間比賽。");
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

  if (state.mode === "firebase") {
    await getRoomRef().set(
      {
        status: "playing",
        currentPlayerId: state.players[0].id,
        dice: null,
        usedQuestionIds: [],
        winner: null,
        round: 1,
        pendingQuestion: null,
        answerRevealed: false,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    await addRemoteAction("teacher-control", "教師開始比賽。");
  }

  elements.setupPanel.classList.add("is-hidden");
  elements.playLayout.classList.remove("is-hidden");
  setMessage("輪到第一位玩家擲骰子。");
  render();
}

async function rollDice() {
  const player = getCurrentPlayer();

  if (!player || state.pendingQuestion || state.winner) return;

  if (state.mode === "firebase" && state.role !== "teacher" && player.id !== state.devicePlayerId) {
    setMessage("目前不是這台裝置登入的玩家回合。");
    return;
  }

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
    playerId: player.id,
    from,
    to,
    question,
    choiceOrder: shuffledChoiceOrder(question.choices.length),
  };
  state.answerRevealed = false;
  addTeacherLog(`${playerLabel(player)} 擲出 ${dice}，從${describeSquare(from)}到${describeSquare(to)}。`);

  if (state.mode === "firebase") {
    await getPlayersRef().doc(player.id).set({ position: to, previousPosition: from }, { merge: true });
    await getRoomRef().set(
      {
        status: "playing",
        currentPlayerId: player.id,
        dice,
        usedQuestionIds: Array.from(state.usedQuestionKeys),
        pendingQuestion: state.pendingQuestion,
        answerRevealed: false,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    await addRemoteAction("roll", `${playerLabel(player)} 擲出 ${dice}。`);
  }

  setMessage(`${playerLabel(player)} 擲出 ${dice}，前進到${describeSquare(to)}。答對才能留在這裡。`);
  render();
}

function answerQuestion(choiceIndex) {
  const pending = state.pendingQuestion;
  if (!pending) return;

  const activePlayer = state.players.find((item) => item.id === pending.playerId);
  if (state.mode === "firebase" && state.role !== "teacher" && activePlayer?.id !== state.devicePlayerId) {
    setMessage("目前不是這台裝置登入的玩家作答回合。");
    return;
  }

  const isCorrect = choiceIndex === pending.question.answer;
  resolveQuestion(isCorrect);
}

async function resolveQuestion(isCorrect) {
  const pending = state.pendingQuestion;
  if (!pending) return;

  const player = state.players.find((item) => item.id === pending.playerId) ?? state.players[pending.playerIndex];

  if (isCorrect) {
    if (pending.to === FINISH) {
      state.winner = player;
      state.pendingQuestion = null;
      state.answerRevealed = false;
      addTeacherLog(`${playerLabel(player)} 答對終點題並獲勝。`);
      if (state.mode === "firebase") {
        await getRoomRef().set(
          {
            status: "finished",
            winner: player.id,
            pendingQuestion: null,
            answerRevealed: false,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        await addRemoteAction("answer", `${playerLabel(player)} 答對終點題並獲勝。`);
      }
      setMessage(`${playerLabel(player)} 答對終點題，獲勝！`);
      render();
      return;
    }

    addTeacherLog(`${playerLabel(player)} 答對，停在${describeSquare(pending.to)}。`);
    setMessage(`答對！${playerLabel(player)} 留在${describeSquare(pending.to)}。${pending.question.explanation}`);
  } else {
    player.position = pending.from;
    if (state.mode === "firebase") {
      await getPlayersRef().doc(player.id).set({ position: pending.from }, { merge: true });
    }
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

  if (state.mode === "firebase") {
    const nextPlayer = getCurrentPlayer();
    await getRoomRef().set(
      {
        currentPlayerId: nextPlayer?.id ?? null,
        round: state.round,
        pendingQuestion: null,
        answerRevealed: false,
        winner: null,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    await addRemoteAction("answer", `${playerLabel(player)} ${isCorrect ? "答對" : "答錯"}。`);
  }

  render();
}

async function revealAnswer() {
  if (!state.pendingQuestion) {
    setMessage("目前沒有待答題目。");
    return;
  }

  state.answerRevealed = true;
  addTeacherLog(`顯示答案：${state.pendingQuestion.question.choices[state.pendingQuestion.question.answer]}`);
  if (state.mode === "firebase") {
    await getRoomRef().set({ answerRevealed: true }, { merge: true });
    await addRemoteAction("teacher-control", "教師顯示答案。");
  }
  render();
}

async function forceNextTurn() {
  if (state.winner) return;

  if (state.pendingQuestion) {
    const pending = state.pendingQuestion;
    const player = state.players.find((item) => item.id === pending.playerId) ?? state.players[pending.playerIndex];
    player.position = pending.from;
    state.pendingQuestion = null;
    state.answerRevealed = false;
    if (state.mode === "firebase") {
      await getPlayersRef().doc(player.id).set({ position: pending.from }, { merge: true });
    }
    addTeacherLog(`${playerLabel(player)} 的題目略過，回到${describeSquare(pending.from)}。`);
    setMessage(`${playerLabel(player)} 的題目已略過，回到${describeSquare(pending.from)}。`);
  } else {
    addTeacherLog("教師手動切換到下一位玩家。");
    setMessage("已切換到下一位玩家。");
  }

  advanceTurn();
  if (state.mode === "firebase") {
    const nextPlayer = getCurrentPlayer();
    await getRoomRef().set(
      {
        currentPlayerId: nextPlayer?.id ?? null,
        round: state.round,
        pendingQuestion: null,
        answerRevealed: false,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    await addRemoteAction("teacher-control", "教師切換到下一位。");
  }
  render();
}

function advanceTurn() {
  if (state.players.length === 0) return;

  state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
  if (state.currentPlayerIndex === 0) {
    state.round += 1;
  }
}

async function resetGame() {
  if (state.mode === "firebase" && state.role === "teacher" && state.roomCode) {
    await resetRoomGame(false);
    return;
  }

  resetLocalGameState(true);
  setMessage("加入玩家後開始遊戲。");
  renderSetupPlayers();
  render();
}

function resetLocalGameState(clearPlayers) {
  if (clearPlayers) {
    state.players = [];
  } else {
    state.players = state.players.map((player) => ({ ...player, position: 0, previousPosition: 0 }));
  }
  state.currentPlayerIndex = 0;
  state.round = 0;
  state.dice = null;
  state.pendingQuestion = null;
  state.usedQuestionKeys = new Set();
  state.teacherLog = [];
  state.remoteActions = [];
  state.answerRevealed = false;
  state.winner = null;
  state.devicePlayerId = "";
  elements.setupPanel.classList.remove("is-hidden");
  elements.playLayout.classList.add("is-hidden");
  elements.playerId.value = "";
}

async function resetRoomGame(clearPlayers) {
  if (state.mode === "firebase" && state.role !== "teacher") {
    setMessage("只有教師可以重置房間。");
    return;
  }

  if (state.mode === "firebase") {
    const batch = db.batch();
    const playersSnapshot = await getPlayersRef().get();

    playersSnapshot.docs.forEach((doc) => {
      if (clearPlayers) {
        batch.delete(doc.ref);
      } else {
        batch.set(doc.ref, { position: 0, previousPosition: 0 }, { merge: true });
      }
    });

    await batch.commit();
    await getRoomRef().set(
      {
        status: "waiting",
        currentPlayerId: null,
        dice: null,
        usedQuestionIds: [],
        winner: null,
        round: 0,
        pendingQuestion: null,
        answerRevealed: false,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    await addRemoteAction("teacher-control", clearPlayers ? "教師清空玩家並重置房間。" : "教師重置本局，保留玩家。");
  } else {
    resetLocalGameState(clearPlayers);
  }

  if (clearPlayers) {
    state.devicePlayerId = "";
    if (state.roomCode) localStorage.removeItem(getDevicePlayerStorageKey(state.roomCode));
  }
  elements.setupPanel.classList.remove("is-hidden");
  elements.playLayout.classList.add("is-hidden");
  elements.playerId.value = "";
  setMessage(clearPlayers ? "已清空玩家，請重新加入。" : "本局已重置，玩家保留在起點。");
  renderSetupPlayers();
  render();
}

async function clearPlayers() {
  await resetRoomGame(true);
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function exportRecord() {
  const actionRows =
    state.mode === "firebase" && state.remoteActions.length > 0
      ? state.remoteActions
          .slice()
          .reverse()
          .map((action) => [action.createdAt ? action.createdAt.toLocaleString("zh-TW", { hour12: false }) : "", action.type, action.message])
      : state.teacherLog
          .slice()
          .reverse()
          .map((line) => ["", "local-log", line]);

  const rows = [
    ["類別", "時間", "欄位", "內容"],
    ["房間", new Date().toLocaleString("zh-TW", { hour12: false }), "roomCode", state.roomCode || "local"],
    ["房間", "", "status", state.roomData?.status ?? (state.winner ? "finished" : "local")],
    ["房間", "", "currentPlayerId", getCurrentPlayer()?.id ?? ""],
    ["房間", "", "winner", state.winner?.id ?? state.roomData?.winner ?? ""],
    ["玩家", "", "count", state.players.length],
    ...state.players.map((player) => ["玩家", "", player.id, `位置 ${describeSquare(player.position)}；上一格 ${describeSquare(player.previousPosition ?? 0)}`]),
    ["紀錄", "時間", "type", "message"],
    ...actionRows.map(([time, type, message]) => ["紀錄", time, type, message]),
  ];

  const csv = `\ufeff${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const room = state.roomCode || "local";
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  link.href = url;
  link.download = `history-game-${room}-${stamp}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setMessage("已匯出本局紀錄 CSV。");
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
  elements.modalAnswers.innerHTML = "";

  if (!pending) {
    elements.questionCard.classList.add("is-hidden");
    elements.questionModal.classList.add("is-hidden");
    return;
  }

  const { question, to } = pending;
  elements.questionCard.classList.remove("is-hidden");
  elements.questionModal.classList.remove("is-hidden");
  elements.questionMeta.textContent = `${describeSquare(to)}｜${question.grade}｜${question.unit}`;
  elements.questionTitle.textContent = question.question;
  elements.modalQuestionMeta.textContent = `${describeSquare(to)}｜${question.grade}｜${question.unit}`;
  elements.modalQuestionTitle.textContent = question.question;
  elements.modalNote.textContent =
    state.mode === "firebase" && state.role === "teacher"
      ? "教師可直接代為點選答案，或使用教師後台判定。"
      : "答題後會自動換下一位玩家。";

  pending.choiceOrder.forEach((choiceIndex) => {
    elements.answers.append(createAnswerButton(question, choiceIndex));
    elements.modalAnswers.append(createAnswerButton(question, choiceIndex));
  });
}

function createAnswerButton(question, choiceIndex) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = question.choices[choiceIndex];
  button.addEventListener("click", () => answerQuestion(choiceIndex));
  return button;
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
  const isThisDeviceTurn = state.mode !== "firebase" || state.role === "teacher" || player?.id === state.devicePlayerId;
  elements.rollDice.disabled = Boolean(state.pendingQuestion || state.winner || !isThisDeviceTurn);
  elements.questionCount.textContent = `已出題 ${state.usedQuestionKeys.size} / ${boardQuestions.length}`;
  const teacherControlDisabled = state.mode === "firebase" && state.role !== "teacher";
  elements.revealAnswer.disabled = !state.pendingQuestion || teacherControlDisabled;
  elements.markCorrect.disabled = !state.pendingQuestion || teacherControlDisabled;
  elements.markWrong.disabled = !state.pendingQuestion || teacherControlDisabled;
  elements.forceNext.disabled = state.players.length === 0 || Boolean(state.winner) || teacherControlDisabled;
  elements.resetRoom.disabled = teacherControlDisabled;
  elements.clearPlayers.disabled = teacherControlDisabled;
  const logLines =
    state.mode === "firebase" && state.remoteActions.length > 0
      ? state.remoteActions.map((action) => {
          const time = action.createdAt ? action.createdAt.toLocaleTimeString("zh-TW", { hour12: false }) : "--:--:--";
          return `${time} ${action.message}`;
        })
      : state.teacherLog;
  elements.teacherLog.textContent = logLines.length > 0 ? logLines.join("\n") : "尚未開始課堂紀錄。";
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
elements.createRoom.addEventListener("click", () => connectRoom("teacher", true));
elements.joinRoomTeacher.addEventListener("click", () => connectRoom("teacher", false));
elements.joinRoomStudent.addEventListener("click", () => connectRoom("student", false));
elements.useLocal.addEventListener("click", disconnectRoom);
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
elements.resetRoom.addEventListener("click", () => resetRoomGame(false));
elements.clearPlayers.addEventListener("click", clearPlayers);
elements.exportRecord.addEventListener("click", exportRecord);
elements.reset.addEventListener("click", resetGame);

renderSetupPlayers();
render();
