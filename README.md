# Tab Prettier — 動漫景深新分頁

每次開新分頁都是一幅新的合成畫:Wallhaven 無人場景當背景 × Nekosia / waifu.im 角色自動去背,
時鐘夾在背景與角色之間,滑鼠移動有景深視差。

## 安裝(開發者模式)

```bash
npm install
npm run build        # 產出 dist/
```

1. 開 `chrome://extensions`,右上角打開「開發人員模式」
2. 「載入未封裝項目」→ 選 `dist/` 資料夾
3. 開新分頁。第一次需要下載並處理圖片,約 10–30 秒後出現第一幅畫;之後都是預先處理好、秒開。

開發時可用 `npm run dev`(watch build),改完到 `chrome://extensions` 按重新整理。

## 圖示

`assets/icon/icon.svg` 是目前的圖示(銀紫髮貓耳娘從新分頁後探頭,耳朵伸出框外);
同資料夾的 `concept-*.svg` 是保留的備選設計。改完執行 `npm run icons` 重新產生 `public/icons/` 的 PNG。

## 分頁列主題(選用)

Chrome 的分頁列 / 工具列配色只能用「佈景主題」這種特殊擴充來改,它不能包含程式,也無法在執行中變色,
所以做成三個固定配色的主題包,放在 `chrome-themes/`,對應三種新分頁主題:

| 資料夾 | 風格 |
|---|---|
| `chrome-themes/editorial` | 日系雜誌極簡:墨黑分頁列、奶白字、金棕強調 |
| `chrome-themes/dreamy` | 夢幻柔光:粉 → 紫 → 藍漸層分頁列 |
| `chrome-themes/neon` | 賽博霓虹:深藍掃描線、青色霓虹字 |

安裝:`chrome://extensions` →「載入未封裝項目」→ 選其中一個資料夾。同時只能啟用一個佈景主題,
要換回預設到 Chrome 設定 → 外觀 →「重設為預設值」。改配色請編輯 `tools/build_chrome_themes.py` 後執行
`python tools/build_chrome_themes.py`。

## 架構

| 部分 | 位置 | 說明 |
|---|---|---|
| 新分頁 | `src/newtab/` | 從 IndexedDB 取已就緒的 scene,渲染 背景 / 時鐘 / 角色 / 霧 / 粒子 / UI 六層 |
| Service worker | `src/background/` | 排程補貨(alarms、閒置偵測),管理 offscreen document 的生命週期 |
| Offscreen | `src/offscreen/` | 抓圖 → ONNX 去背(WebGPU,失敗退回 WASM)→ 遮罩精修 → LAB 色調轉移 → 輪廓光 → 構圖分析 |
| 純演算法 | `src/lib/compose.ts`、`src/offscreen/{refine,harmonize}.ts`、`src/lib/palette.ts` | 有單元測試(`npm test`) |
| 設定頁 | `src/options/` | 主題、圖源、融合、動態、效能、上傳、收藏、AniList、備份 |

去背模型:[SkyTNT anime-segmentation](https://github.com/SkyTNT/anime-segmentation)(Apache-2.0),
以 `tools/convert_model.py` 轉成 fp16(`public/models/anime-seg-fp16.onnx`,約 88MB)。

景深模型:[Depth Anything V2 Small](https://huggingface.co/onnx-community/depth-anything-v2-small)(Apache-2.0;
Base / Large 版為非商用授權,不可替換),fp16(`public/models/depth-anything-v2-small-fp16.onnx`,約 50MB)。
每幅背景在背景處理時算出深度圖,新分頁用 WebGL 做 2.5D 視差與推鏡。

## 其他功能

- **天氣**:設定頁選城市(Open-Meteo,免金鑰)。日期旁顯示天氣;下雨/下雪時優先挑雨景、雪景,粒子也會跟著變。
- **專注計時**:「專注」面板開始後,大時鐘變成倒數;時間到由背景程式發系統通知(關掉分頁也會提醒)。
- **搜尋建議**:輸入時向 Google 取得建議字詞,可在設定關閉。
- **今日壽星**:番劇面板顯示今天生日的角色(AniList)。

## AniList 追番清單

今日播出與本季新番不需登入。要看自己的追番清單:到設定頁的 AniList 區塊,照步驟建立 API Client,
Redirect URL 填設定頁顯示的 `https://<擴充ID>.chromiumapp.org/`。注意未封裝安裝的擴充 ID 與上架後不同,上架後要更新。

## 快捷鍵

- `/` 聚焦搜尋
- `Alt+1…6` 開關 連結 / 待辦 / 便條 / 專注 / 番劇 / 出處 面板,`Esc` 關閉
