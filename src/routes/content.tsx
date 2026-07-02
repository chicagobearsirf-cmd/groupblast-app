import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Download, ImagePlus, RefreshCw, Save, Send, Sparkles, Trash2 } from "lucide-react";
import { toast } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/components/auth/auth-context";
import { usePlanStatus } from "@/hooks/use-plan-status";
import {
  emptyProfile,
  useApplyAiPromoCode,
  useBusinessProfile,
  useContentDrafts,
  useContentUsage,
  useDeleteDraft,
  useGenerateContent,
  useSaveBusinessProfile,
  useSaveDraft,
  useStartAiTrial,
  type BusinessProfile,
  type ContentDraft,
} from "@/hooks/use-automated-content";

export const Route = createFileRoute("/content")({
  component: ContentPage,
});

const GOALS = ["Promo / special offer", "Get my name out there", "Event", "Customer story"];
const STICKER_PRICE = 60;

function ContentPage() {
  const { mode } = useAuth();
  const plan = usePlanStatus();
  const { data: profile, isLoading: profileLoading } = useBusinessProfile();

  if (mode === "local") {
    return (
      <PageShell>
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Automated Content needs an online account. Sign in from Settings to use it.
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  if (plan.isLoading || profileLoading) {
    return (
      <PageShell>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </PageShell>
    );
  }

  if (!plan.aiAccess) return <UpsellCard plan={plan} />;
  if (!profile?.completed) return <ProfileWizard initial={profile ?? emptyProfile} />;
  return <Generator trialActive={plan.aiTrialActive} trialEndsAt={plan.aiTrialEndsAt} />;
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Sparkles className="h-6 w-6" /> Automated Content
        </h1>
        <p className="text-sm text-muted-foreground">
          Tell it what to post about — it writes the post and makes the picture.
        </p>
      </div>
      {children}
    </div>
  );
}

function UpsellCard({ plan }: { plan: ReturnType<typeof usePlanStatus> }) {
  const applyCode = useApplyAiPromoCode();
  const startTrial = useStartAiTrial();
  const [code, setCode] = useState("");
  const [codeFeedback, setCodeFeedback] = useState<string | null>(null);

  const price = plan.aiDiscountCents
    ? (STICKER_PRICE - plan.aiDiscountCents / 100).toFixed(2)
    : STICKER_PRICE.toFixed(2);
  const hasDiscount = plan.aiDiscountCents > 0;

  const subject = encodeURIComponent("Add Automated Content to my GroupBlast account");
  const bodyLines = [
    `Hi! I'd like to add Automated Content ($${price}/mo${hasDiscount ? `, code ${plan.aiDiscountCode}` : ""}) to my account.`,
    "",
    "My account email: ",
  ];
  const body = encodeURIComponent(bodyLines.join("\n"));

  const onApplyCode = () => {
    if (!code.trim()) return;
    setCodeFeedback(null);
    applyCode.mutate(code, {
      onSuccess: async (result) => {
        setCodeFeedback(`Code applied — $${(STICKER_PRICE - result.discountCents / 100).toFixed(2)}/mo.`);
        await plan.refresh();
      },
      onError: (error) => setCodeFeedback(error.message),
    });
  };

  const onStartTrial = () => {
    startTrial.mutate(undefined, {
      onSuccess: async () => {
        toast.success("Free day started — try it out!");
        await plan.refresh();
      },
      onError: (error) => toast.error(error.message),
    });
  };

  return (
    <PageShell>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Add Automated Content — ${price}/month
            {hasDiscount ? (
              <span className="ml-2 text-sm font-normal text-muted-foreground line-through">
                ${STICKER_PRICE}
              </span>
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>Type what you want to post about — get a ready-to-go post and picture.</li>
            <li>It already knows your business, your area, and how you like to sound.</li>
            <li>100 posts with pictures every month, plus HD renders for your big ones.</li>
            <li>Save drafts and drop them straight into New Post.</li>
          </ul>

          <Button asChild className="h-11 w-fit">
            <a href={`mailto:guysadwise@gmail.com?subject=${subject}&body=${body}`}>
              Email to activate — ${price}/mo
            </a>
          </Button>

          {plan.aiTrialUsed ? (
            <p className="text-xs text-muted-foreground">
              Your free one-day trial has already been used on this account.
            </p>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={startTrial.isPending}
                onClick={onStartTrial}
              >
                {startTrial.isPending ? "Starting…" : "Try it free for one day"}
              </Button>
              <p className="text-xs text-muted-foreground">No card, no signup — just try it.</p>
            </div>
          )}

          <div className="mt-1 flex flex-col gap-1.5 border-t pt-3">
            <p className="text-xs text-muted-foreground">Have a discount code?</p>
            <div className="flex gap-2">
              <Input
                placeholder="Discount code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                disabled={applyCode.isPending}
                className="max-w-[200px]"
              />
              <Button
                variant="outline"
                size="sm"
                disabled={applyCode.isPending || !code.trim()}
                onClick={onApplyCode}
              >
                Apply
              </Button>
            </div>
            {codeFeedback ? <p className="text-xs text-muted-foreground">{codeFeedback}</p> : null}
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}

// ---------- Onboarding wizard ----------

const BUSINESS_TYPES = [
  "Restaurant / Food",
  "Salon / Barber",
  "Landscaping / Lawn care",
  "Cleaning",
  "Auto repair",
  "Real estate",
  "Fitness / Gym",
  "Retail / Boutique",
  "Contractor / Home services",
];

const CUSTOMER_TYPES = [
  "Local families",
  "Homeowners",
  "Young adults",
  "Other businesses",
  "Everyone nearby",
];

const TONES = [
  "Friendly & casual",
  "Professional",
  "Funny / playful",
  "Straight to the point",
];

function ChipRow({
  options,
  value,
  onPick,
}: {
  options: readonly string[];
  value: string;
  onPick: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <Button
          key={option}
          type="button"
          size="sm"
          variant={value === option ? "default" : "outline"}
          onClick={() => onPick(option)}
        >
          {option}
        </Button>
      ))}
    </div>
  );
}

function ProfileWizard({ initial }: { initial: BusinessProfile }) {
  const saveProfile = useSaveBusinessProfile();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<BusinessProfile>(initial);
  const set = (patch: Partial<BusinessProfile>) => setForm((f) => ({ ...f, ...patch }));

  const steps: { title: string; hint: string; valid: boolean; body: React.ReactNode }[] = [
    {
      title: "What kind of business do you have?",
      hint: "Pick one, or type your own below.",
      valid: form.business_type.trim().length > 0,
      body: (
        <>
          <ChipRow
            options={BUSINESS_TYPES}
            value={form.business_type}
            onPick={(v) => set({ business_type: v })}
          />
          <Input
            placeholder="Or type it: e.g. Mobile dog grooming"
            value={BUSINESS_TYPES.includes(form.business_type) ? "" : form.business_type}
            onChange={(e) => set({ business_type: e.target.value })}
          />
        </>
      ),
    },
    {
      title: "Business name and area",
      hint: "So posts can mention you by name and where you work.",
      valid: form.business_name.trim().length > 0 && form.service_area.trim().length > 0,
      body: (
        <>
          <Input
            placeholder="Business name — e.g. Joe's Lawn Care"
            value={form.business_name}
            onChange={(e) => set({ business_name: e.target.value })}
          />
          <Input
            placeholder="Area you serve — e.g. Kenosha & Racine, WI"
            value={form.service_area}
            onChange={(e) => set({ service_area: e.target.value })}
          />
        </>
      ),
    },
    {
      title: "Who's your typical customer?",
      hint: "Posts get written to speak to these people.",
      valid: form.target_customer.trim().length > 0,
      body: (
        <>
          <ChipRow
            options={CUSTOMER_TYPES}
            value={form.target_customer}
            onPick={(v) => set({ target_customer: v })}
          />
          <Input
            placeholder="Or describe them: e.g. New homeowners with big yards"
            value={CUSTOMER_TYPES.includes(form.target_customer) ? "" : form.target_customer}
            onChange={(e) => set({ target_customer: e.target.value })}
          />
        </>
      ),
    },
    {
      title: "How should your posts sound?",
      hint: "Every post gets written in this voice.",
      valid: form.tone.trim().length > 0,
      body: <ChipRow options={TONES} value={form.tone} onPick={(v) => set({ tone: v })} />,
    },
    {
      title: "What do you offer?",
      hint: "Services, deals, or promos you usually run. A sentence or two is plenty.",
      valid: form.offers.trim().length > 0,
      body: (
        <Textarea
          className="min-h-[100px]"
          placeholder="e.g. Weekly mowing from $40, free quotes, spring cleanup specials"
          value={form.offers}
          onChange={(e) => set({ offers: e.target.value })}
        />
      ),
    },
    {
      title: "What makes you different?",
      hint: "Why do customers pick you over the other guys?",
      valid: form.differentiator.trim().length > 0,
      body: (
        <Textarea
          className="min-h-[100px]"
          placeholder="e.g. Family-owned 15 years, we show up when we say we will"
          value={form.differentiator}
          onChange={(e) => set({ differentiator: e.target.value })}
        />
      ),
    },
    {
      title: "Anything posts should never say?",
      hint: "Optional — prices you don't advertise, services you stopped offering, etc.",
      valid: true,
      body: (
        <Textarea
          className="min-h-[100px]"
          placeholder="e.g. Don't mention exact prices, don't promise same-day service"
          value={form.never_say}
          onChange={(e) => set({ never_say: e.target.value })}
        />
      ),
    },
  ];

  const current = steps[step];
  const isLast = step === steps.length - 1;

  const finish = () => {
    saveProfile.mutate(
      { ...form, completed: true },
      {
        onSuccess: () => toast.success("Profile saved — you're ready to create posts."),
        onError: (error) => toast.error(error.message),
      },
    );
  };

  return (
    <PageShell>
      <Card>
        <CardHeader>
          <p className="text-xs text-muted-foreground">
            One-time setup · Step {step + 1} of {steps.length}
          </p>
          <CardTitle className="text-base">{current.title}</CardTitle>
          <p className="text-sm text-muted-foreground">{current.hint}</p>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {current.body}
          <div className="mt-2 flex justify-between">
            <Button
              variant="outline"
              disabled={step === 0 || saveProfile.isPending}
              onClick={() => setStep((s) => s - 1)}
            >
              Back
            </Button>
            <Button
              disabled={!current.valid || saveProfile.isPending}
              onClick={() => (isLast ? finish() : setStep((s) => s + 1))}
            >
              {isLast ? (saveProfile.isPending ? "Saving…" : "Finish setup") : "Next"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}

// ---------- Generator ----------

function TrialCountdownBanner({ trialEndsAt }: { trialEndsAt: string | null }) {
  if (!trialEndsAt) return null;
  const msRemaining = new Date(trialEndsAt).getTime() - Date.now();
  const hoursRemaining = Math.max(0, Math.ceil(msRemaining / (60 * 60 * 1000)));
  const subject = encodeURIComponent("Add Automated Content to my GroupBlast account");
  return (
    <div className="flex items-center justify-between rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <span>
        Free trial — about {hoursRemaining} hour{hoursRemaining === 1 ? "" : "s"} left.
      </span>
      <a
        href={`mailto:guysadwise@gmail.com?subject=${subject}`}
        className="font-medium underline"
      >
        Keep it — $60/mo
      </a>
    </div>
  );
}

function Generator({
  trialActive,
  trialEndsAt,
}: {
  trialActive: boolean;
  trialEndsAt: string | null;
}) {
  const navigate = useNavigate();
  const generate = useGenerateContent();
  const saveDraft = useSaveDraft();
  const { data: usage } = useContentUsage();
  const { data: drafts = [] } = useContentDrafts();
  const deleteDraft = useDeleteDraft();

  const [topic, setTopic] = useState("");
  const [goal, setGoal] = useState("");
  const [caption, setCaption] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [tweak, setTweak] = useState("");
  const [draftId, setDraftId] = useState<string | undefined>();

  const busy = generate.isPending;
  const hasResult = caption.trim().length > 0;

  const run = (
    kind: "generate" | "regen_text" | "regen_image" | "tweak",
    opts: { premium?: boolean } = {},
  ) => {
    generate.mutate(
      { kind, topic, goal, currentCaption: caption, tweak, premium: opts.premium },
      {
        onSuccess: (result) => {
          if (result.caption) setCaption(result.caption);
          if (result.imageUrl) setImageUrl(result.imageUrl);
          if (kind === "tweak") setTweak("");
          if (kind === "generate") setDraftId(undefined);
        },
        onError: (error) => toast.error(error.message),
      },
    );
  };

  const onSaveDraft = () => {
    saveDraft.mutate(
      { id: draftId, topic, goal, caption, image_url: imageUrl },
      {
        onSuccess: () => toast.success("Draft saved."),
        onError: (error) => toast.error(error.message),
      },
    );
  };

  const useInPost = (c: string, img: string | null) => {
    window.sessionStorage.setItem(
      "groupblast.composeDraft",
      JSON.stringify({ source: "ai", caption: c, imageUrl: img }),
    );
    void navigate({ to: "/compose" });
  };

  const loadDraft = (draft: ContentDraft) => {
    setTopic(draft.topic);
    setGoal(draft.goal);
    setCaption(draft.caption);
    setImageUrl(draft.image_url);
    setDraftId(draft.id);
  };

  return (
    <PageShell>
      {trialActive ? <TrialCountdownBanner trialEndsAt={trialEndsAt} /> : null}
      {usage ? (
        <p className="text-xs text-muted-foreground">
          {usage.gensUsed} of 100 posts used this month · {usage.premiumUsed} of 15 HD renders
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">What do you want to post about?</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Textarea
              className="min-h-[120px]"
              placeholder="e.g. Spring cleanup special — 20% off through April"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              {GOALS.map((g) => (
                <Button
                  key={g}
                  type="button"
                  size="sm"
                  variant={goal === g ? "default" : "outline"}
                  onClick={() => setGoal(goal === g ? "" : g)}
                >
                  {g}
                </Button>
              ))}
            </div>
            <Button
              className="h-12"
              disabled={!topic.trim() || busy}
              onClick={() => run("generate")}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              {busy ? "Creating…" : "Create my post"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Takes about 30 seconds — it writes the post and makes the picture.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your post</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {!hasResult && !busy ? (
              <p className="p-2 text-sm text-muted-foreground">
                Your post and picture will show up here.
              </p>
            ) : null}
            {imageUrl ? (
              <img
                src={imageUrl}
                alt="Generated post picture"
                className="max-h-64 w-full rounded-md border object-cover"
              />
            ) : null}
            {hasResult ? (
              <>
                <Textarea
                  className="min-h-[140px]"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                />
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => run("regen_text")}>
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> New wording
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => run("regen_image")}>
                    <ImagePlus className="mr-1.5 h-3.5 w-3.5" /> New picture
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => run("regen_image", { premium: true })}
                  >
                    <ImagePlus className="mr-1.5 h-3.5 w-3.5" /> HD picture
                  </Button>
                  {imageUrl ? (
                    <Button size="sm" variant="outline" asChild>
                      <a href={imageUrl} download target="_blank" rel="noreferrer">
                        <Download className="mr-1.5 h-3.5 w-3.5" /> Download picture
                      </a>
                    </Button>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder='Quick change — e.g. "make it shorter"'
                    value={tweak}
                    onChange={(e) => setTweak(e.target.value)}
                  />
                  <Button variant="outline" disabled={!tweak.trim() || busy} onClick={() => run("tweak")}>
                    Apply
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    disabled={busy || saveDraft.isPending}
                    onClick={onSaveDraft}
                  >
                    <Save className="mr-1.5 h-4 w-4" /> Save for later
                  </Button>
                  <Button className="flex-1" disabled={busy} onClick={() => useInPost(caption, imageUrl)}>
                    <Send className="mr-1.5 h-4 w-4" /> Use in post
                  </Button>
                </div>
              </>
            ) : null}
            {busy ? <p className="text-sm text-muted-foreground">Working on it…</p> : null}
          </CardContent>
        </Card>
      </div>

      {drafts.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Saved for later</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {drafts.map((draft) => (
              <div key={draft.id} className="flex items-center gap-3 rounded-md border p-2.5">
                {draft.image_url ? (
                  <img
                    src={draft.image_url}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded object-cover"
                  />
                ) : null}
                <p className="min-w-0 flex-1 truncate text-sm">{draft.caption}</p>
                <Button size="sm" variant="outline" onClick={() => loadDraft(draft)}>
                  Open
                </Button>
                <Button size="sm" onClick={() => useInPost(draft.caption, draft.image_url)}>
                  Use in post
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    deleteDraft.mutate(draft.id, {
                      onError: (error) => toast.error(error.message),
                    })
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </PageShell>
  );
}
