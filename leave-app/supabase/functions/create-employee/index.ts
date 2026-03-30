// supabase/functions/create-employee/index.ts
// Runs server-side with service_role key — can create auth users

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    // Use service role client to create the auth user
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const {
      email, password, full_name, employee_code,
      phone, department, designation, role,
      joining_date, manager_id,
    } = body;

    // 1. Create auth user
    const { data: authData, error: authErr } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authErr) throw authErr;
    const newUserId = authData.user.id;

    // 2. Insert employee profile
    const { data: emp, error: empErr } = await adminClient
      .from("employees")
      .insert({
        id: newUserId,
        email,
        full_name,
        employee_code,
        phone: phone || null,
        department: department || null,
        designation: designation || null,
        role: role || "employee",
        joining_date,
        manager_id: manager_id || null,
      })
      .select()
      .single();

    if (empErr) {
      // Rollback auth user
      await adminClient.auth.admin.deleteUser(newUserId);
      throw empErr;
    }

    return new Response(JSON.stringify({ id: newUserId, ...emp }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || String(err) }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
