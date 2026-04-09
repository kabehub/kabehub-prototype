import type { Metadata } from "next";
import LegalLayout from "@/components/LegalLayout";

export const metadata: Metadata = {
  title: "プライバシーポリシー | KabeHub",
  description: "KabeHubプライバシーポリシー",
};

export default function PrivacyPage() {
  return (
    <LegalLayout title="プライバシーポリシー" updatedAt="2026年4月9日">
      <section>
        <h2>1. 事業者情報</h2>
        <p>
          合同会社カベハブ（以下「当社」）は、個人情報保護法その他の関連法令を遵守し、ユーザーの個人情報を適切に管理します。
        </p>
      </section>

      <section>
        <h2>2. 取得する情報</h2>
        <p>当社は以下の情報を取得します。</p>
        <h3>2-1. Googleログイン時に取得する情報</h3>
        <ul>
          <li>メールアドレス</li>
          <li>表示名（Googleアカウント名）</li>
          <li>プロフィール画像URL</li>
        </ul>
        <h3>2-2. サービス利用中に生成・保存される情報</h3>
        <ul>
          <li>ユーザーが入力・保存した会話ログ・メモ・タグ・タイトル等</li>
          <li>スレッドの公開設定・フォルダ設定等のメタデータ</li>
          <li>いいね・引継ぎ等の行動履歴</li>
          <li>プロフィール情報（ハンドルネーム・自己紹介等）</li>
        </ul>
        <h3>2-3. 自動的に収集される情報</h3>
        <ul>
          <li>IPアドレス・ブラウザ情報（Supabaseの認証ログ等）</li>
          <li>アクセスログ（Vercelのインフラ機能による）</li>
        </ul>
      </section>

      <section>
        <h2>3. 利用目的</h2>
        <p>取得した情報は以下の目的に使用します。</p>
        <ul>
          <li>本サービスの提供・維持・改善</li>
          <li>ユーザー認証・アカウント管理</li>
          <li>不正利用の防止・セキュリティの確保</li>
          <li>サービスに関するお知らせの送付（重要なもののみ）</li>
          <li>統計情報の集計・分析（個人を特定しない形式）</li>
        </ul>
      </section>

      <section>
        <h2>4. APIキーの取り扱い</h2>
        <p>
          セルフプランをご利用のユーザーがAIプロバイダー（Anthropic・Google・OpenAI）のAPIキーを設定する場合、当該APIキーはユーザー自身のブラウザのLocalStorageにのみ保存されます。<strong>当社のサーバーはAPIキーを収集・保存・処理しません。</strong>APIキーの管理はユーザーの責任において行ってください。
        </p>
      </section>

      <section>
        <h2>5. 第三者提供</h2>
        <p>
          当社は、以下の場合を除き、ユーザーの個人情報を第三者に提供しません。
        </p>
        <ul>
          <li>ユーザーの同意がある場合</li>
          <li>法令に基づく開示要請があった場合</li>
          <li>人の生命・身体・財産の保護のため必要な場合</li>
        </ul>
        <h3>利用している主な外部サービス</h3>
        <ul>
          <li><strong>Supabase</strong>（認証・データベース）: <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer">プライバシーポリシー</a></li>
          <li><strong>Vercel</strong>（ホスティング・アクセスログ）: <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer">プライバシーポリシー</a></li>
          <li><strong>Google</strong>（OAuth認証）: <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">プライバシーポリシー</a></li>
        </ul>
        <h3>アクセス解析について</h3>
        <p>
          当社は、サービス改善のためアクセス解析ツールを導入する場合があります。解析ツールを導入した際は、本ポリシーを更新し利用ツール名およびそのプライバシーポリシーへのリンクを追記します。現時点では個人を特定するためのトラッキングは行っていません。
        </p>
      </section>

      <section>
        <h2>6. CookieおよびLocalStorageの利用</h2>
        <p>
          本サービスでは、ログイン状態の維持のためにCookieを使用します。また、APIキーや設定情報の保存にブラウザのLocalStorageを使用します。ブラウザの設定によりCookieを無効にすることができますが、その場合、本サービスの一部機能が正常に動作しない場合があります。
        </p>
      </section>

      <section>
        <h2>7. 個人情報の管理・保管</h2>
        <p>
          個人情報はSupabase（データセンター: 東京リージョン）に保管します。当社は適切なアクセス制御・Row Level Security（RLS）を設定し、不正アクセスからデータを保護します。<strong>ただし、本サービスは現在アルファ版であるため、万が一のシステム不具合によるデータ流出リスクを完全に排除することはできません。ユーザーにおかれましては、高度な機密性・秘匿性を要する情報の入力はお控えください。</strong>
        </p>
      </section>

      <section>
        <h2>8. 個人情報の削除</h2>
        <p>
          ユーザーは設定ページからアカウントを削除することができます。アカウント削除時には、当該ユーザーの個人情報およびすべての会話ログを削除します。なお、他のユーザーが引継ぎ機能により複製したコンテンツについては、引継ぎ先の管理下となり削除されない場合があります。
        </p>
      </section>

      <section>
        <h2>9. 開示・訂正・削除の請求</h2>
        <p>
          個人情報の開示・訂正・利用停止等をご希望の場合は、<a href="mailto:hello@kabehub.com">hello@kabehub.com</a> までご連絡ください。本人確認の上、合理的な期間内に対応します。
        </p>
      </section>

      <section>
        <h2>10. 未成年者のプライバシー</h2>
        <p>
          本サービスは13歳未満のユーザーを対象としていません。13歳未満のユーザーが登録していることが判明した場合、当該アカウントを削除します。
        </p>
      </section>

      <section>
        <h2>11. プライバシーポリシーの変更</h2>
        <p>
          本ポリシーは必要に応じて改定します。重要な変更がある場合は本サービス上でお知らせします。
        </p>
      </section>

      <section>
        <h2>12. お問い合わせ</h2>
        <p>
          個人情報の取り扱いに関するお問い合わせは <a href="mailto:hello@kabehub.com">hello@kabehub.com</a> までご連絡ください。
        </p>
      </section>
    </LegalLayout>
  );
}
