import { requireEmployee, HR_ROLES } from "@/lib/session";
import { fmtDate, type Row } from "@/lib/format";
import { HolidayManager } from "@/components/HrForms";

export default async function HolidaysPage() {
  const { supabase, me } = await requireEmployee();
  const { data } = await supabase.from("public_holidays").select("*").order("holiday_date");
  const rows = (data ?? []) as Row[];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Public holidays</h1>
          <p className="muted">Excluded when counting working days. Loaded with the MOM 2026 and 2027 lists. Add next year&rsquo;s once MOM publishes it.</p>
        </div>
      </div>
      {HR_ROLES.includes(me.role) ? (
        <HolidayManager holidays={rows} />
      ) : (
        <div className="card table-wrap">
          <table>
            <tbody>
              {rows.map((h) => (
                <tr key={h.holiday_date}>
                  <td>{fmtDate(h.holiday_date)}</td>
                  <td>{h.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
