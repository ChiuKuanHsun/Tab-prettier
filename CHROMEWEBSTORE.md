# Chrome Web Store 上架資料：Tab Prettier

> 最後更新：2026-10-17
>
> 這份文件整理開發人員資訊主頁（Developer Dashboard）要填的所有內容，照著複製貼上即可。
> 商店的說明欄不支援 Markdown，下面「說明」區塊裡的文字都是純文字，直接貼。

## 打包

```bash
npm run package     # production build + 產生 tab-prettier-v<版本>.zip
```

上傳根目錄的 `tab-prettier-v1.0.0.zip`（約 146 MB，411 個檔案；兩個 AI 模型占 138 MB）。
上架後每次更新都要先把 `public/manifest.json` 和 `package.json` 的 `version` 調高，商店不收版本號相同或較小的套件。

## 商店資訊（Store listing）

**名稱**：取自 `_locales`，不用另外填
- en：Tab Prettier — Anime Depth New Tab
- zh_TW：Tab Prettier — 動漫景深新分頁

**類別**：Make Chrome Yours › Functionality & UI（備選：Lifestyle › Art & Design）

**語言**：英文為預設（`default_locale: en`），另外加繁體中文的商店資訊。

### 簡短說明（≤132 字元，取自 manifest 的 `appDesc`）

- en：Every new tab is a new anime scene: backgrounds × characters in layered depth, with clock, search, links, to-dos and anime info.
- zh_TW：每次開新分頁都是一幅新的動漫合成畫：場景 × 角色、景深分層、時鐘、搜尋、連結、待辦與番劇資訊。

### 詳細說明：繁體中文

```
每次打開新分頁，都是一幅新的動漫合成畫：一張場景當背景，一位角色自動去背站在前面，時鐘夾在兩者之間，滑鼠一動就有景深視差。

畫面
・場景與角色分開挑選再合成，每次都不一樣
・景深視差：背景依深度分層移動，角色會輕輕呼吸
・跟著時段與天氣變化：清晨、黃昏、夜晚有不同的場景；下雨、下雪時有對應的粒子和遠景霧氣
・可以只要特寫、遠景或純風景，也可以排除不想看到的標籤
・喜歡的畫面可以收藏、匯出成桌布；不喜歡的按一下就不再出現
・也能用自己的圖片或電腦裡的資料夾

追番
・登入 AniList 後，從你的動畫清單挑角色出現在新分頁
・角色生日當天會特別登場

新分頁工具
・時鐘、天氣
・搜尋框：像網址列一樣的建議，包含你開過的網站和開著的分頁
・常用連結、最近關閉的分頁、常去網站
・待辦事項與筆記，會跟著你的 Google 帳號同步
・專注計時器：專注時可以提醒你離開讓人分心的網站

隱私
所有圖片都在你的電腦上處理，不會上傳。設定、待辦和筆記存在 Chrome 裡（開啟同步時跟著你的 Google 帳號同步），開發者收不到任何資料。最近關閉的分頁、常去網站、搜尋建議、專注時提醒等功能，都是在你開啟時才會詢問權限。

圖片來源：Wallhaven、Danbooru（只取全年齡分級）、Nekosia、waifu.im。天氣：Open-Meteo。
```

### 詳細說明：English

```
Every new tab is a new anime scene: a background picked on its own, a character cut out and placed in front, the clock tucked between them, and depth parallax as you move the mouse.

The scene
・Background and character are chosen separately and composed, so no two tabs look the same
・Depth parallax: the background moves in layers by depth, and the character gently breathes
・Follows the time of day and the weather: different scenes at dawn, dusk and night; rain, snow and distant haze when the weather calls for it
・Close-ups only, long shots, or scenery only, and tags you never want to see
・Save the scenes you love, export them as wallpapers, and hide the ones you don't with one click
・Use your own pictures or a folder on your computer

Your anime list
・Sign in with AniList and characters from your list appear on your new tab
・Characters show up on their birthdays

New tab tools
・Clock and weather
・Search box with address-bar style suggestions, including sites you've visited and tabs you have open
・Pinned links, recently closed tabs and top sites
・To-dos and notes that sync with your Google account
・Focus timer that can nudge you away from distracting sites while you focus

Privacy
All images are processed on your computer and never uploaded. Settings, to-dos and notes stay in Chrome (synced with your Google account if you use Chrome sync); the developer receives no data. Recently closed tabs, top sites, search suggestions and focus reminders ask for permission only when you turn them on.

Image sources: Wallhaven, Danbooru (general rating only), Nekosia, waifu.im. Weather: Open-Meteo.
```

### 單一用途（Single purpose）

> Replaces Chrome's new tab page with a composed anime scene and a set of new-tab tools (clock, search, links, to-dos, focus timer).

## 圖片素材

| 素材 | 尺寸 | 狀態 | 備註 |
|---|---|---|---|
| 商店圖示 | 128×128 PNG | ✅ | `public/icons/icon-128.png` |
| 截圖 1 | 1280×800 | ⬜ | 新分頁全畫面：角色在右、時鐘、天氣 |
| 截圖 2 | 1280×800 | ⬜ | 換一種主題或時段（夜晚、下雨粒子） |
| 截圖 3 | 1280×800 | ⬜ | 連結面板／搜尋建議展開 |
| 截圖 4 | 1280×800 | ⬜ | 設定頁的圖源與構圖開關 |
| 截圖 5 | 1280×800 | ⬜ | AniList 清單角色或生日 |
| 小型宣傳圖塊 | 440×280 | ⬜ | 選填，精選版位用 |

截圖要用目前版本實際的畫面，不能是合成示意圖。繁中、英文的商店資訊各自上傳截圖（介面語言要對應）。
擷取方式：把 Chrome 視窗調成 1280×800 的內容區，按 F12 →「Ctrl+Shift+P」→「Capture screenshot」。

## 權限用途說明

開發人員資訊主頁的「隱私權」分頁每個權限都有一個欄位，照下表填。

| 權限 | 類型 | 用途說明（貼到主頁的英文） |
|---|---|---|
| storage | permissions | Saves the user's settings, pinned links, to-dos and notes, and the list of hidden or favourite pictures. |
| unlimitedStorage | permissions | Keeps a small pool of ready-made scenes (pictures already cut out and depth-mapped on the user's computer) so every new tab opens instantly; these images exceed the default storage quota. |
| alarms | permissions | Refills the pool of ready-made scenes in the background and ends focus-timer sessions on time, even when no new tab is open. |
| offscreen | permissions | Cuts the character out of its background and estimates scene depth on the user's own computer, in an offscreen document, so new tabs don't freeze while a picture is prepared. |
| identity | permissions | Signs the user in to AniList (only when they choose to) to show characters from their own anime list. |
| favicon | permissions | Shows each site's icon next to the user's pinned links, recently closed tabs and top sites. |
| search | permissions | Runs searches from the new tab search box with the user's default search engine. |
| idle | permissions | On slower computers (or when the user chooses it), prepares new scenes only while the computer is idle, so the work never slows down what the user is doing. |
| notifications | permissions | Tells the user when a focus or break session ends. |
| scripting | permissions | During a focus session, shows a gentle reminder on the distracting sites the user listed themselves; nothing is injected anywhere else or outside a focus session. |
| https://wallhaven.cc/* | host_permissions | Fetches the background scenery pictures. |
| https://danbooru.donmai.us/* | host_permissions | Searches general-rated character pictures, including characters from the user's AniList list. |
| https://cdn.donmai.us/* | host_permissions | Downloads the character pictures found on Danbooru. |
| sessions | optional | Lists recently closed tabs in the links panel; asked for only when the user turns that on. |
| tabs | optional | Lets search suggestions offer "switch to this tab" for tabs that are already open; asked for only when the user turns that on. |
| topSites | optional | Lists the user's most visited sites in the links panel; asked for only when the user turns that on. |
| history | optional | Suggests sites the user has visited while typing in the search box, like the address bar; asked for only when the user turns that on. History is read locally and never sent anywhere. |
| https://suggestqueries.google.com/* | optional host | Fetches search suggestions while typing; asked for only when the user turns that on. |
| \*://\*/\* | optional host | Needed only for the focus reminder on the distracting sites the user lists; Chrome asks for access to those sites when the user adds them. |

**遠端程式碼**：選「No, I am not using remote code」。所有程式（含 AI 模型執行環境）都在套件裡，執行時不從網路載入程式。

## 資料使用揭露

開發者本人沒有伺服器，也收不到任何資料。但 Chrome 線上應用程式商店的「使用者資料」也包含**擴充功能送到第三方服務的資料**，以下這些會離開使用者的電腦：

| 資料 | 送到哪裡 | 用途 | 何時 |
|---|---|---|---|
| 大致位置（經緯度到小數點後兩位，或使用者輸入的城市） | Open-Meteo | 查天氣 | 開啟天氣時 |
| IP 位址（任何連線都會帶） | ipwho.is／ipinfo.io | 用 IP 推算城市 | 天氣設為「自動定位」時 |
| 搜尋框輸入的文字 | Google 搜尋建議 | 顯示搜尋建議 | 使用者開啟搜尋建議時 |
| AniList 登入憑證 | AniList | 讀取使用者自己的動畫清單 | 使用者登入 AniList 時 |
| 設定、連結、待辦、筆記 | Google（Chrome 同步） | 跨裝置同步 | 使用者開啟 Chrome 同步時 |

只在電腦上讀取、不會送出的：瀏覽紀錄、開著的分頁、最近關閉的分頁、常去網站。

主頁「資料使用」表單建議勾選：
- **位置資訊（Location）**：天氣
- **驗證資訊（Authentication information）**：AniList 登入憑證
- **使用者活動（User activity）**：搜尋框輸入的文字送去取得建議
- 三項認證都勾：不販售給第三方、不用於與功能無關的用途、不用於信用評估

### 隱私權政策

決定：暫不提供。

⚠️ 風險：上面勾選了任何一種使用者資料，主頁就會要求填隱私權政策網址，沒有就不能送審。
如果審核卡在這裡，最簡單的做法是在 repo 放一頁 `docs/privacy.html`，用 GitHub Pages 公開，
內容就是上面「資料使用揭露」那張表加上「開發者不蒐集、不保存、不販售任何資料」。

## 發布設定

- **公開程度**：公開
- **地區**：所有地區
- **發布者名稱／聯絡信箱**：使用者自行設定

## 審核風險提醒

- **單一用途**：專注時在其他網站顯示提醒（`scripting` + `*://*/*`）超出「新分頁」範圍，審核可能會問。說明文字已經把它寫成新分頁專注計時器的一部分，而且只對使用者自己列出的網站生效。
- **圖片內容**：所有圖源都只取全年齡分級（Danbooru `rating:g`、Nekosia `safe`、waifu.im 非 NSFW），並固定排除成人標籤。
- **著作權**：圖片來自第三方圖庫，每張圖都有出處連結（出處面板）。若收到 DMCA 通知，可能需要暫停某個圖源。
- **套件大小**：146 MB，遠低於 2 GB 上限，但審核時間可能較長。

## 版本紀錄

| 版本 | 日期 | 內容 | 狀態 |
|---|---|---|---|
| 1.0.0 | 2026-10-17 | 首次上架 | 草稿 |

## 上架後要做的事

- 擴充功能 ID 會變成商店指定的 ID：到 AniList 開發者設定，把 Redirect URL 改成 `https://<新 ID>.chromiumapp.org/`
- 用商店版重新測一次 AniList 登入
