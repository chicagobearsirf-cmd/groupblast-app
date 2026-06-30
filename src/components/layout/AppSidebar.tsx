import {
  LayoutDashboard,
  Users,
  FileUp,
  PenTool,
  ListOrdered,
  History,
  Puzzle,
  Rocket,
  Building2,
  Cloud,
  Settings,
} from "lucide-react";
import { Link, type LinkOptions } from "@tanstack/react-router";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { UserMenu } from "@/components/auth/UserMenu";
import { useSettings } from "@/hooks/use-api";
import { BrandMark } from "@/components/layout/BrandMark";

const items = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard, tour: "nav-dashboard" },
  { title: "Groups", url: "/groups", icon: Users, tour: "nav-groups" },
  { title: "Import", url: "/import", icon: FileUp, tour: "nav-import" },
  { title: "Composer", url: "/compose", icon: PenTool, tour: "nav-composer" },
  { title: "Queue", url: "/queue", icon: ListOrdered, tour: "nav-queue" },
  { title: "History", url: "/history", icon: History, tour: "nav-history" },
  { title: "Extension", url: "/extension", icon: Puzzle, tour: "nav-extension" },
  { title: "Rep Setup", url: "/setup", icon: Rocket, tour: "nav-setup" },
  { title: "Team", url: "/team", icon: Building2, tour: "nav-team" },
  { title: "Cloud Setup", url: "/cloud-setup", icon: Cloud, tour: "nav-cloud-setup" },
  { title: "Settings", url: "/settings", icon: Settings, tour: "nav-settings" },
] as const;

export function AppSidebar() {
  const { data: settings } = useSettings();
  const autoSubmit = settings?.autoSubmitEnabled ?? false;
  return (
    <Sidebar>
      <SidebarContent>
        <div className="flex items-center gap-2 px-3 py-3">
          <BrandMark size={30} showName className="text-base" />
        </div>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <Link to={item.url as LinkOptions["to"]} data-tour={item.tour}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="gap-2">
        <UserMenu />
        <div className="rounded-md border p-3 text-xs text-muted-foreground">
          <Badge variant={autoSubmit ? "destructive" : "secondary"} className="mb-1.5">
            {autoSubmit ? "Auto-submit ON" : "Human-review default"}
          </Badge>
          <p>
            {autoSubmit
              ? "Runner fills and clicks Post automatically. Change in Settings."
              : "Runner fills prepared copy only. Posting remains user-confirmed."}
          </p>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
