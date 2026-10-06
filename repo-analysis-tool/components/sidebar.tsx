import { analysisOf } from "@/lib/history";
import { listRepos } from "@/lib/repo-store";
import { SidebarNav, type SidebarRepo } from "@/components/sidebar-nav";

/** Server half of the sidebar: reads the registry on every request. */
export async function AppSidebar() {
  const repos = await listRepos();
  const items: SidebarRepo[] = repos.map((repo) => ({
    id: repo.id,
    name: repo.name,
    status: repo.status,
    analysisStatus: analysisOf(repo).status,
    commitCount: repo.commitCount,
  }));
  return <SidebarNav repos={items} />;
}
