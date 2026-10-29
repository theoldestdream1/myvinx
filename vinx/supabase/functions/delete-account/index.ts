import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, json } from "../_shared/cors.ts";
import { adminClient, authenticate } from "../_shared/auth.ts";

// Permanently deletes the caller's account. All tables reference auth.users with
// ON DELETE CASCADE, so rows go with the user. Uploaded screenshots are removed first.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const caller = await authenticate(req);
    if (!caller || caller.kind !== "user") return json({ error: "Unauthorized" }, 401);
    const supabase = adminClient();
    const userId = caller.userId;

    // Remove the user's stored media (folder = user id)
    const { data: files } = await supabase.storage.from("memory-media").list(userId, { limit: 1000 });
    if (files && files.length > 0) {
      await supabase.storage.from("memory-media").remove(files.map((f) => `${userId}/${f.name}`));
    }

    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (error) throw error;

    return json({ success: true });
  } catch (e) {
    console.error("delete-account error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
