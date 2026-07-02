import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AlertCircle, Bug, Loader2, Save, ShieldCheck, TicketPercent, Users } from "lucide-react";
import { useAuth } from "@/components/auth/auth-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  type AdminAppError,
  type AdminErrorKind,
  type AdminPromoCode,
  useAdminCustomers,
  useAdminErrors,
  useAdminPromoCodes,
  useAdminStats,
  useUpdatePromoAffiliate,
} from "@/hooks/use-admin";
import { usePlanStatus } from "@/hooks/use-plan-status";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
});

function AdminPage() {
  const { mode, status: authStatus } = useAuth();
  const planStatus = usePlanStatus();
  const [errorKind, setErrorKind] = useState<AdminErrorKind | "all">("all");
  const canView = mode !== "local" && planStatus.isAdmin;
  const readyForAdminQueries = canView && authStatus === "authenticated" && !planStatus.isLoading;
  const stats = useAdminStats(readyForAdminQueries);
  const customers = useAdminCustomers(readyForAdminQueries);
  const promoCodes = useAdminPromoCodes(readyForAdminQueries);
  const appErrors = useAdminErrors(errorKind, readyForAdminQueries);
  const updatePromoAffiliate = useUpdatePromoAffiliate();

  const statsCards = useMemo(
    () => [
      { label: "Customers", value: stats.data?.totalUsers ?? 0, icon: Users },
      { label: "Trialing", value: stats.data?.trialing ?? 0, icon: TicketPercent },
      { label: "Active", value: stats.data?.active ?? 0, icon: ShieldCheck },
      { label: "Expired", value: stats.data?.expired ?? 0, icon: AlertCircle },
      { label: "Pilots", value: stats.data?.pilots ?? 0, icon: ShieldCheck },
      { label: "Admins", value: stats.data?.admins ?? 0, icon: ShieldCheck },
    ],
    [stats.data],
  );

  if (authStatus === "loading" || planStatus.isLoading) {
    return (
      <div className="flex min-h-[240px] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading admin access
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-bold">Admin</h1>
          <p className="text-sm text-muted-foreground">Not authorized.</p>
        </div>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Not authorized</AlertTitle>
          <AlertDescription>This page is only available to cloud admins.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const firstError = stats.error ?? customers.error ?? promoCodes.error ?? appErrors.error;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Admin</h1>
          <p className="text-sm text-muted-foreground">
            Health, customers, trial status, and partner codes.
          </p>
        </div>
        <Badge variant="secondary" className="gap-1">
          <ShieldCheck className="h-3.5 w-3.5" />
          Cloud admin
        </Badge>
      </div>

      {firstError ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Admin data unavailable</AlertTitle>
          <AlertDescription>
            {firstError instanceof Error ? firstError.message : "Request failed."}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {statsCards.map((item) => (
          <Card key={item.label}>
            <CardContent className="flex items-center justify-between gap-3 p-4">
              <div>
                <p className="text-xs font-medium uppercase text-muted-foreground">{item.label}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{item.value}</p>
              </div>
              <item.icon className="h-5 w-5 text-muted-foreground" />
            </CardContent>
          </Card>
        ))}
      </div>

      <HealthBugsSection
        selectedKind={errorKind}
        onKindChange={setErrorKind}
        errors={appErrors.data?.rows ?? []}
        last24hCount={appErrors.data?.last24hCount ?? 0}
        last24hUsers={appErrors.data?.last24hUsers ?? 0}
        byKind={appErrors.data?.byKind ?? {}}
        isLoading={appErrors.isLoading}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Customers</CardTitle>
          <CardDescription>Cloud accounts and subscription state.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Trial started</TableHead>
                  <TableHead>Trial ends</TableHead>
                  <TableHead>Promo</TableHead>
                  <TableHead className="text-right">Discount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      Loading customers
                    </TableCell>
                  </TableRow>
                ) : null}
                {!customers.isLoading && customers.data?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      No customers found.
                    </TableCell>
                  </TableRow>
                ) : null}
                {customers.data?.map((customer) => (
                  <TableRow key={customer.userId}>
                    <TableCell className="min-w-[220px] font-medium">
                      {customer.email ?? customer.userId}
                    </TableCell>
                    <TableCell>
                      <PlanBadge
                        plan={customer.isPilot ? "pilot" : customer.plan}
                        isAdmin={customer.isAdmin}
                      />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {formatDate(customer.trialStartedAt)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {formatDate(customer.trialEndsAt)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {customer.promoCode ?? "None"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {customer.discountPercent}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Partner Codes</CardTitle>
          <CardDescription>Owner/contact labels for commission codes.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead className="text-right">Discount</TableHead>
                  <TableHead className="text-right">Commission</TableHead>
                  <TableHead className="text-right">Paying</TableHead>
                  <TableHead className="text-right">Trialing</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {promoCodes.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                      Loading codes
                    </TableCell>
                  </TableRow>
                ) : null}
                {!promoCodes.isLoading && promoCodes.data?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                      No partner codes found.
                    </TableCell>
                  </TableRow>
                ) : null}
                {promoCodes.data?.map((promo) => (
                  <PartnerCodeRow
                    key={promo.code}
                    promo={promo}
                    isSaving={updatePromoAffiliate.isPending}
                    onSave={(input) => updatePromoAffiliate.mutateAsync(input)}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

const errorKindLabels: Array<{ value: AdminErrorKind | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "crash", label: "Crashes" },
  { value: "post_fill_failed", label: "Post filling" },
  { value: "facebook_block", label: "Facebook blocks" },
  { value: "login_lost", label: "Login lost" },
  { value: "api_error", label: "Local API" },
  { value: "unhandled", label: "Unhandled" },
];

function HealthBugsSection({
  selectedKind,
  onKindChange,
  errors,
  last24hCount,
  last24hUsers,
  byKind,
  isLoading,
}: {
  selectedKind: AdminErrorKind | "all";
  onKindChange: (kind: AdminErrorKind | "all") => void;
  errors: AdminAppError[];
  last24hCount: number;
  last24hUsers: number;
  byKind: Partial<Record<AdminErrorKind, number>>;
  isLoading: boolean;
}) {
  const topKind = Object.entries(byKind).sort((a, b) => Number(b[1]) - Number(a[1]))[0];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bug className="h-4 w-4" />
              Health / Bugs
            </CardTitle>
            <CardDescription>
              Recent app crashes, local API errors, and posting issues.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {errorKindLabels.map((item) => (
              <Button
                key={item.value}
                type="button"
                size="sm"
                variant={selectedKind === item.value ? "default" : "outline"}
                onClick={() => onKindChange(item.value)}
              >
                {item.label}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-md border p-3">
            <p className="text-xs font-medium uppercase text-muted-foreground">Last 24h</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{last24hCount}</p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs font-medium uppercase text-muted-foreground">Users affected</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{last24hUsers}</p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs font-medium uppercase text-muted-foreground">Most common</p>
            <p className="mt-1 truncate text-2xl font-semibold">
              {topKind ? labelForErrorKind(topKind[0]) : "None"}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>Context</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    Loading bug reports
                  </TableCell>
                </TableRow>
              ) : null}
              {!isLoading && errors.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    No bug reports found.
                  </TableCell>
                </TableRow>
              ) : null}
              {errors.map((error) => (
                <TableRow key={error.id}>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {formatDateTime(error.createdAt)}
                  </TableCell>
                  <TableCell className="min-w-[200px] font-medium">
                    {error.email ?? error.userId}
                  </TableCell>
                  <TableCell>
                    <ErrorKindBadge kind={error.kind} />
                  </TableCell>
                  <TableCell className="max-w-[320px] truncate">{error.message}</TableCell>
                  <TableCell className="max-w-[360px] truncate font-mono text-xs text-muted-foreground">
                    {contextSummary(error.context)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function ErrorKindBadge({ kind }: { kind: AdminErrorKind }) {
  const variant =
    kind === "crash" || kind === "facebook_block" || kind === "post_fill_failed"
      ? "destructive"
      : kind === "api_error"
        ? "secondary"
        : "outline";
  return (
    <Badge variant={variant} className="whitespace-nowrap">
      {labelForErrorKind(kind)}
    </Badge>
  );
}

function labelForErrorKind(kind: string) {
  const match = errorKindLabels.find((item) => item.value === kind);
  return match?.label ?? kind.replaceAll("_", " ");
}

function PlanBadge({ plan, isAdmin }: { plan: string; isAdmin: boolean }) {
  const variant = plan === "expired" ? "destructive" : plan === "active" ? "default" : "secondary";
  return (
    <div className="flex flex-wrap gap-1.5">
      <Badge variant={variant} className="capitalize">
        {plan}
      </Badge>
      {isAdmin ? <Badge variant="outline">Admin</Badge> : null}
    </div>
  );
}

function PartnerCodeRow({
  promo,
  isSaving,
  onSave,
}: {
  promo: AdminPromoCode;
  isSaving: boolean;
  onSave: (input: {
    code: string;
    affiliateName: string;
    affiliateContact: string;
  }) => Promise<unknown>;
}) {
  const [affiliateName, setAffiliateName] = useState(promo.affiliateName ?? "");
  const [affiliateContact, setAffiliateContact] = useState(promo.affiliateContact ?? "");

  useEffect(() => {
    setAffiliateName(promo.affiliateName ?? "");
    setAffiliateContact(promo.affiliateContact ?? "");
  }, [promo.affiliateContact, promo.affiliateName]);

  const dirty =
    affiliateName !== (promo.affiliateName ?? "") ||
    affiliateContact !== (promo.affiliateContact ?? "");

  return (
    <TableRow>
      <TableCell className="whitespace-nowrap font-mono text-xs font-medium">
        {promo.code}
      </TableCell>
      <TableCell className="min-w-[180px]">
        <Input
          value={affiliateName}
          onChange={(event) => setAffiliateName(event.target.value)}
          placeholder="Owner name"
          disabled={isSaving}
        />
      </TableCell>
      <TableCell className="min-w-[220px]">
        <Input
          value={affiliateContact}
          onChange={(event) => setAffiliateContact(event.target.value)}
          placeholder="Email or note"
          disabled={isSaving}
        />
      </TableCell>
      <TableCell className="text-right tabular-nums">{promo.discountPercent}%</TableCell>
      <TableCell className="text-right tabular-nums">{promo.commissionPercent}%</TableCell>
      <TableCell className="text-right tabular-nums">{promo.payingCustomers}</TableCell>
      <TableCell className="text-right tabular-nums">{promo.trialingCustomers}</TableCell>
      <TableCell className="text-right">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={`Save ${promo.code}`}
          disabled={!dirty || isSaving}
          onClick={() =>
            onSave({
              code: promo.code,
              affiliateName,
              affiliateContact,
            })
          }
        >
          {isSaving ? <Loader2 className="animate-spin" /> : <Save />}
        </Button>
      </TableCell>
    </TableRow>
  );
}

function formatDate(value: string | null) {
  if (!value) return "None";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "None";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value: string | null) {
  if (!value) return "None";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "None";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function contextSummary(context: Record<string, unknown>) {
  const allowed = [
    "route",
    "endpoint",
    "method",
    "status",
    "code",
    "session_id",
    "session_state",
    "result_status",
    "group_id",
    "detected_state",
    "runner_status",
    "block_cooldown_until",
  ];
  const parts = allowed
    .flatMap((key) => {
      const value = context[key];
      if (value === undefined || value === null || value === "") return [];
      return `${key}: ${String(value)}`;
    })
    .slice(0, 5);
  return parts.join(" | ") || "None";
}
