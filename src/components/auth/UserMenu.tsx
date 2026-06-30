import { Link } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/auth-context";

/** Current-user display + sign out, shown in the sidebar footer. */
export function UserMenu() {
  const { user, status, mode, signOut } = useAuth();

  if (mode === "local") {
    return (
      <div className="rounded-md border p-3 text-xs text-muted-foreground">
        <Badge variant="secondary" className="mb-1.5">
          Local operator · admin
        </Badge>
        <p>Single-machine mode — no sign-in needed.</p>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="rounded-md border p-3 text-xs text-muted-foreground">Checking session…</div>
    );
  }

  if (!user) {
    return (
      <div className="rounded-md border p-3 text-xs text-muted-foreground">
        <p className="mb-2">You're signed out.</p>
        <Button asChild variant="outline" size="sm" className="w-full">
          <Link to="/login">Sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-md border p-3 text-xs">
      <div className="truncate font-medium" title={user.email ?? undefined}>
        {user.email ?? "Signed in"}
      </div>
      <Badge variant="secondary" className="w-max capitalize">
        {user.role}
      </Badge>
      <Button variant="outline" size="sm" className="mt-1" onClick={() => void signOut()}>
        <LogOut className="mr-2 h-3.5 w-3.5" /> Sign out
      </Button>
    </div>
  );
}
