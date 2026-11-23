import { redirect } from "next/navigation";

export default function SelectedRedirectPage() {
  redirect("/saved");
}
