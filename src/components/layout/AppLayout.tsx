import { HelpCircle } from "lucide-react";
import { Outlet } from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { EnvironmentBanner } from "@/components/layout/EnvironmentBanner";
import { Button } from "@/components/ui/button";
import { TourProvider, useTour } from "@/components/onboarding/TourProvider";
import { TourOverlay } from "@/components/onboarding/TourOverlay";
import { AutomationGuard } from "@/components/automation/AutomationGuard";
import { BrandMark } from "@/components/layout/BrandMark";

function GettingStartedButton() {
  const { start } = useTour();
  return (
    <Button variant="outline" size="sm" onClick={start} data-tour="getting-started">
      <HelpCircle className="mr-2 h-4 w-4" />
      Getting started
    </Button>
  );
}

export function AppLayout() {
  return (
    <TourProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="min-w-0">
          <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger className="-ml-1" />
            <BrandMark size={26} showName className="text-sm" />
            <div className="flex-1" />
            <GettingStartedButton />
          </header>
          <EnvironmentBanner />
          <main className="min-w-0 flex-1 overflow-x-hidden p-4 lg:p-6">
            <div className="mx-auto flex w-full min-w-0 max-w-[1600px] flex-col gap-4 lg:gap-6">
              <Outlet />
            </div>
          </main>
        </SidebarInset>
        <Toaster />
      </SidebarProvider>
      <AutomationGuard />
      <TourOverlay />
    </TourProvider>
  );
}
