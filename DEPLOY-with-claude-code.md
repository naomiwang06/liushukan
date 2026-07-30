# 給 Claude Code 的部署指示

把這個資料夾整包丟給 Claude Code，然後貼下面那段話給它。

分成三種顏色：**你點的**（網頁後台，Claude Code 做不到）、**它跑的**（指令）、**你打的**（帳號密碼、金鑰，只能你自己輸入，不要貼進對話）。

---

## 先自己點完這五步（約十分鐘）

Firebase 的專案建立和登入方式開關沒有能用的 CLI，只能在後台點。

1. [console.firebase.google.com](https://console.firebase.google.com) → 建立專案，Analytics 關掉
2. **Firestore Database → 建立資料庫** → 正式版模式 → 位置 `asia-east1`
3. **Authentication → 開始使用 → 登入方式 → 匿名** 打開
4. **專案設定 → 一般 → 你的應用程式 → 網頁應用程式 `</>`** → 註冊 → 複製 `firebaseConfig` 那段
5. [console.anthropic.com](https://console.anthropic.com) → 拿一把 API 金鑰、儲值一點額度

拿到手的東西：`firebaseConfig` 一段、API 金鑰一把、專案 ID 一個。

---

## 然後把這段貼給 Claude Code

```
這個資料夾是一個要部署的靜態網站，請幫我完成部署。

我的資料：
- GitHub 帳號：（填）
- repo 名稱：liushukan
- Firebase 專案 ID：（填）
- APP_KEY：（填我準備好的那串）

請照這個順序做，每一步做完停下來讓我確認：

1. 檢查 gh、firebase-tools、wrangler 有沒有裝，缺的用 npm 裝。
   需要登入的指令（gh auth login、firebase login、wrangler login）
   請直接在終端機跑起來讓我自己輸入，不要問我帳密。

2. 建 GitHub repo 並推上去。worker/ 資料夾要排除，
   那是另外部署的，不要進 Pages。

3. 開啟 GitHub Pages（main 分支 / root），告訴我網址。

4. 部署 Firestore 規則：firebase deploy --only firestore:rules
   （firestore.rules 已經寫好了，不用改）

5. 部署 Worker：cd worker && npx wrangler deploy
   然後跑 npx wrangler secret put ANTHROPIC_API_KEY
   和 npx wrangler secret put APP_KEY —— 這兩個是互動式的，
   停下來讓我自己貼值進去，不要幫我輸入，也不要寫進任何檔案。
   ALLOW_ORIGINS 和 MODEL 用 wrangler.toml 的 [vars] 設定。

6. 把第 3 步拿到的 Pages 網址填進 wrangler.toml 的 ALLOW_ORIGINS，
   重新 deploy 一次。結尾不要加斜線。

7. index.html 裡的 window.CONFIG 有三個地方要填：
   firebase 設定（我會貼給你）、workerUrl、appKey。
   填完 commit 推上去。

8. 用 curl 打一下 Worker，確認回的是 JSON 不是 403/401。

注意：
- MODEL 那個變數我不確定現在可用的代號，
  部署完如果報 model not found，幫我查一下 docs.claude.com 的模型列表再改。
- 任何金鑰都不要寫進 git 追蹤的檔案。.gitignore 已經寫好了。
```

---

## 它做不到的

- **Firebase 建專案、開匿名登入**：沒有 CLI，只能後台點（上面第 1～3 步）
- **輸入你的帳號密碼、金鑰**：`gh auth login` 之類會開瀏覽器或等你貼值，那幾格請你自己動手。金鑰經過對話就等於外流了，換一把很麻煩
- **GitHub Pages 有時候要等**：推上去到網址能開，中間可能要兩三分鐘，不是它做錯

## 做完自己驗這四件事

1. 開 Pages 網址，輸入房號，不會卡在「連線中…」→ 匿名登入正常
2. 貼一則案子按「收進來」，有東西跑出來 → Worker 和金鑰都對
3. 手機開同一個網址、輸入同一個房號，看得到同一份清單 → Firestore 同步正常
4. 加到主畫面，開起來沒有網址列 → PWA 正常
