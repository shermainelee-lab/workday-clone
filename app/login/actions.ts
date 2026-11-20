"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const back = (kind: "err" | "ok", msg: string): never => redirect(`/login?${kind}=${encodeURIComponent(msg)}`);

export async function signIn(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  });
  if (error) back("err", error.message);
  redirect("/");
}

export async function signUp(formData: FormData) {
  const supabase = await createClient();
  const origin = (await headers()).get("origin") ?? "";
  const { error } = await supabase.auth.signUp({
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });
  if (error) back("err", error.message);
  back("ok", "Check your inbox to confirm your email, then sign in. Use the email address HR has on file for you.");
}
