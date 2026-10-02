# 格價簿 PriceBook

個人格價 App：買嘢之前，一次過喺香港、英國、歐洲嘅網站格價，再計埋運費、VAT、退稅、集運同信用卡外幣手續費，比較真正嘅「到手價」。

A personal price-comparison web app (PWA) for shopping across Hong Kong, the UK and Europe.

## 功能

- **一鍵多站搜尋**：機票、酒店、咖啡器材、生活用品、超市、電子產品。輸入一次，即刻有齊各地網站嘅搜尋連結（Price.com.hk、HKTVmall、消委會價格一覽通、Amazon UK、PriceSpy、idealo、Skyscanner、Booking.com、Carousell、eBay 已售出價等）。可篩選地區同新舊。
- **到手價計算**：海外網購寄港（扣 VAT 出口價）、旅行時當地買（退稅）、運費、集運、入口稅、信用卡外幣手續費，全部換算成你揀嘅貨幣。
- **心水清單 + 價格走勢**：記低每次見到嘅價錢，自動排出最平、顯示走勢圖，設定目標價。
- **二手價參考**：Carousell、eBay 已售出、Vinted、Kleinanzeigen 等。
- **快速比較 + 貨幣換算**：喺店舖即場計，唔使儲存。
- **中英雙語**、可轉比較貨幣、即時匯率（歐洲央行，可自訂）。
- **雲端同步**：用你自己 GitHub 帳號嘅私人 Gist，多部機同步。
- **離線可用**，可以「加到主畫面」當 App 用。

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
| `js/landed.js` | 到手價計算、VAT / 退稅預設 |
| `js/currency.js` | 匯率同貨幣格式 |
| `js/sync.js` | GitHub Gist 同步同合併 |
| `js/store.js` | 本機資料 |
| `js/main.js` | 介面 |

推送到 `main` 會由 `.github/workflows/pages.yml` 自動測試同部署。

## 注意

- 網站搜尋網址可能因網站改版失效，可以喺「設定 › 網站」修改或者新增。
- VAT、退稅百分比係大約數，以商戶同當地規定為準。英國（大不列顛）自 2021 年起已取消旅客退稅。
