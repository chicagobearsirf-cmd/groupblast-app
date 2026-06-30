// Facebook changes markup, labels, and accessibility attributes frequently.
// Keep all selector updates in this file so the runner logic stays stable.
// If composer detection breaks, update composerTriggers / composerEditorsInDialog
// and the accept/reject pattern lists below first.
export const facebookSelectors = {
  // Buttons/affordances that OPEN the group's main "create post" composer. The
  // runner validates each candidate's accessible name with classifyComposerLabel
  // before clicking, so these only need to be reasonable candidates.
  composerTriggers: [
    'div[role="button"]:has-text("Write something")',
    'div[role="button"]:has-text("What\'s on your mind")',
    'div[role="button"]:has-text("Create a public post")',
    'div[role="button"]:has-text("Create post")',
    'div[role="button"]:has-text("Start a discussion")',
    'div[aria-label*="Write something" i]',
    'div[aria-label*="Create a public post" i]',
    'div[aria-label*="Create post" i]',
    'span:has-text("Write something")',
    'span:has-text("What\'s on your mind")',
  ],
  // The composer modal that opens after clicking a trigger.
  composerDialog: 'div[role="dialog"]',
  // Editors are searched ONLY inside the composer dialog (see runner). This is
  // the key fix: never select a page-wide contenteditable, which is how the
  // runner previously grabbed an inline "Answer as Ian" comment/answer box.
  composerEditorsInDialog: [
    'div[role="dialog"] div[role="textbox"][contenteditable="true"]',
    'div[role="dialog"] div[contenteditable="true"][data-lexical-editor="true"]',
    'div[role="dialog"] div[role="textbox"]',
    'div[role="dialog"] div[contenteditable="true"]',
  ],
  // Ancestors that mark a textbox as a comment/reply/answer context — used to
  // reject candidates structurally even if their label looks innocent.
  commentContextSelectors: [
    '[role="article"]',
    '[aria-label*="Comment" i]',
    '[aria-label*="Reply" i]',
    '[aria-label*="Answer" i]',
    'form[aria-label*="comment" i]',
  ],
  // Reserved for a future explicit opt-in auto-submit flow. The app does not use
  // these selectors today because human-review mode is the active workflow.
  postButtons: [
    'div[role="dialog"] div[aria-label="Post"]',
    'div[role="dialog"] div[aria-label*="Post"]',
    'div[role="dialog"] div[role="button"]:has-text("Post")',
    'div[role="dialog"] span:has-text("Post")',
    'div[aria-label="Post"]',
  ],
};

// Phrases that affirmatively identify the group's main create-post composer.
// Apostrophes are stripped before matching (see normalizeLabel), so curly/straight
// quotes both work and "What's on your mind" is stored as "whats on your mind".
export const composerAcceptPatterns = [
  "write something",
  "create a public post",
  "create post",
  "whats on your mind",
  "start a discussion",
];

// Phrases that mark a textbox as the WRONG target: comment/reply/answer boxes,
// search, chat/message inputs, and admin question/approval fields.
export const composerRejectPatterns = [
  "answer as",
  "comment as",
  "write a comment",
  "add a comment",
  "reply",
  "search",
  "message",
  "chat",
  "admin assist",
  "ask a question",
];

export type ComposerVerdict = "accept" | "reject" | "unknown";

export function normalizeLabel(text: string | null | undefined): string {
  return (text ?? "").toLowerCase().replace(/[’'`]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Pure, unit-testable classifier for a candidate's accessible name / nearby text.
 *
 * Accept is checked BEFORE reject on purpose: the accept phrases are specific to
 * the main composer, and checking them first prevents a false reject when the
 * user's name happens to contain a reject substring (e.g. "What's on your mind,
 * Chathan?" contains "chat"). Comment/reply boxes never use the accept phrases,
 * so accept-first does not let a wrong target through.
 */
export function classifyComposerLabel(text: string | null | undefined): {
  verdict: ComposerVerdict;
  reason: string;
} {
  const normalized = normalizeLabel(text);
  if (!normalized) return { verdict: "unknown", reason: "empty label" };
  for (const pattern of composerAcceptPatterns) {
    if (normalized.includes(pattern)) {
      return { verdict: "accept", reason: `matched composer phrase "${pattern}"` };
    }
  }
  for (const pattern of composerRejectPatterns) {
    if (normalized.includes(pattern)) {
      return { verdict: "reject", reason: `matched reject phrase "${pattern}"` };
    }
  }
  return { verdict: "unknown", reason: "no composer phrase matched" };
}

// Accessibility/structure signals gathered from a candidate composer element.
export type ComposerCandidateSignals = {
  role: string | null;
  ariaLabel: string | null;
  placeholder: string | null;
  visibleText: string;
  nearbyText: string;
  insideDialog: boolean;
  insideCommentContext: boolean;
};

export type ComposerJudgement = { accepted: boolean; reason: string };

/**
 * Decide whether a candidate textbox is the real main create-post composer.
 * It must live inside the composer dialog, must not be in a comment/reply/answer
 * context, and its own accessible name must not match a reject phrase. An
 * accept-phrase match raises confidence but is not required, because being inside
 * the verified composer dialog is already strong evidence.
 */
export function judgeComposerEditor(signals: ComposerCandidateSignals): ComposerJudgement {
  if (!signals.insideDialog) {
    return { accepted: false, reason: "not inside the composer dialog/modal" };
  }
  if (signals.insideCommentContext) {
    return { accepted: false, reason: "inside a comment/reply/answer container" };
  }
  const name = [signals.ariaLabel, signals.placeholder].filter(Boolean).join(" ");
  const nameVerdict = classifyComposerLabel(name);
  if (nameVerdict.verdict === "reject") {
    return { accepted: false, reason: `label ${nameVerdict.reason}` };
  }
  return {
    accepted: true,
    reason:
      nameVerdict.verdict === "accept"
        ? `label ${nameVerdict.reason}`
        : "inside composer dialog, no comment/reject signals",
  };
}

/**
 * Decide whether a candidate is a real main-composer OPENER. Openers must
 * affirmatively look like the main composer ("Write something", "What's on your
 * mind", "Create a public post", "Start a discussion") — we never click an
 * opener we cannot positively identify.
 */
export function judgeComposerOpener(signals: ComposerCandidateSignals): ComposerJudgement {
  if (signals.insideCommentContext) {
    return { accepted: false, reason: "inside a comment/reply/answer container" };
  }
  const name = [signals.ariaLabel, signals.visibleText].filter(Boolean).join(" ");
  const verdict = classifyComposerLabel(name);
  if (verdict.verdict === "accept") return { accepted: true, reason: verdict.reason };
  return { accepted: false, reason: `not a confirmed composer opener (${verdict.reason})` };
}
