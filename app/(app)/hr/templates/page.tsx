import { redirect } from "next/navigation";
import { requireEmployee, HR_ROLES } from "@/lib/session";
import { type Row } from "@/lib/format";
import { TemplateEditor } from "@/components/Onboarding";

export default async function TemplatesPage() {
  const { supabase, me } = await requireEmployee();
  if (!HR_ROLES.includes(me.role)) redirect("/hr/onboarding");

  const [{ data: templates }, { data: items }] = await Promise.all([
    supabase.from("checklist_templates").select("*").order("kind").order("name"),
    supabase.from("checklist_template_items").select("*").order("sort_order"),
  ]);
  const withItems = ((templates ?? []) as Row[]).map((t) => ({ ...t, items: ((items ?? []) as Row[]).filter((i) => i.template_id === t.id) }));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Checklist templates</h1>
          <p className="muted">
            Changes apply to checklists you start from now on. Checklists already running keep the tasks they were started with. Due dates are counted from the
            start date (onboarding) or last working day (offboarding); use a negative number for tasks due before it.
          </p>
        </div>
      </div>
      <TemplateEditor templates={withItems} />
    </>
  );
}
