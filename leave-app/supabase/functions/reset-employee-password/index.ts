// supabase/functions/reset-employee-password/index.ts
// Runs server-side with service_role key — lets an admin set an
// employee's password directly via the Auth Admin API. Exists because
// the email-based Forgot Password flow depends on SMTP being correctly
// configured, which isn't something the app itself can guarantee; this
// gives admins a way to unblock someone that doesn't depend on email at
// all — same idea as Bulk Add's "shared password" mode.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Mirrors src/lib/password.js's passwordError() — duplicated rather than
// shared since this runs in Deno, not the frontend bundle. Keep in sync
// if the rule changes there.
function passwordError(pw: string): string | null {
  if (!pw || pw.length < 8)  return "Min 8 characters";
  if (!/[A-Z]/.test(pw))     return "Must include an uppercase letter";
  if (!/[a-z]/.test(pw))     return "Must include a lowercase letter";
  if (!/[0-9]/.test(pw))     return "Must include a number";
  if (!/[!@#$%&*]/.test(pw)) return "Must include a symbol (!@#$%&*)";
  return null;
}

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

    const { id, password } = await req.json();
    if (!id || !password) {
      return new Response(JSON.stringify({ error: "id and password are required" }), { status: 400, headers: corsHeaders });
    }

    const pwErr = passwordError(password);
    if (pwErr) {
      return new Response(JSON.stringify({ error: pwErr }), { status: 400, headers: corsHeaders });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { error: pwUpdateErr } = await adminClient.auth.admin.updateUserById(id, { password });
    if (pwUpdateErr) throw pwUpdateErr;

    // Same as any admin-set password (single-add, bulk-add): the admin
    // now knows it, so force the employee to replace it on next login.
    const { data: emp, error: empErr } = await adminClient
      .from("employees")
      .update({ must_change_password: true })
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
