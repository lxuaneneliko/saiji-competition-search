import { ArrowLeft, Bookmark, WifiOff } from "lucide-react";
import Link from "next/link";

export default function OfflinePage() {
  return (
    <main className="offline-page">
      <div className="ambient-grid" aria-hidden="true" />
      <section className="offline-card">
        <div className="offline-radar" aria-hidden="true"><WifiOff size={34} /></div>
        <span>CONNECTION PAUSED / LOCAL MODE</span>
        <h1>訊號暫時中斷，<br />賽跡仍在你的裝置裡。</h1>
        <p>GitHub 搜尋需要網路連線。恢復連線後重新整理即可繼續；你先前儲存的收藏仍保留在這台裝置。</p>
        <div className="offline-actions">
          <Link href="/"><ArrowLeft size={17} />返回搜尋台</Link>
          <Link href="/?view=saved"><Bookmark size={17} />查看收藏庫</Link>
        </div>
      </section>
    </main>
  );
}
