/**
 * The runner records short machine codes as result messages (e.g.
 * `admin_approval_required`, `composer_not_found`). This maps those codes to
 * plain-language explanations for the user-facing Results table. Anything that
 * isn't a known code (e.g. a real error string) is returned unchanged.
 */
const RESULT_MESSAGES: Record<string, string> = {
  // User-confirmed pending admin review (Mark Pending Admin Review). Evidence
  // (screenshot + visible wording) is saved with the result.
  pending_admin_review:
    "You confirmed Facebook showed this post as pending admin approval. It is awaiting group-admin review.",
  // Honest text: the app did NOT confirm a submission. This wording is used for
  // any unconfirmed/legacy admin_approval_required result, since restriction
  // wording on the page is not evidence that a post was made.
  admin_approval_required:
    "Posting may be restricted or require approval. No post was confirmed. Review manually.",
  submission_unconfirmed:
    "The app could not confirm the post was submitted. No post was confirmed — review manually.",
  ready_for_manual_review:
    "Composer filled and waiting. Review the post in Facebook, post it yourself, then mark the result here.",
  pending_manual_action:
    "Composer filled and waiting. Review the post in Facebook, post it yourself, then mark the result here.",
  composer_not_found:
    "The post composer didn't load on this group page. The post box may be restricted or the page layout changed. Review manually.",
  group_unavailable:
    "This group's content isn't available — it may be private, removed, or you may not be a member. Review manually.",
  not_logged_in:
    "The automation browser isn't logged into Facebook. Run Check Facebook Session in Settings, then retry.",
  security_checkpoint:
    "Facebook showed a security check or login review. Handle it manually in the browser — the app will not bypass it.",
  duplicate_warning:
    "Facebook flagged this as a possible duplicate / already-posted. Review manually before posting again.",
  composer_filled_waiting_for_human:
    "Composer filled. Review the post in the browser, then mark it Posted, Failed, or Skip here.",
};

const MAX_RAW_LENGTH = 180;

export function describeResultMessage(message: string | null | undefined): string {
  if (!message) return "No message";
  const mapped = RESULT_MESSAGES[message];
  if (mapped) return mapped;
  // Raw runner errors (e.g. Playwright timeouts) embed their entire call log.
  // Truncate so the results table stays readable — the full text is available
  // on hover and in the debug artifacts.
  return message.length > MAX_RAW_LENGTH
    ? `${message.slice(0, MAX_RAW_LENGTH).trimEnd()}…`
    : message;
}

/** True when the result message indicates restricted/admin-gated posting. */
export function isAdminApprovalMessage(message: string | null | undefined): boolean {
  return message === "admin_approval_required" || message === "pending_admin_review";
}
