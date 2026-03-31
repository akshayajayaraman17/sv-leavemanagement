// supabase/functions/post-jira-worklog/index.ts
// Posts Jira worklogs using the currently authenticated employee's Jira account.
// @ts-nocheck

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), { status: 401, headers: corsHeaders })
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const { data: jiraAccount, error: jiraError } = await userClient
      .from("jira_accounts")
      .select("*")
      .eq("employee_id", user.id)
      .maybeSingle();

    if (jiraError || !jiraAccount) {
      return new Response(JSON.stringify({ error: jiraError?.message || "Jira account not connected" }), { status: 400, headers: corsHeaders });
    }

    const body = await req.json();
    const { issueKey, timeSpentSeconds, started, comment } = body;

    if (!issueKey || !timeSpentSeconds || !started) {
      return new Response(JSON.stringify({ error: "issueKey, timeSpentSeconds, and started are required" }), { status: 400, headers: corsHeaders });
    }

    const jiraHost = jiraAccount.jira_host.replace(/\/+$/, "");
    const jiraUrl = `${jiraHost}/rest/api/3/issue/${encodeURIComponent(issueKey)}/worklog`;
    const authToken = btoa(`${jiraAccount.jira_email}:${jiraAccount.jira_api_token}`);

    const jiraResponse = await fetch(jiraUrl, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ timeSpentSeconds, started, comment }),
    });

    const responseText = await jiraResponse.text();
    if (!jiraResponse.ok) {
      return new Response(JSON.stringify({ error: `Jira API error ${jiraResponse.status}: ${responseText}` }), {
        status: jiraResponse.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(responseText, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});