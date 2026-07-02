import {
  LayoutDashboard,
  Users,
  FileUp,
  PenTool,
  ListOrdered,
  History,
  Settings,
  ShieldCheck,
  Sparkles,
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
import { useAuth } from "@/components/auth/auth-context";
import { usePlanStatus } from "@/hooks/use-plan-status";

const items = [
  { title: "Home", url: "/", icon: LayoutDashboard, tour: "nav-dashboard" },
  { title: "My Groups", url: "/groups", icon: Users, tour: "nav-groups" },
  { title: "New Post", url: "/compose", icon: PenTool, tour: "nav-composer" },
  { title: "Automated Content", url: "/content", icon: Sparkles, tour: "nav-content" },
  { title: "Scheduled", url: "/queue", icon: ListOrdered, tour: "nav-queue" },
  { title: "History", url: "/history", icon: History, tour: "nav-history" },
  { title: "Add Groups", url: "/import", icon: FileUp, tour: "nav-import" },
  { title: "Settings", url: "/settings", icon: Settings, tour: "nav-settings" },
] as const;

export function AppSidebar() {
  const { data: settings } = useSettings();
  const { mode } = useAuth();
  const planStatus = usePlanStatus();
  const autoSubmit = settings?.autoSubmitEnabled ?? false;
  const visibleItems =
    mode !== "local" && planStatus.isAdmin
      ? [...items, { title: "Admin", url: "/admin", icon: ShieldCheck, tour: "nav-admin" }]
      : items;

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
              {visibleItems.map((item) => (
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
