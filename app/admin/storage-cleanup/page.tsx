import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function StorageCleanupAdminPage() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // RLSにより、Rui氏以外はここで0件になる（エラーにはならない）
  const { data: runs, error } = await supabase
    .from("storage_cleanup_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(30);

  return (
    <div style={{ padding: "2rem" }}>
      <h1>Storage Cleanup 実行状況</h1>
      {error && <p>読み込みエラーが発生しました。</p>}
      {!error && (!runs || runs.length === 0) && <p>実行履歴がありません。</p>}
      {!error && runs && runs.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>開始</th>
              <th>終了</th>
              <th>状態</th>
              <th>モード</th>
              <th>候補</th>
              <th>上限到達</th>
              <th>成功</th>
              <th>失敗</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id}>
                <td>{run.started_at}</td>
                <td>{run.finished_at ?? "-"}</td>
                <td>{run.status}</td>
                <td>{run.mode}</td>
                <td>{run.candidate_count}</td>
                <td>{run.limit_reached ? "はい" : "いいえ"}</td>
                <td>{run.succeeded_count}</td>
                <td>{run.failed_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
