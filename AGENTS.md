# 2026historygame — AGENTS.md

## 專案入口

專案名稱：2026historygame
專案用途：國中歷史大富翁班級互動教學遊戲
主要工作目錄：G:\我的雲端硬碟\2026historygame
GitHub repo：待建立
預設 branch：master（待 Git 鎖檔釋放後改為 main）

## Obsidian 對應筆記

Obsidian vault：G:\我的雲端硬碟\2026codex\secondbrain
專案駕駛艙：2026historygame/專案工作流程.md
收工時優先更新：2026historygame/專案工作流程.md

> 注意：專案駕駛艙是 Obsidian vault 裡的一篇筆記，不是工作資料夾裡的 Markdown 檔。

## 工作桌 + 三個家

- 工作桌：G:\我的雲端硬碟\2026historygame
- GitHub：待建立
- Obsidian：G:\我的雲端硬碟\2026codex\secondbrain + 2026historygame/專案工作流程.md
- Firebase：未使用

## 同步規則

開工時：
- 使用 `startup-sync` 流程
- 讀本檔
- 讀 Obsidian 駕駛艙
- 檢查 Git 狀態
- 不自動 pull / commit / push

收工時：
- 使用 `shutdown-sync` 流程
- 更新 Obsidian 駕駛艙
- 如規則、路徑、專案邊界改變才更新本檔
- 需要時 commit + push GitHub

新專案初始化時：
- 使用 `project-init-sync` 流程
- 既有專案先盤點現況，只補缺口，不覆蓋既有功能

## 主要檔案

入口檔：index.html
設定檔：package.json
題庫資料：src/data/questions.js
主要程式：src/main.js
樣式：src/styles.css
部署位置：待建立；若使用 GitHub Pages，優先部署靜態版

## 不要做

- 不要把每日進度寫進 AGENTS.md
- 不要自動納入無關 git 變更
- 不要把 API key、token、密碼寫進 repo
- 不要儲存學生姓名；正式資料只用座號與班級代號
- 不要在 Google Drive 同步資料夾內強行安裝大型 `node_modules`
