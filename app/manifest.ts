import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "賽跡 SAIJI｜競賽作品雷達",
    short_name: "賽跡",
    description: "搜尋 GitHub 公開競賽作品，保留 README 證據、可信度與展示連結。",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    background_color: "#07110f",
    theme_color: "#07110f",
    lang: "zh-Hant-TW",
    orientation: "any",
    categories: ["education", "productivity", "utilities"],
    icons: [
      { src: "/icons/saiji-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/saiji-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/saiji-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      {
        name: "搜尋競賽作品",
        short_name: "搜尋",
        description: "直接前往競賽搜尋台",
        url: "/?source=shortcut#search",
        icons: [{ src: "/icons/saiji-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "我的收藏庫",
        short_name: "收藏",
        description: "查看保存在裝置上的專案",
        url: "/?view=saved&source=shortcut",
        icons: [{ src: "/icons/saiji-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
