# 歷史大富翁

一個以國中歷史一到三年級課程主題為核心的 6x6 大富翁式互動遊戲。玩家用班級與座號登入、輪流擲骰、走到格子後回答歷史題；答對才能留在原地，答錯退回原本出發位置，最早抵達終點並答對終點題的玩家獲勝。

## 啟動

直接用瀏覽器開啟 `index.html` 即可遊玩。

## 目前版本

- 零依賴，不需要 npm install
- 36 格棋盤，支援 1-6 位玩家
- 玩家代號格式如 `902-02`，不記錄姓名
- 題庫涵蓋國中歷史一上到三下，目前 70 題
- 每局比賽已出過的題目不會重複
- 題目包含資料判讀、因果推論、時序整理與跨單元比較
- 教師後台可顯示答案、手動判定答對/答錯、略過題目與查看課堂紀錄
- 投影模式會放大目前玩家、骰子、題目、選項與正解說明
- Firebase 多裝置房間模式：教師建立房間，學生用同一房間代碼從不同平板加入
- 保留單機模式作為沒有網路或 Firebase 無法連線時的備援
- 答對停留、答錯退回、終點答對獲勝
- 支援桌面與手機版面

## Firebase 多裝置模式

目前使用 Firebase project `teacherstudy-259b4` 的 Firestore：

- 房間：`rooms/{roomId}`
- 玩家：`rooms/{roomId}/players/{playerId}`
- 操作紀錄：`rooms/{roomId}/actions/{actionId}`

使用前需要在 Firebase Console 啟用 Authentication 的 Anonymous provider。Firestore rules 已部署為僅允許已登入裝置讀寫房間資料。

## 工作模式

- 專案規則看 `AGENTS.md`
- 進度與下一步記在 Obsidian：`2026historygame/專案工作流程.md`
- 開始工作時可說「開工」
- 結束工作時可說「收工」

## 專案結構

- `index.html`: 遊戲畫面結構
- `src/main.js`: 登入、擲骰、棋盤、答題與勝負流程
- `src/firebase-config.js`: Firebase Web 設定
- `src/data/questions.js`: 36 格歷史題庫
- `src/styles.css`: 介面樣式
- `firestore.rules`: Firestore 房間同步規則
