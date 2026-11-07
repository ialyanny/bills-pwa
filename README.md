# 帳單備忘錄 PWA

每月信用卡與固定帳單的繳款備忘錄。手機加到主畫面就能用，離線可讀寫，開啟同步後可跨裝置共用同一份帳本（端對端加密）。

> 本 repo 公開，**程式碼不含任何帳務資料**。資料只存在你的裝置，以及用你的同步碼加密後的雲端備份。

---

## 功能

| 功能 | 說明 |
| --- | --- |
| 月度檢視 | 一個月份一頁，上半部信用卡、下半部其他帳單，總額／已繳／未繳一目了然 |
| 搜尋與篩選 | 關鍵字搜尋、依狀態篩選（全部／未繳／已繳／待確認）、依截止日或金額排序 |
| 繳款勾選 | 點左側圓圈即標記已繳，自動寫入當天日期 |
| 到期狀態 | 逾期（紅）、7 天內到期（橘）、待繳、待確認（金額空白） |
| 分期進度 | 有期數的項目自動算剩餘期數與剩餘金額，帶入未來月份自動遞增期數 |
| 固定項目與卡片管理 | 設定頁可新增／編輯／刪除信用卡主檔與固定項目範本，並支援一鍵帶入全部固定項目 |
| 待確認與疑點核對 | 設定頁自動列出所有金額空白或備註標記疑點的項目，點一下直接跳轉該月編輯補齊 |
| 年度統計 | 12 個月長條圖、信用卡年度排行、其他帳單年度排行 |
| 離線優先 | Service Worker 快取，沒網路也能開、能改，回線後自動補傳 |
| 跨裝置同步 | Supabase 存密文，用「同步碼」解密；同一組碼就是同一份帳本 |
| 匯出／匯入 | 一份 JSON 就是完整備份，不綁定任何服務 |

## 快速開始

```powershell
# 任何靜態伺服器都可以，這裡用 Python
cd C:\Opencode\帳單備忘錄-PWA
python -m http.server 5273
# 打開 http://localhost:5273
```

> 直接雙擊 `index.html` 不行：ES module、Service Worker、PWA 安裝都需要 http(s)。

## 部署

PWA 需要 HTTPS，三個免費選項：

1. **Cloudflare Pages**（推薦，支援私有 repo、自訂網域免費）
   - 連結 GitHub repo → Build command 留空 → Output directory 填 `/`
2. **GitHub Pages**：私有 repo 需 GitHub Pro；公開 repo 免費但程式碼公開（資料不會公開，因為在瀏覽器本機）。
3. **Render Static Site**：你已經有 Render 帳號，New → Static Site → 選此 repo → Publish directory `./`

部署後用手機開啟網址 → 分享 → 加入主畫面。

## 跨裝置同步

1. 到 Supabase 專案 → SQL Editor，貼上 [`supabase-bills.sql`](supabase-bills.sql) 執行（只需一次）。
2. 第一台裝置：「設定」→ 按「產生」建立同步碼 → 按「開啟同步」。
3. 其他裝置：「設定」→ 輸入同一組同步碼 → 按「開啟同步」。
4. 把同步碼抄在安全的地方。**忘記同步碼＝雲端資料無法解開**（本機與匯出檔不受影響）。

同步預設關閉，沒有內建同步碼；一定要由你產生或輸入才會上傳。

### 從舊版公開同步碼搬家

舊版內建公開同步碼 `BILLS-DEFAULT-2026`，寫在公開的程式碼裡，任何人都能解開那份雲端資料。更新後：

1. 還在用這組碼的裝置會**自動暫停同步**（本機資料不受影響），設定頁會出現提醒。
2. 在一台裝置產生新同步碼並開啟同步，資料會上傳到新房間；其他裝置輸入同一組新碼。
3. 新房間同步成功後，按「清除公開房間的雲端資料」刪掉舊資料。請先確認每台裝置都已更新到新版，否則舊版可能把資料再寫回公開房間。

同步行為：

- 每次同步都是「先抓遠端 → 逐筆合併 → 有需要才上傳」，不同項目的編輯會兩邊保留，不會整份覆蓋。
- 刪除使用墓碑標記（tombstone），刪掉的項目不會被另一台裝置救回來。
- 開啟時、切回前景、連線恢復、每 12 秒，以及本機改動後約 0.4 秒都會自動同步。

### 安全性說明

- 整份帳本用同步碼經 PBKDF2（15 萬次）派生金鑰、AES-GCM 加密後才上傳，Supabase 只看到密文。
- `room` 是同步碼的 SHA-256 前 32 碼，資料庫不存明文同步碼。
- 因為沒有帳號系統，拿到 anon key 的人仍可**覆寫**你的那一列（讀不到內容，但可能被覆蓋）。若之後要更嚴謹，可改用 Supabase Auth 的 magic link + RLS `auth.uid()`。
- 本機資料存在 `localStorage`（未加密）。共用電腦請記得登出／清除資料。

## 專案結構

```
index.html                 單頁介面
manifest.webmanifest       PWA 設定
sw.js                      Service Worker（離線快取）
css/app.css                樣式（含深色模式）
js/logic.js                純邏輯：日期、統計、分期、範本
js/seed.js                 初始資料（刻意留空，不含帳務資料）
js/store.js                localStorage 狀態容器 / 匯出匯入
js/merge.js                跨裝置逐筆合併（updatedAt + 刪除墓碑）
js/sync.js                 Supabase 同步 + WebCrypto 加密
js/app.js                  畫面渲染與事件
scripts/make-icons.ps1     產生 PWA 圖示
tests/logic.test.mjs       node --test 測試（邏輯）
tests/merge.test.mjs       node --test 測試（同步合併）
tests/store.test.mjs       node --test 測試（設定遷移）
tests/fixtures/            測試用的虛構帳本
private/                   你自己的真實資料與腳本（已列入 .gitignore，不進版控）
supabase-bills.sql         雲端資料表
```

## 資料模型

```js
{
  cards: [{ id, name, owner, stmtDay, dueDay, via, color }],
  months: {
    "2026-10": {
      cards: { fubon: { amount, stmtDate, dueDate, paid, paidDate, via, note } },
      others: [{ id, name, amount, dueDate, paid, paidDate, via, note, inst }]
    }
  },
  templates: [{ id, name, amount, dueDay, via, recurrence: 'monthly'|'yearly', month, inst }]
}
```

- `amount: null` 代表原始備忘錄沒寫金額，統計時以 0 計，但介面會標「待確認」。
- 卡片主檔的結帳日／截止日固定，每月只改金額與繳款狀態。

## 開發

```powershell
node --test                              # 跑全部測試
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/make-icons.ps1
```

改版時記得把 `sw.js` 的 `CACHE_VERSION` 加一，手機才會拿到新檔。

### 真實資料放哪裡

帳務資料**不要**放進 `js/` 或 `tests/`。需要用腳本整理資料時，放在 `private/`（已列入 `.gitignore`），產生 JSON 後在 app「設定 → 匯入 JSON」載入。測試請用 `tests/fixtures/` 的虛構資料。

## 授權

個人使用。
