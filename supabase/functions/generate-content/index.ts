// Automated Content generator. The ONLY place OpenAI is called — the key
// lives in Supabase function secrets, never in the desktop app (users could
// extract anything shipped in Electron).
//
// Deploy:  supabase functions deploy generate-content
// Secrets: supabase secrets set OPENAI_API_KEY=sk-...
//          (optional) OPENAI_TEXT_MODEL=gpt-4o-mini
//
// Caps (per calendar month, enforced here, config in ai_entitlements):
//   - monthly_generation_cap (default 100): calls that produce an image
//   - monthly_premium_cap  (default 15): HD image renders
//   - text-only tweaks/regens don't consume image credits (they cost pennies)

import { createClient } from "npm:@supabase/supabase-js@2";

type RequestBody = {
  kind: "generate" | "regen_text" | "regen_image" | "tweak";
  topic?: string;
  goal?: string;
  currentCaption?: string;
  tweak?: string;
  premium?: boolean;
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const TEXT_MODEL = Deno.env.get("OPENAI_TEXT_MODEL") ?? "gpt-4o-mini";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  if (!OPENAI_API_KEY) return json(500, { error: "not_configured" });

  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return json(401, { error: "not_authenticated" });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: entitlement } = await admin
    .from("ai_entitlements")
    .select("addon_active, monthly_generation_cap, monthly_premium_cap")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!entitlement?.addon_active) return json(403, { error: "no_addon" });

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return json(400, { error: "bad_request" });
  }

  const kind = body.kind;
  if (!["generate", "regen_text", "regen_image", "tweak"].includes(kind)) {
    return json(400, { error: "bad_request" });
  }
  const topic = (body.topic ?? "").trim().slice(0, 600);
  const goal = (body.goal ?? "").trim().slice(0, 60);
  const tweak = (body.tweak ?? "").trim().slice(0, 300);
  const currentCaption = (body.currentCaption ?? "").trim().slice(0, 4000);
  const premium = Boolean(body.premium);
  if ((kind === "generate" || kind === "regen_text" || kind === "regen_image") && !topic) {
    return json(400, { error: "topic_required" });
  }
  if (kind === "tweak" && (!tweak || !currentCaption)) {
    return json(400, { error: "tweak_required" });
  }

  // Month-to-date usage. Image-producing calls consume generation credits;
  // premium renders also consume premium credits.
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const { data: monthRows } = await admin
    .from("ai_usage")
    .select("kind, premium")
    .eq("user_id", user.id)
    .gte("created_at", monthStart.toISOString());
  const rows = monthRows ?? [];
  const gensUsed = rows.filter((r) => r.kind === "generate" || r.kind === "regen_image").length;
  const premiumUsed = rows.filter((r) => r.premium).length;

  const producesImage = kind === "generate" || kind === "regen_image";
  if (producesImage && gensUsed >= entitlement.monthly_generation_cap) {
    return json(429, { error: "cap_reached", gensUsed, gensCap: entitlement.monthly_generation_cap });
  }
  if (producesImage && premium && premiumUsed >= entitlement.monthly_premium_cap) {
    return json(429, { error: "premium_cap_reached", premiumUsed, premiumCap: entitlement.monthly_premium_cap });
  }
  // Backstop so text-only calls can't be farmed as a free API.
  if (!producesImage && rows.length >= 400) {
    return json(429, { error: "cap_reached", gensUsed, gensCap: entitlement.monthly_generation_cap });
  }

  const { data: profile } = await admin
    .from("business_profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile?.completed) return json(412, { error: "profile_incomplete" });

  const systemPrompt = [
    "You write Facebook group posts for a local business. Write like the owner talking to neighbors, not like an ad agency.",
    `Business: ${profile.business_name} — ${profile.business_type}.`,
    `Service area: ${profile.service_area}.`,
    `Typical customer: ${profile.target_customer}.`,
    `Tone: ${profile.tone}.`,
    profile.offers ? `Offers/promos they run: ${profile.offers}.` : "",
    profile.differentiator ? `What makes them different: ${profile.differentiator}.` : "",
    profile.never_say ? `NEVER say or imply any of this: ${profile.never_say}.` : "",
    "Rules: 60-140 words. No hashtag walls (2 hashtags max, often zero). No 'Hey Facebook fam'. No emoji spam (3 max). Sound human and specific — mention the real offer, area, or detail. End with one clear, low-pressure call to action. Never mention AI or that this was generated. Output ONLY the post text.",
  ]
    .filter(Boolean)
    .join("\n");

  async function generateCaption(userPrompt: string): Promise<string> {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: TEXT_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 500,
        temperature: 0.9,
      }),
    });
    if (!res.ok) throw new Error(`text_generation_failed:${res.status}`);
    const data = await res.json();
    const caption = data.choices?.[0]?.message?.content?.trim();
    if (!caption) throw new Error("text_generation_failed:empty");
    return caption;
  }

  async function generateImage(caption: string, hd: boolean): Promise<string> {
    const imagePrompt =
      `Social media photo for a local ${profile.business_type} business named ${profile.business_name}. ` +
      `The post it accompanies: "${caption.slice(0, 400)}". ` +
      "Bright, appealing, realistic photography style suitable for a Facebook post. " +
      "No text overlays, no words, no logos, no watermarks.";
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt: imagePrompt,
        size: "1024x1024",
        quality: hd ? "high" : "medium",
        n: 1,
      }),
    });
    if (!res.ok) throw new Error(`image_generation_failed:${res.status}`);
    const data = await res.json();
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) throw new Error("image_generation_failed:empty");

    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const path = `${user.id}/${crypto.randomUUID()}.png`;
    const { error: uploadError } = await admin.storage
      .from("generated-content")
      .upload(path, bytes, { contentType: "image/png" });
    if (uploadError) throw new Error(`image_upload_failed:${uploadError.message}`);
    const { data: pub } = admin.storage.from("generated-content").getPublicUrl(path);
    return pub.publicUrl;
  }

  try {
    let caption = currentCaption;
    let imageUrl: string | null = null;

    const goalLine = goal ? ` The goal of this post: ${goal}.` : "";
    if (kind === "generate") {
      caption = await generateCaption(`Write a Facebook group post about: ${topic}.${goalLine}`);
      imageUrl = await generateImage(caption, premium);
    } else if (kind === "regen_text") {
      caption = await generateCaption(
        `Write a DIFFERENT Facebook group post about: ${topic}.${goalLine} Take a fresh angle — do not reuse this draft's phrasing: "${currentCaption.slice(0, 800)}"`,
      );
    } else if (kind === "tweak") {
      caption = await generateCaption(
        `Revise this Facebook group post: "${currentCaption}". Requested change: ${tweak}. Keep everything else that works.`,
      );
    } else if (kind === "regen_image") {
      imageUrl = await generateImage(currentCaption || topic, premium);
    }

    await admin.from("ai_usage").insert({
      user_id: user.id,
      kind,
      premium: producesImage && premium,
    });

    return json(200, {
      caption,
      imageUrl,
      usage: {
        gensUsed: gensUsed + (producesImage ? 1 : 0),
        gensCap: entitlement.monthly_generation_cap,
        premiumUsed: premiumUsed + (producesImage && premium ? 1 : 0),
        premiumCap: entitlement.monthly_premium_cap,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "generation_failed";
    return json(502, { error: message });
  }
});
