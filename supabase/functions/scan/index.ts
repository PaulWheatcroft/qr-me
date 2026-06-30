import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sendNotification(label: string, bothScanned: boolean) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const to = Deno.env.get("NOTIFY_EMAIL");
  if (!apiKey || !to) {
    console.warn("RESEND_API_KEY or NOTIFY_EMAIL not set; skipping email");
    return;
  }
  const from = Deno.env.get("NOTIFY_FROM") ?? "onboarding@resend.dev";
  const subject = bothScanned
    ? `Both tokens scanned - transfer pending`
    : `Token ${label} was just scanned`;
  const text = bothScanned
    ? `Token ${label} was just scanned. Both tokens have now been scanned. Time to do the transfer, then set gift.status = 'transferred' in Supabase.`
    : `Token ${label} was just scanned. Waiting on the other token.`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, text }),
  });
  if (!res.ok) {
    console.error("Resend error:", res.status, await res.text());
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Token can come from POST body { token } or ?token= / ?t= query param.
  let token: string | null = null;
  const url = new URL(req.url);
  token = url.searchParams.get("token") ?? url.searchParams.get("t");
  if (!token && req.method === "POST") {
    try {
      const body = await req.json();
      token = body?.token ?? null;
    } catch (_) {
      // ignore
    }
  }

  if (!token) {
    return json({ state: "invalid", error: "Missing token" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: tokenRow, error: tokenErr } = await supabase
    .from("tokens")
    .select("token, label, scanned_at")
    .eq("token", token)
    .maybeSingle();

  if (tokenErr) {
    console.error("token lookup error", tokenErr);
    return json({ state: "error" }, 500);
  }
  if (!tokenRow) {
    return json({ state: "invalid", error: "Unknown token" }, 404);
  }

  const wasAlreadyScanned = tokenRow.scanned_at !== null;

  // Record the first scan of this token.
  if (!wasAlreadyScanned) {
    const { error: updErr } = await supabase
      .from("tokens")
      .update({ scanned_at: new Date().toISOString() })
      .eq("token", token)
      .is("scanned_at", null);
    if (updErr) {
      console.error("update error", updErr);
      return json({ state: "error" }, 500);
    }
  }

  // Read the full current state.
  const { data: allTokens, error: allErr } = await supabase
    .from("tokens")
    .select("label, scanned_at");
  const { data: gift, error: giftErr } = await supabase
    .from("gift")
    .select("status")
    .eq("id", 1)
    .maybeSingle();

  if (allErr || giftErr || !allTokens) {
    console.error("state read error", allErr, giftErr);
    return json({ state: "error" }, 500);
  }

  const scannedCount = allTokens.filter((t) => t.scanned_at !== null).length;
  const bothScanned = scannedCount >= allTokens.length;
  const status = gift?.status ?? "pending";

  // Notify only on the first scan of a token (avoids refresh spam).
  if (!wasAlreadyScanned) {
    await sendNotification(tokenRow.label, bothScanned);
  }

  let state: string;
  if (status === "transferred") {
    state = "transferred";
  } else if (bothScanned) {
    state = "both";
  } else if (wasAlreadyScanned) {
    state = "already_scanned";
  } else {
    state = "first";
  }

  return json({ state, alreadyScanned: wasAlreadyScanned, label: tokenRow.label });
});
