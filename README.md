# 帳單備忘錄 PWA

每月信用卡與固定帳單的繳款備忘錄。手機加到主畫面就能用，離線可讀寫，開啟同步後可跨裝置共用同一份帳本（端對端加密）。

> 資料來源：使用者手寫的 2026 年 1～10 月備忘錄，已整理成結構化種子資料。

---

## 功能

| 功能 | 說明 |
| --- | --- |
| 月度檢視 | 一個月份一頁，上半部信用卡、下半部其他帳單，總額／已繳／未繳一目了然 |
| 搜尋與篩選 | 關鍵字搜尋、依狀態篩選（全部／未繳／已繳／待確認）、依截止日或金額排序 |
| 繳款勾選 | 點左側圓圈即標記已繳，自動寫入當天日期 |
| 到期狀態 | 逾期（紅）、7 天內到期（橘）、待繳、待確認（金額空白） |
| 分期進度 | 9733 聯邦信貸、24213 台新信貸自動算剩餘期數與剩餘金額，帶入未來月份自動遞增期數 |
| 固定項目與卡片管理 | 設定頁可新增／編輯／刪除信用卡主檔與固定項目範本，並支援一鍵帶入全部固定項目 |
| 待確認與疑點核對 | 設定頁自動列出所有金額空白或標記疑點的項目，點一下直接跳轉該月編輯補齊 |
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

## 開啟跨裝置同步（一次性設定）

1. 到 Supabase 專案 `nutkocotbncqxgvjkfxi` → SQL Editor，貼上 [`supabase-bills.sql`](supabase-bills.sql) 執行。
2. 打開 App → 設定 → 按「產生」取得同步碼（例如 `K7QM-3XPD-9RTB`）→ 按「開啟同步」。
3. 另一台裝置打開同一個網址 → 設定 → 輸入**同一組同步碼** → 開啟同步。
4. 把同步碼抄在安全的地方。**忘記同步碼＝雲端資料無法解開**（本機與匯出檔不受影響）。

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
js/seed.js                 1～10 月種子資料（由 scripts/build-seed.mjs 產生）
js/store.js                localStorage 狀態容器 / 匯出匯入
js/sync.js                 Supabase 同步 + WebCrypto 加密
js/app.js                  畫面渲染與事件
scripts/build-seed.mjs     重新產生種子資料
scripts/make-icons.ps1     產生 PWA 圖示
tests/logic.test.mjs       node --test 測試
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

## 種子資料核對表

| 月份 | 信用卡 | 其他帳單 | 合計 |
| --- | ---: | ---: | ---: |
| 2026-01 | 39,500 | 0 | 39,500 |
| 2026-02 | 90,111 | 38,834 | 128,945 |
| 2026-03 | 63,168 | 63,170 | 126,338 |
| 2026-04 | 46,189 | 44,391 | 90,580 |
| 2026-05 | 125,225 | 57,318 | 182,543 |
| 2026-06 | 57,140 | 96,187 | 153,327 |
| 2026-07 | 255,785 | 135,233 | 391,018 |
| 2026-08 | 132,158 | 120,468 | 252,626 |
| 2026-09 | 40,184 | 117,380 | 157,564 |
| 2026-10 | 70,905 | 111,027 | 181,932 |
| **全年** | | | **1,704,373** |

## 開發

```powershell
node --test                              # 跑邏輯測試（9 項）
node scripts/build-seed.mjs              # 改完 scripts/build-seed.mjs 後重新產生 js/seed.js
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/make-icons.ps1
```

改版時記得把 `sw.js` 的 `CACHE_VERSION` 加一，手機才會拿到新檔。

## 原始資料中已標記的疑點

1. **2 月信用卡金額與 3 月完全相同**（富邦 18,100／玉山 37,531／中信 4,240／永豐 188），研判是複製 3 月未更新，已在備註標示。
2. **2 月的結帳／截止日落在 3 月**（例如富邦 2/24 結、3/12 止），與其他月份「上月結帳、本月繳款」的規律不同。
3. **10 月星展**寫「10/27 止 - /29 台銀已繳」，日期在今天之後，已標記備註、未填繳款日。
4. **1 月沒有「其他帳單」**，也沒有老婆中信／玉山兩張卡。
5. **9 月遠傳**期限寫 8/28（疑為 9/28）、**宸麟電話費**寫 10/22（疑為 9/22）。
6. **7 月宸麟家教**原文殘缺（「5600元6/21、7/12、19、264200元6/21、7/」），暫記 5,600 並保留原文。
7. 多筆金額空白（水費、燃料稅、宸麟學雜、保費、妹妹威林等），一律留 `null`，不推測。
8. 「漁會 13,000／6/5 已轉」每個月都出現，已視為**年繳**（6 月）處理，其他月份仍保留原紀錄。

## 授權

個人使用。
