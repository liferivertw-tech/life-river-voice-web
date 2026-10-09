# Life River Voice Web — 小河 V0.1

第一個可執行的文字版小河：Web 輸入文字後，Fastify API 會建立／延續對話、儲存使用者訊息、呼叫 AI provider，再儲存並回傳助理訊息。

## 結構

```text
apps/web                 Next.js + React 使用者介面
apps/api                 Fastify API、模組與 Prisma schema
packages/shared-types    Web/API 共用型別
```

API 以模組化單體設計，目前包含 `ai`、`conversations`、`messages`。未來可平行加入 `voice`、`tts`、`wake-word`、`tools`，而不改變 Web 與 Core 的界線。

## 本機啟動

需求：Node.js 20+、Docker。

```bash
npm install
docker compose up -d postgres
copy .env.example apps\\api\\.env
copy .env.example apps\\web\\.env.local
npm run db:generate
npm run db:deploy
npm run dev
```

macOS/Linux 請將 `copy` 改為 `cp`（並使用 `/` 路徑分隔符）。開啟 http://localhost:3000；API 在 http://localhost:4000，健康檢查為 `GET /health`。

預設 `AI_PROVIDER=deterministic`，完全不需要模型金鑰。要啟用正式 OpenAI 回覆，請在 `apps/api/.env` 設定 `AI_PROVIDER="openai"`、`AI_MODEL` 與 `AI_API_KEY`；沒有金鑰時會安全回到離線 provider。

瀏覽器會保存目前的 conversation ID，重新整理後透過 `GET /api/v1/conversations/:conversationId/messages` 從 PostgreSQL 載入歷史對話。

Chrome／Edge 使用者可按輸入框旁的麥克風按鈕，以瀏覽器 Web Speech API 進行 `zh-TW` 語音輸入。辨識會持續到約 2 秒無語音後自動停止，也可再按紅色停止鍵手動結束；辨識後由使用者確認送出。常駐 Wake Word 留待後續版本。

AI 回覆會透過瀏覽器 Speech Synthesis 以 `zh-TW` 自動朗讀；頁首喇叭按鈕可隨時關閉並停止播放。這個本機 TTS 不增加模型 API 費用。

頁首喇叭控制後續回答是否自動發聲；目前正在朗讀的回答旁會另外顯示紅色停止鍵，可只停止當前語音而不關閉後續自動朗讀。

頁首「小河喚醒」會啟動一次性的 Wake Word 流程。說「小河」加上問題（例如「小河，介紹台南」）後，瀏覽器會持續累積喚醒詞後的內容，約 2 秒無語音才自動送出並朗讀回覆；完成一輪後自動退出喚醒模式。

## 驗證

```bash
npm test
npm run typecheck
npm run build
```

Smoke test 使用 Fastify injection 與記憶體 repository，不依賴 PostgreSQL，會驗證成功訊息流程、兩筆訊息儲存及輸入錯誤。

## API

`POST /api/v1/messages/text`

```json
{ "text": "你好，小河", "conversationId": "可省略；後續輪次帶回" }
```
