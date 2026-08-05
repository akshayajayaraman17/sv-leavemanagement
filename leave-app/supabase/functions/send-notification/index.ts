// supabase/functions/send-notification/index.ts
// Sends a decision-notification email via Resend when a leave/comp-off/
// timesheet/regularization request is approved or rejected.
//
// Security note: the client only ever sends { table, recordId }. The
// email's subject/body are always built server-side from the record the
// caller's own JWT is allowed to see (RLS still applies — this uses the
// caller's token, not the service role, to read the record). A caller
// cannot inject arbitrary email content or target an arbitrary recipient;
// they can only trigger a notification for a record they already had
// permission to act on.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const NOTIFY_FROM = Deno.env.get("NOTIFY_FROM_EMAIL") || "notifications@resend.dev";
const APP_URL = Deno.env.get("APP_URL"); // optional — omits the "view in app" link if unset

type TableKey = "leave_requests" | "comp_off_requests" | "timesheets" | "attendance_regularizations";

const TABLE_CONFIG: Record<TableKey, {
  label: string;
  select: string;
  subject: (row: any) => string;
  body: (row: any) => string;
}> = {
  leave_requests: {
    label: "Leave request",
    select: "id, leave_type, from_date, to_date, status, reject_reason, employee:employee_id(full_name, email)",
    subject: (r) => `Your ${r.leave_type} leave request was ${r.status}`,
    body: (r) => `Your ${r.leave_type} leave request for ${r.from_date} to ${r.to_date} was <strong>${r.status}</strong>.` +
      (r.reject_reason ? `<br><br>Reason: ${r.reject_reason}` : ""),
  },
  comp_off_requests: {
    label: "Comp-off request",
    select: "id, worked_date, earned_days, status, employee:employee_id(full_name, email)",
    subject: (r) => `Your comp-off request was ${r.status}`,
    body: (r) => `Your comp-off request for ${r.worked_date} (${r.earned_days} day${r.earned_days === 1 ? "" : "s"}) was <strong>${r.status}</strong>.`,
  },
  timesheets: {
    label: "Timesheet",
    select: "id, week_start, status, reject_reason, employee:employee_id(full_name, email)",
    subject: (r) => `Your timesheet for the week of ${r.week_start} was ${r.status}`,
    body: (r) => `Your timesheet for the week of ${r.week_start} was <strong>${r.status}</strong>.` +
      (r.reject_reason ? `<br><br>Reason: ${r.reject_reason}` : ""),
  },
  attendance_regularizations: {
    label: "Attendance regularization",
    select: "id, status, reject_reason, employee:employee_id(full_name, email), attendance:attendance_id(date)",
    subject: (r) => `Your attendance regularization was ${r.status}`,
    body: (r) => `Your attendance regularization request for ${r.attendance?.date} was <strong>${r.status}</strong>.` +
      (r.reject_reason ? `<br><br>Reason: ${r.reject_reason}` : ""),
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: "Email notifications are not configured (missing RESEND_API_KEY)" }), { status: 501, headers: corsHeaders });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), { status: 401, headers: corsHeaders });
    }

    const { table, recordId } = await req.json();
    if (!table || !recordId || !(table in TABLE_CONFIG)) {
      return new Response(JSON.stringify({ error: "table and recordId are required; table must be a known notification type" }), { status: 400, headers: corsHeaders });
    }
    const config = TABLE_CONFIG[table as TableKey];

    // Scoped to the caller's own JWT — RLS decides what they can see.
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const { data: row, error: rowErr } = await userClient
      .from(table)
      .select(config.select)
      .eq("id", recordId)
      .single();

    if (rowErr || !row || !row.employee?.email) {
      return new Response(JSON.stringify({ error: rowErr?.message || "Record not found or not visible to this caller" }), { status: 404, headers: corsHeaders });
    }
    if (row.status !== "approved" && row.status !== "rejected") {
      return new Response(JSON.stringify({ error: "Notifications are only sent for approved/rejected decisions" }), { status: 400, headers: corsHeaders });
    }

    const subject = config.subject(row);
    const viewLink = APP_URL ? `<p style="margin-top:20px"><a href="${APP_URL}" style="color:#1D9E75">View in Leave Manager →</a></p>` : "";
    const html = `
      <div style="font-family:'DM Sans',Arial,sans-serif;max-width:480px;margin:0 auto;color:#1a1a1a">
        <p>Hi ${row.employee.full_name?.split(" ")[0] || ""},</p>
        <p>${config.body(row)}</p>
        ${viewLink}
        <p style="margin-top:28px;font-size:12px;color:#9e9d98">${config.label} · Leave Manager</p>
      </div>`;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: NOTIFY_FROM,
        to: row.employee.email,
        subject,
        html,
      }),
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      return new Response(JSON.stringify({ error: `Resend API error: ${errText}` }), { status: 502, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ sent: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
