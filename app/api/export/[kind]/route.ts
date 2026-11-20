import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { csv } from "@/lib/utils";

type Name = { full_name: string } | null;

export async function GET(request: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  let body: string;
  if (kind === "leave") {
    const year = Number(request.nextUrl.searchParams.get("year")) || new Date().getFullYear();
    const { data, error } = await supabase
      .from("leave_requests")
      .select("ref, start_date, end_date, days, status, flags, decided_at, employee:employees!leave_requests_employee_id_fkey(full_name), approver:employees!leave_requests_approver_id_fkey(full_name), leave_types(name)")
      .eq("year", year)
      .order("start_date");
    if (error) return new NextResponse(error.message, { status: 500 });
    body = csv([
      ["Ref", "Employee", "Leave type", "Start", "End", "Days", "Status", "Approver", "Decided at", "Flags"],
      ...(data ?? []).map((r) => [
        r.ref,
        (r.employee as unknown as Name)?.full_name,
        (r.leave_types as unknown as { name: string } | null)?.name,
        r.start_date,
        r.end_date,
        r.days,
        r.status,
        (r.approver as unknown as Name)?.full_name,
        r.decided_at,
        (r.flags ?? []).join("; "),
      ]),
    ]);
  } else if (kind === "claims") {
    const { data, error } = await supabase
      .from("claims")
      .select("ref, description, total_amount, currency, status, submitted_at, decided_at, paid_on, payment_reference, employee:employees!claims_employee_id_fkey(full_name)")
      .order("submitted_at", { ascending: false });
    if (error) return new NextResponse(error.message, { status: 500 });
    body = csv([
      ["Ref", "Employee", "Title", "Amount", "Currency", "Status", "Submitted", "Approved", "Paid on", "Payment ref"],
      ...(data ?? []).map((c) => [
        c.ref,
        (c.employee as unknown as Name)?.full_name,
        c.description,
        c.total_amount,
        c.currency,
        c.status,
        c.submitted_at,
        c.decided_at,
        c.paid_on,
        c.payment_reference,
      ]),
    ]);
  } else {
    return new NextResponse("Not found", { status: 404 });
  }

  return new NextResponse(body, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${kind}-export.csv"` },
  });
}
