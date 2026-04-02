import { redirect } from "next/navigation";

// Job queue monitoring has been consolidated into the main admin dashboard.
// Redirect to the jobs tab on the admin page.
export default function JobMonitorPage(): never {
  redirect("/admin#jobs");
}
