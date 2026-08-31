// supabase/functions/offboard-employee/index.ts
// Runs server-side with service_role key — deactivating/reactivating an
// employee needs to actually ban/unban their Supabase Auth account.
// employees.is_active alone was never checked at sign-in, so a plain
// table update never actually blocked access.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Supabase's ban_duration has no "forever" sentinel — 100 years stands in for one.
const PERMANENT_BAN = "876000h";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Verify caller is an admin using the anon client + their JWT
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
    );

    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const { data: caller } = await userClient
      .from("employees").select("role").eq("id", user.id).single();

    if (caller?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Forbidden: admin only" }), { status: 403, headers: corsHeaders });
    }

    const body = await req.json();
    const { id, action, exit_date, exit_reason } = body;

    if (!id || !["deactivate", "reactivate"].includes(action)) {
      return new Response(JSON.stringify({ error: "id and a valid action are required" }), { status: 400, headers: corsHeaders });
    }

    if (action === "deactivate" && id === user.id) {
      return new Response(JSON.stringify({ error: "You cannot deactivate your own account" }), { status: 400, headers: corsHeaders });
    }

    // Service role client — bypasses RLS, can call the Auth admin API
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Same last-admin guard the client shows proactively — enforced here
    // too since this function is the one place that can't be bypassed by
    // calling the client SDK directly.
    if (action === "deactivate") {
      const { data: target } = await adminClient.from("employees").select("role").eq("id", id).single();
      if (target?.role === "admin") {
        const { count } = await adminClient
          .from("employees")
          .select("id", { count: "exact", head: true })
          .eq("role", "admin").eq("is_active", true).neq("id", id);
        if (!count) {
          return new Response(JSON.stringify({ error: "Cannot deactivate — at least one active admin must remain" }), { status: 400, headers: corsHeaders });
        }
      }
    }

    const { error: banErr } = await adminClient.auth.admin.updateUserById(id, {
      ban_duration: action === "deactivate" ? PERMANENT_BAN : "none",
    });
    if (banErr) throw banErr;

    const updates = action === "deactivate"
      ? { is_active: false, exit_date: exit_date || new Date().toISOString().split("T")[0], exit_reason: exit_reason || null }
      : { is_active: true, exit_date: null, exit_reason: null };

    const { data: emp, error: empErr } = await adminClient
      .from("employees")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (empErr) throw empErr;

    return new Response(JSON.stringify(emp), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || String(err) }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
