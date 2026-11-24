import Link from "next/link";
import { requireEmployee } from "@/lib/session";
import { fmtDate, ROLE_LABEL, type Row } from "@/lib/format";

export default async function DirectoryPage() {
  const { supabase } = await requireEmployee();
  const [{ data: people }, { data: depts }] = await Promise.all([
    supabase.from("employees").select("*").eq("is_active", true).order("full_name"),
    supabase.from("departments").select("id, name"),
  ]);
  const rows = (people ?? []) as Row[];
  const byId: Record<string, Row> = {};
  rows.forEach((p) => (byId[p.id] = p));
  const dept: Record<string, string> = {};
  (depts ?? []).forEach((d) => (dept[d.id] = d.name));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Directory</h1>
          <p className="muted">{rows.length} people</p>
        </div>
      </div>
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Title</th>
              <th>Department</th>
              <th>Reports to</th>
              <th>Email</th>
              <th>Joined</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link href={`/directory/${p.id}`}>{p.full_name}</Link>
                  {p.role !== "employee" && <div className="muted small">{ROLE_LABEL[p.role]}</div>}
                </td>
                <td>{p.job_title ?? "-"}</td>
                <td>{p.department_id ? dept[p.department_id] : "-"}</td>
                <td>{p.manager_id ? byId[p.manager_id]?.full_name : "-"}</td>
                <td>{p.email}</td>
                <td className="nowrap">{fmtDate(p.join_date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
