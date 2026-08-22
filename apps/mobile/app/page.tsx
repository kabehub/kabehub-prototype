"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";

import { mobileAccessTokenProvider } from "../lib/accessTokenProvider";
import { createMobileApiClient } from "../lib/api-client";
import { startGoogleSignIn } from "../lib/auth/oauth";
import { supabase } from "../lib/supabase/client";

type VerificationState =
  | { kind: "loading" }
  | { kind: "signedOut" }
  | { kind: "signedIn"; session: Session }
  | { kind: "error"; message: string };

const apiClient = createMobileApiClient(mobileAccessTokenProvider);

export default function HomePage() {
  const [state, setState] = useState<VerificationState>({ kind: "loading" });
  const [chatTestResult, setChatTestResult] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        setState({
          kind: "error",
          message: `getSession failed: ${error.message}`,
        });
        return;
      }
      setState(
        data.session
          ? { kind: "signedIn", session: data.session }
          : { kind: "signedOut" }
      );
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // Initial loading is handled by getSession(). Only apply later changes here.
      if (event === "INITIAL_SESSION") return;
      setState(
        session ? { kind: "signedIn", session } : { kind: "signedOut" }
      );
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  function handleSignIn() {
    startGoogleSignIn().catch((err) => {
      setState({
        kind: "error",
        message: `startGoogleSignIn failed: ${(err as Error).message}`,
      });
    });
  }

  async function handleChatTest() {
    setChatTestResult("実行中...");

    try {
      const res = await apiClient.request("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: null,
          messages: [],
          userContent: "task8 verification",
          provider: "claude",
          isTemporary: true,
        }),
      });
      const text = await res.text();
      let body: unknown;

      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }

      setChatTestResult(`status=${res.status} body=${JSON.stringify(body)}`);
    } catch (err) {
      setChatTestResult(`networkError: ${(err as Error).message}`);
    }
  }

  return (
    <main>
      <h1>KabeHub Mobile (Task8 検証用)</h1>

      {state.kind === "loading" && <p>確認中...</p>}
      {state.kind === "signedOut" && (
        <button onClick={handleSignIn}>Googleでサインイン</button>
      )}
      {state.kind === "signedIn" && (
        <p>ログイン済み: {state.session.user.email}</p>
      )}
      {state.kind === "error" && (
        <p style={{ color: "red" }}>検証エラー: {state.message}</p>
      )}

      {(state.kind === "signedOut" || state.kind === "signedIn") && (
        <div>
          <button onClick={handleChatTest}>/api/chat テスト実行</button>
          {chatTestResult && <pre>{chatTestResult}</pre>}
        </div>
      )}
    </main>
  );
}
