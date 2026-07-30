# 留鼠看，養活自己 — 部署說明

四十分鐘左右能跑完。順序不要跳，`index.html` 裡有三個地方要填，那三個東西都是後面幾步生出來的。

---

## 一、Firebase（存資料，兩邊即時同步）

1. [console.firebase.google.com](https://console.firebase.google.com) 建一個專案，Google Analytics 可以關掉。
2. 左邊 **建構 → Firestore Database → 建立資料庫**，選「以正式版模式啟動」，位置挑 `asia-east1`。
3. 左邊 **建構 → Authentication → 開始使用 → 登入方式**，把 **匿名** 打開。這步漏掉的話進去會一直轉。
4. **專案設定 → 一般 → 你的應用程式 → 網頁應用程式（`</>`）**，註冊一個，把 `firebaseConfig` 那段整包貼進 `index.html` 的 `CONFIG.firebase`。
5. 回 Firestore 的 **規則** 分頁，換成這段再發布：

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /rooms/{room}/{doc=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

> 這代表：任何匿名登入的人只要**知道房號**就能讀寫那個房間。房號等於密碼，取難猜一點的（例如 `shu-2026-xk9`），不要用 `test`。裡面沒有金流或個資，這個強度夠用；要更嚴就得做正式帳號登入，那是另一個工程。

---

## 二、Cloudflare Worker（放金鑰的地方）

前端**絕對不能**放 API 金鑰——GitHub repo 是公開的，撈走了帳單算你的。所以中間隔一層。

1. [console.anthropic.com](https://console.anthropic.com) 拿一把 API 金鑰，先儲值一點額度。
2. [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages → Create → Worker**，取名 `liushukan-api`，先按 Deploy 生一個空的。
3. 進 **Edit code**，把 `worker/worker.js` 整份貼上去，Deploy。
4. **Settings → Variables and Secrets**，加這幾個：

   | 名稱 | 型別 | 值 |
   |---|---|---|
   | `ANTHROPIC_API_KEY` | Secret | 你的 API 金鑰 |
   | `APP_KEY` | Secret | 自己隨便打一串亂碼，等一下前端要填同一串 |
   | `ALLOW_ORIGINS` | Text | `https://你的帳號.github.io`（第三步拿到，先空著也行） |
   | `MODEL` | Text | 模型代號，去 [docs.claude.com](https://docs.claude.com/en/docs/about-claude/models) 對現在可用的版本 |

5. 把 Worker 網址（`https://liushukan-api.xxx.workers.dev`）和 `APP_KEY` 填進 `index.html` 的 `CONFIG.workerUrl` 和 `CONFIG.appKey`。

> **模型代號**這格最容易踩雷，我給的預設值不保證是最新的。如果按「收進來」跳 `model not found`，就是這裡要改。
>
> **省錢**：Cloudflare 免費方案每天十萬次請求，用不完。真正花錢的是 Anthropic 那邊，一次「收進來」大概幾分美金。建議去 Cloudflare 的 **Security → WAF → Rate limiting rules** 加一條「同 IP 每分鐘最多 10 次」，萬一 `APP_KEY` 外流也不會被刷爆。

---

## 三、GitHub Pages

1. 建一個 repo（例如 `liushukan`），把這個資料夾裡除了 `worker/` 和這份 README 以外的檔案都放進去：`index.html`、`manifest.json`、`sw.js`、三個 `icon-*.png`。
2. **Settings → Pages → Source 選 `main` 分支 / root**，存檔。
3. 一兩分鐘後拿到網址 `https://你的帳號.github.io/liushukan/`。
4. **把這個網址填回 Worker 的 `ALLOW_ORIGINS`**（結尾不要加斜線），重新 Deploy。這步漏掉，AI 功能會全部跳 403。

---

## 四、開始用

1. 開網址，輸入房號 —— 你和鼠**輸入同一組**才會看到同一份清單。
2. 手機上：Safari 分享 → 加入主畫面 / Chrome 選單 → 安裝應用程式。之後開起來就沒有網址列。
3. 進去先按「鼠的名片」→ 編輯，把作品集連結和聯絡方式填好。名片是跟著房號存的，鼠那邊會同步看到。
4. 舊資料：在 Claude 那個版本按「備份」下載 JSON，這裡按「匯入」讀進去。

---

## 平常怎麼跑

- **你**：刷到案子 → 「＋ 貼新案子」→ 收進來。
- **鼠**：打開就是那張紙，點標題看原貼文，按「投了 ✓」記錄，「幫鼠寫一封」生投遞訊息。
- 兩邊同時開著也沒問題，改動幾秒內就同步。
- 定期按「備份」存一份 JSON 在雲端硬碟，免費版 Firestore 沒有自動備份。

## 出問題先看這裡

| 症狀 | 通常是 |
|---|---|
| 一直停在「連線中…」 | Authentication 的匿名登入沒開 |
| 「讀不到資料」 | Firestore 規則沒換或沒發布 |
| AI 功能跳 403 | Worker 的 `ALLOW_ORIGINS` 沒填對，或結尾多了斜線 |
| AI 功能跳 401 | 前端 `appKey` 跟 Worker 的 `APP_KEY` 不一樣 |
| 跳 `model not found` | `MODEL` 這個變數要改成現在可用的代號 |
| 改了程式沒生效 | Service Worker 有快取，重新整理兩次，或在手機上把 App 關掉重開 |
