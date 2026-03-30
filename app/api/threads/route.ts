export const dynamic = "force-dynamic";
export const revalidate = 0; // 0秒（＝キャッシュせず毎回最新を生成）を指定

import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  const { data, error } = await supabase
    .from("threads")
    .select("*")
    .order("created_at", { ascending: false });
  
  if (error) {
    return NextResponse.json([], { status: 500 });
  }
  
  return NextResponse.json(data ?? [], {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
    },
  });
}