# 格價簿 PriceBook

個人格價 App：買嘢之前，一次過喺香港、英國、歐洲嘅網站格價，再計埋運費、VAT、退稅、集運同信用卡外幣手續費，比較真正嘅「到手價」。

A personal price-comparison web app (PWA) for shopping across Hong Kong, the UK and Europe.

## 功能

- **一鍵多站搜尋**：機票、酒店、咖啡器材、生活用品、超市、電子產品，覆蓋 93 個香港、英國、歐洲網站，可以篩選地區同新舊。
- **自動翻譯關鍵字**：中文或者英文都得，每個網站會用佢嘅語言搜尋（香港網站用中文、英國用英文、德法荷意網站用當地語言）。內置約 450 個香港常用購物詞（士多啤梨、雪櫃、叉電線、冷衫、白色 T恤……），其他中文詞用 Google 翻譯當廣東話理解，Google 用唔到就改用 MyMemory；品牌同型號唔會翻譯。譯得唔啱可以撳個翻譯改字，App 會記住（設定 →「我改過嘅翻譯」），並經 Gist 同步。
- **消委會超市價**：每日自動下載消委會「網上價格一覽通」開放數據，搜超市貨品即刻見到各超市價錢同優惠；加入心水之後每日自動更新價錢。
- **歐洲超市最新最平**：揀「超市」再勾「歐洲」，搜尋時自動列出荷蘭（checkjebon.nl）同奧地利（Heisse Preise）超市嘅最新價錢，按每公升／每公斤價由平到貴排。每日自動檢查邊間超市仲有更新：已經停咗更新嘅超市會另外列喺「可能過時」，註明最後更新日期，唔會當最平。喺度記價之後，價錢每日自動跟住更新。
- **每個網站旁邊顯示現時價**：超市類搜尋時，喺各網站下面顯示嗰間店最平一件貨品同價錢：香港用消委會（百佳、惠康、屈臣氏、萬寧、士多），荷蘭／奧地利用超市開放數據，英國 Morrisons 喺 2026 年 10 月 2 日分散喺英國時間 5pm 前，喺佢網上超市搜尋頁查咗 50 款常用貨（牛奶、橙汁、雞蛋等）最平一件，之後一直保留嗰日嘅價（標住日期），其他英國超市用 Open Prices（Open Food Facts 眾包店舖價，即時讀取）；英國區頂另顯示 ONS 全國一般價（每月）。你自己記過嘅價亦會顯示。過時嘅價會標「可能過時」；冇價嘅網站唔顯示價錢，地區標題會寫幾多個網站有價。
- **英國超市一次比晒**：Trolley.co.uk（比較十幾間英國超市）排喺英國第一位；香港就係消委會。
- **到手價計算**：
  - VAT：海外網購寄香港可以扣除 VAT；寄去集運倉就照收 VAT，集運費按重量計。
  - 退稅：已計各國最低消費門檻。
  - 信用卡：可以設定多張卡（外幣手續費、1% 跨境港幣交易費、回贈），每個價自動揀最抵嗰張。
  - 單位價：可以按每 100g、每 100ml 或每件比較。
- **記價好方便**：
  - 一按「更新價」就可以記新價。
  - 貼上商品連結會自動認出網站、地區同貨幣；Android 可以直接分享連結入 App。
  - 可以掃 barcode。
  - 影價錢牌可以自動讀出價錢。
- **心水清單**：
  - 價格走勢圖，每個價用記錄當日嘅匯率計。
  - 可以設目標價。
  - 舊價會有提示，另有「今日要格價」清單。
  - 有各網站免費降價通知嘅捷徑（Google Flights、camelcamelcamel、Keepa、PriceSpy、idealo、eBay 等）。
- **二手價參考**：Carousell、eBay 已售出價、Vinted、Kleinanzeigen 等。
- **連結測試**：喺「設定 › 網站 › 測試連結」逐個網站試，有問題可以複製清單。
- **其他**：中英雙語、私人 GitHub Gist 雲端同步、可以離線用、可以加到主畫面。

## 使用

- 網頁版：GitHub Pages 開咗之後喺 `https://lcy0928.github.io/Lcy/`
- 手機：用 Safari / Chrome 開，揀「加到主畫面」。
- 雲端同步：設定 › 雲端同步 › 建立一個只有 `gist` 權限嘅 GitHub Token，貼入去；第二部機用同一個 Token。

## 開發

純 HTML / CSS / JavaScript（ES modules），冇 build step。

```sh
npm start   # http://localhost:8080
npm test    # 單元測試（Node 22+）
```

| 檔案 | 用途 |
|---|---|
| `js/sites.js` | 預設網站同搜尋網址模板 |
| `js/landed.js` | 到手價計算：VAT、退稅門檻、信用卡、集運、單位價 |
| `js/opw.js`, `scripts/opw-build.mjs` | 消委會開放數據（每日由 GitHub Actions 下載） |
| `js/prices.js`, `scripts/ons-build.mjs`, `scripts/morrisons-build.mjs` | 網站旁邊嘅現時價（消委會、歐洲超市、Morrisons 50 款、Open Prices、ONS、你記錄嘅價） |
| `js/market.js`, `scripts/market-build.mjs` | 荷蘭、奧地利超市開放數據同更新檢查（每日由 GitHub Actions 下載） |
| `js/detect.js` | 由連結認出網站 |
| `js/translate.js`, `js/glossary.js` | 關鍵字翻譯（你改過嘅字 → 香港購物詞庫 → Google 粵語翻譯 → MyMemory） |
| `js/alerts.js` | 降價通知捷徑 |
| `js/scan.js`, `js/ocr.js` | 掃 barcode、讀價錢牌 |
| `js/currency.js` | 匯率同貨幣格式 |
| `js/sync.js` | GitHub Gist 同步同合併 |
| `js/store.js` | 本機資料 |
| `js/main.js` | 介面 |

推送到 `main` 會由 `.github/workflows/pages.yml` 自動測試同部署；佢亦會每日（香港時間 10:23）自動跑一次，更新消委會、荷蘭、奧地利超市同 ONS 數據，並保留 Morrisons 嘅價。Morrisons 嗰步會先睇 robots.txt（只讀准許嘅搜尋頁）、表明身份、每 10 秒先查一頁；一被擋（403/429）即停，保留已查到嘅，唔影響部署。（Sainsbury's 擋 GitHub 伺服器；Tesco、Aldi 條款禁止自動收集；Lidl 英國網上冇日常貨品價。）公開 repo 如果 60 日冇任何更新，GitHub 會暫停排程，要喺 Actions 頁撳 Enable 重新開。

## 注意

- 網站搜尋網址可能因網站改版而失效，可以喺「設定 › 網站」修改，或者用「測試連結」檢查。核實唔到自家搜尋網址嘅網站會用 Google 站內搜尋。
- 消委會數據係超市標價，唔包會員價同埋多件優惠。
- 歐洲超市數據來自社群開放數據項目（checkjebon.nl、Heisse Preise，MIT 授權），唔係超市官方資料；有啲超市已經停咗更新，App 會自動分開顯示。英國冇免費嘅超市開放數據，所以用 Trolley.co.uk 連結。
- VAT、退稅百分比係大約數，以商戶同當地規定為準。英國（大不列顛）自 2021 年起已取消旅客退稅。
