import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { toCsv, type Row } from "@/lib/format";

// CSV exports for HR and Finance. Row-level security decides what each caller can read,
// so a user without access simply gets an empty file.
export async function GET(request: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorised", { status: 401 });

  const year = request.nextUrl.searchParams.get("year");
  const status = request.nextUrl.searchParams.get("status");
  let csv = "";

  if (kind === "leave") {
    let q = supabase
      .from("leave_requests")
      .select("ref, start_date, end_date, days, status, submitted_at, decided_at, decision_remark, employee:employees!leave_requests_employee_id_fkey(full_name, employee_no), leave_type:leave_types(name)")
      .order("start_date", { ascending: false });
    if (year) q = q.eq("year", Number(year));
    if (status) q = q.eq("status", status);
    const { data } = await q;
    const rows = ((data ?? []) as Row[]).map((r) => ({
      ...r,
      employee_no: r.employee?.employee_no,
      employee_name: r.employee?.full_name,
      leave_type_name: r.leave_type?.name,
    }));
    csv = toCsv(rows, [
      { key: "ref", label: "Ref" },
      { key: "employee_no", label: "Employee no" },
      { key: "employee_name", label: "Employee" },
      { key: "leave_type_name", label: "Leave type" },
      { key: "start_date", label: "Start" },
      { key: "end_date", label: "End" },
      { key: "days", label: "Days" },
      { key: "status", label: "Status" },
      { key: "submitted_at", label: "Submitted" },
      { key: "decided_at", label: "Decided" },
      { key: "decision_remark", label: "Remark" },
    ]);
  } else if (kind === "claims") {
    let q = supabase
      .from("claims")
      .select("ref, description, total_amount, currency, status, submitted_at, decided_at, paid_on, payment_reference, employee:employees!claims_employee_id_fkey(full_name, employee_no)")
      .order("submitted_at", { ascending: false });
    if (status) q = q.eq("status", status);
    const { data } = await q;
    const rows = ((data ?? []) as Row[]).map((r) => ({ ...r, employee_no: r.employee?.employee_no, employee_name: r.employee?.full_name }));
    csv = toCsv(rows, [
      { key: "ref", label: "Ref" },
      { key: "employee_no", label: "Employee no" },
      { key: "employee_name", label: "Employee" },
      { key: "description", label: "Title" },
      { key: "total_amount", label: "Amount" },
      { key: "currency", label: "Currency" },
      { key: "status", label: "Status" },
      { key: "submitted_at", label: "Submitted" },
      { key: "decided_at", label: "Approved" },
      { key: "paid_on", label: "Paid on" },
      { key: "payment_reference", label: "Payment ref" },
    ]);
  } else if (kind === "balances") {
    let q = supabase.from("leave_balances").select("*").order("full_name");
    if (year) q = q.eq("year", Number(year));
    const { data } = await q;
    csv = toCsv((data ?? []) as Row[], [
      { key: "full_name", label: "Employee" },
      { key: "leave_type", label: "Leave type" },
      { key: "year", label: "Year" },
      { key: "entitled_days", label: "Entitled" },
      { key: "carried_over_days", label: "Carried over" },
      { key: "used_days", label: "Used" },
      { key: "pending_days", label: "Pending" },
      { key: "balance_days", label: "Balance" },
      { key: "available_days", label: "Available" },
    ]);
  } else {
    return new NextResponse("Unknown export", { status: 404 });
  }

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${kind}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
