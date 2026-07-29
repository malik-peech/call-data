import Sidebar from "@/components/Sidebar";
import { currentUser } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  return (
    <div className="flex h-screen">
      <Sidebar email={user?.email ?? null} />
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
