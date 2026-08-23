# 賽跡 SAIJI

賽跡是一套可安裝的 GitHub 競賽作品搜尋 PWA。輸入任何競賽名稱後，系統會擴充正式名稱、年份、主辦單位與別名，搜尋公開 Repository，讀取 README 證據並依可信度排序。

正式版：[saiji-search.vercel.app](https://saiji-search.vercel.app)

## 完整功能

- 任意競賽名稱搜尋，不綁定 SDGs 或特定主辦單位
- 常見簡稱與誤寫校正，例如「新竹青春點子」會自動擴充成「新竹縣青春靚點子全國學生創業挑戰賽」
- 依 Repository 描述與 README 判斷內容語系，中文優先、英文為輔，排除日文與韓文結果
- 年份／屆次、主辦單位與中英文別名進階搜尋
- Repository 名稱、描述、README、Topics 與 Demo 訊號交叉取證
- 強證據、可能相關、探索線索三層分類
- 個人 Profile、Portfolio 與資源清單降權，減少單純提及造成的誤判
- 程式語言、證據等級、Demo 狀態篩選
- 關聯度、更新時間、Stars 排序
- 最近搜尋、可分享的搜尋網址、瀏覽器本機收藏庫
- 篩選後結果匯出 UTF-8 CSV
- GitHub API 使用狀態、部分失敗警告與錯誤處理
- 桌機、平板與手機響應式介面
- 可安裝到 Windows、macOS、Android 與 iPhone／iPad 主畫面
- PWA 獨立視窗、App shortcuts、safe-area 與離線狀態提示
- 離線時保留 App 介面與裝置上的收藏，不快取 GitHub 搜尋 API 結果

## 搜尋與可信度

賽跡只處理 GitHub 公開內容。可信度會綜合以下訊號：

1. 競賽完整名稱是否出現在 Repository 名稱、描述、README 或 Topics。
2. README 中的競賽名稱附近是否有「參賽作品」、「built for」、「submission」等直接參賽語句。
3. 年份與主辦單位是否同時命中。
4. 是否有 Demo、成果或展示連結。
5. Repository 是否只是個人 Profile、Portfolio 或資源清單。

搜尋結果是可追查的公開線索，不等同主辦單位正式參賽名單。每張結果卡都會保留原始 Repository 與 README 連結供人工確認。

## 本機執行

```powershell
npm.cmd install
npm.cmd run dev
```

開啟 `http://localhost:3000`。

## 安裝成 App

- Chrome／Edge／Android：開啟正式網站後點選「安裝 App」，或使用網址列的安裝圖示。
- iPhone／iPad：在 Safari 點選分享，再選「加入主畫面」。
- PWA 安裝與 service worker 需要 HTTPS；本機開發可使用 `localhost`。

## 環境變數

App 在沒有 Token 時仍可搜尋公開 Repository。正式公開服務建議在伺服器端加入唯讀 GitHub Token，以提高 API 額度：

```text
GITHUB_TOKEN=your_read_only_token
```

Token 只會在 `/api/search` 伺服器端使用，不會傳送到瀏覽器。請勿提交 `.env` 或 Token。

## 品質檢查

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

## 技術架構

- Next.js App Router、React、TypeScript
- GitHub REST Repository Search API
- GitHub Raw Content 讀取公開 README
- Vercel Node.js Function 與 15 分鐘快取
- Web App Manifest、Service Worker、192／512／Maskable App icons
- LocalStorage 收藏與最近搜尋

## 部署方式

這個專案包含伺服器端 GitHub API 路由，不能只放在 GitHub Pages。GitHub 保存與協作原始碼，正式 App 建議由 Vercel 連接本 Repository 自動部署。

1. Fork 或 clone Repository。
2. 在 Vercel 匯入專案。
3. 設定伺服器端環境變數 `GITHUB_TOKEN`。
4. 部署後以 HTTPS 網址檢查 Manifest、Service Worker 與安裝提示。

## 隱私與資料邊界

- 不搜尋私人 Repository。
- 不收集 GitHub 使用者 Email 或其他非必要個資。
- 不繞過 GitHub 權限、驗證或速率限制。
- 收藏與最近搜尋只保存在使用者瀏覽器。
