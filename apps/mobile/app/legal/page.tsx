import type { Metadata } from "next";
import LegalLayout from "@/components/LegalLayout";

export const metadata: Metadata = {
  title: "特定商取引法に基づく表記 | KabeHub",
  description: "特定商取引法に基づく表記",
};

export default function LegalPage() {
  return (
    <LegalLayout title="特定商取引法に基づく表記" updatedAt="2026年4月9日">
      <div className="legal-table-wrapper">
        <table>
          <tbody>
            <tr>
              <th>販売事業者名</th>
              <td>合同会社カベハブ</td>
            </tr>
            <tr>
              <th>代表者名</th>
              <td>松本類</td>
            </tr>
            <tr>
              <th>所在地</th>
              <td>東京都品川区上大崎三丁目14番34号 プラスワン402</td>
            </tr>
            <tr>
              <th>電話番号</th>
              <td>
                03-4400-4134<br />
                <small>※お問い合わせはメール（<a href="mailto:hello@kabehub.com">hello@kabehub.com</a>）にて優先的に受け付けております。</small>
              </td>
            </tr>
            <tr>
              <th>メールアドレス</th>
              <td><a href="mailto:hello@kabehub.com">hello@kabehub.com</a></td>
            </tr>
            <tr>
              <th>サービス名</th>
              <td>KabeHub（カベハブ）</td>
            </tr>
            <tr>
              <th>サービスURL</th>
              <td><a href="https://kabehub.com" target="_blank" rel="noopener noreferrer">https://kabehub.com</a></td>
            </tr>
            <tr>
              <th>販売価格</th>
              <td>
                現在、本サービスは無料で提供しています。<br />
                有料プラン開始時は、サービス上での事前告知および本ページの更新をもってお知らせします。
              </td>
            </tr>
            <tr>
              <th>代金の支払時期・方法</th>
              <td>有料プラン提供開始時に別途定めます。</td>
            </tr>
            <tr>
              <th>サービスの提供時期</th>
              <td>登録完了後、即時ご利用いただけます。</td>
            </tr>
            <tr>
              <th>返品・キャンセルについて</th>
              <td>
                デジタルコンテンツ・サービスの性質上、提供開始後の返金は原則お受けできません。<br />
                ただし、当社の責による重大な障害が発生した場合は、個別にご相談ください。
              </td>
            </tr>
            <tr>
              <th>動作環境</th>
              <td>
                最新版のChrome・Firefox・Safari・Edgeを推奨します。<br />
                JavaScript・Cookieが有効になっている必要があります。
              </td>
            </tr>
            <tr>
              <th>特記事項</th>
              <td>
                本サービスはClaude（Anthropic）・Gemini（Google）・ChatGPT（OpenAI）等のAI APIと連携しています。セルフプランをご利用の場合、各AIプロバイダーのAPIキーおよびAPI利用料は別途ユーザー自身がご負担ください。
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </LegalLayout>
  );
}
