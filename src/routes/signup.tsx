import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/components/auth/auth-context";

export const Route = createFileRoute("/signup")({
  component: SignupRedirect,
});

function SignupRedirect() {
  const { mode } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    void navigate({ to: mode === "local" ? "/" : "/login" });
  }, [mode, navigate]);
  return null;
}
