import { redirect } from "next/navigation";
import { hasExistingUsers } from "@/lib/setup-guard";

export default async function Home() {
  redirect((await hasExistingUsers()) ? "/login" : "/setup");
}
