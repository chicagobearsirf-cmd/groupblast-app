import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AlertCircle, Loader2, Save, ShieldCheck, TicketPercent, Users } from "lucide-react";
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
  type AdminPromoCode,
  useAdminCustomers,
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
  const canView = mode !== "local" && planStatus.isAdmin;
  const readyForAdminQueries = canView && authStatus === "authenticated" && !planStatus.isLoading;
  const stats = useAdminStats(readyForAdminQueries);
  const customers = useAdminCustomers(readyForAdminQueries);
  const promoCodes = useAdminPromoCodes(readyForAdminQueries);
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

  const firstError = stats.error ?? customers.error ?? promoCodes.error;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Admin</h1>
          <p className="text-sm text-muted-foreground">
            Customers, trial status, and partner codes.
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
