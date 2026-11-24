import { requireEmployee, HR_ROLES } from "@/lib/session";
import { type Row } from "@/lib/format";
import { Recruiting } from "@/components/Recruiting";

export default async function RecruitingPage() {
  const { supabase, me } = await requireEmployee();
  const canEdit = HR_ROLES.includes(me.role);

  const [{ data: openings }, { data: candidates }, { data: departments }, { data: managers }] = await Promise.all([
    supabase
      .from("job_openings")
      .select("*, department:departments(name), hiring_manager:employees!job_openings_hiring_manager_id_fkey(full_name)")
      .order("created_at", { ascending: false }),
    supabase.from("candidates").select("*").order("applied_on", { ascending: false }),
    supabase.from("departments").select("id, name").order("name"),
    supabase.from("employees").select("id, full_name").eq("is_active", true).order("full_name"),
  ]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Recruiting</h1>
          <p className="muted">
            Openings and candidates. Candidate details are personal data: only HR, Admin, the Director and the hiring manager of an opening can see them. Delete
            unsuccessful candidates when you no longer need their details.
          </p>
        </div>
      </div>
      <Recruiting
        openings={(openings ?? []) as Row[]}
        candidates={(candidates ?? []) as Row[]}
        departments={(departments ?? []) as Row[]}
        managers={(managers ?? []) as Row[]}
        canEdit={canEdit}
      />
    </>
  );
}
