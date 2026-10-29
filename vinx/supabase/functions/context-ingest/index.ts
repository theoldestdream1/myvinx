import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface IngestEvent {
  source_app?: string;
  capture_type?: string;
  platform?: string;
  app_package?: string;
  raw_content: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function normalize(s: string) {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

function validate(e: any): e is IngestEvent {
  return e && typeof e.raw_content === "string" && e.raw_content.trim().length > 0 && e.raw_content.length < 50000;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing bearer token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = auth.slice("Bearer ".length).trim();
    const tokenHash = await sha256Hex(token);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: userIdData, error: authErr } = await supabase.rpc("validate_device_token", {
      _token_hash: tokenHash,
    });
    if (authErr || !userIdData) {
      return new Response(JSON.stringify({ error: "Invalid or revoked device token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userIdData as string;

    const body = await req.json();
    const events: IngestEvent[] = Array.isArray(body?.batch)
      ? body.batch
      : Array.isArray(body)
      ? body
      : [body];

    const valid = events.filter(validate);
    if (valid.length === 0) {
      return new Response(JSON.stringify({ error: "No valid events" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Compute content hashes
    const prepared = await Promise.all(
      valid.map(async (e) => ({
        user_id: userId,
        source_app: e.source_app ?? null,
        capture_type: e.capture_type ?? "unknown",
        platform: e.platform ?? "android",
        app_package: e.app_package ?? e.source_app ?? null,
        raw_content: e.raw_content,
        client_timestamp: e.timestamp ?? null,
        metadata: e.metadata ?? {},
        content_hash: await sha256Hex(normalize(e.raw_content)),
        status: "queued",
      })),
    );

    // Dedup: drop hashes seen for this user in the last 10 minutes
    const hashes = Array.from(new Set(prepared.map((p) => p.content_hash)));
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: recent } = await supabase
      .from("ingestion_queue")
      .select("content_hash")
      .eq("user_id", userId)
      .in("content_hash", hashes)
      .gte("created_at", tenMinAgo);
    const seen = new Set((recent ?? []).map((r: any) => r.content_hash));
    // Also dedup within this batch itself
    const batchSeen = new Set<string>();
    const toInsert = prepared.filter((p) => {
      if (seen.has(p.content_hash)) return false;
      if (batchSeen.has(p.content_hash)) return false;
      batchSeen.add(p.content_hash);
      return true;
    });

    let inserted = 0;
    if (toInsert.length > 0) {
      const { error: insErr, count } = await supabase
        .from("ingestion_queue")
        .insert(toInsert, { count: "exact" });
      if (insErr) throw insErr;
      inserted = count ?? toInsert.length;
    }

    return new Response(
      JSON.stringify({
        accepted: valid.length,
        queued: inserted,
        deduped: valid.length - inserted,
      }),
      { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("ingest error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});