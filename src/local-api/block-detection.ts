export type FacebookBlockSignal = {
  id: string;
  label: string;
  pattern: RegExp;
};

export const FACEBOOK_BLOCK_SIGNALS: FacebookBlockSignal[] = [
  {
    id: "cant_post_right_now",
    label: "You can't post right now",
    pattern: /you\s+(?:can'?t|cannot)\s+post\s+right\s+now/i,
  },
  {
    id: "temporarily_blocked",
    label: "You're temporarily blocked",
    pattern: /(?:you(?:'re| are)\s+)?temporarily\s+blocked/i,
  },
  {
    id: "temporarily_restricted",
    label: "Temporarily restricted",
    pattern: /temporarily\s+restricted/i,
  },
  {
    id: "going_too_fast",
    label: "Going too fast",
    pattern: /misusing\s+this\s+feature\s+by\s+going\s+too\s+fast/i,
  },
  {
    id: "posting_too_often",
    label: "Posting too often",
    pattern: /we\s+limit\s+how\s+often\s+you\s+can\s+post/i,
  },
  {
    id: "try_again_later",
    label: "Try again later",
    pattern: /try\s+again\s+later/i,
  },
  {
    id: "community_standards",
    label: "Community Standards",
    pattern: /your\s+post\s+goes\s+against\s+our\s+community\s+standards/i,
  },
];

export type FacebookBlockDetection = {
  signal: FacebookBlockSignal;
  matchedText: string;
} | null;

const normalizeText = (text: string) => text.replace(/\s+/g, " ").trim();

export const detectFacebookBlockSignal = (text: string): FacebookBlockDetection => {
  const normalized = normalizeText(text);
  for (const signal of FACEBOOK_BLOCK_SIGNALS) {
    const match = normalized.match(signal.pattern);
    if (match) {
      return {
        signal,
        matchedText: normalizeText(match[0]).slice(0, 240),
      };
    }
  }
  return null;
};

export const suspectedFacebookBlockSignal = (failureCount: number): FacebookBlockDetection =>
  failureCount >= 3
    ? {
        signal: {
          id: "suspected_repeated_failures",
          label: "Repeated posting failures",
          pattern: /repeated posting failures/i,
        },
        matchedText: "Three posting attempts failed in a row.",
      }
    : null;

export const getBlockCooldownStatus = (
  blockCooldownUntil: string | null | undefined,
  blockCooldownReason: string | null | undefined,
  currentTime = new Date(),
) => {
  if (!blockCooldownUntil) return null;
  const until = new Date(blockCooldownUntil);
  if (Number.isNaN(until.getTime()) || until <= currentTime) return null;
  return {
    until: blockCooldownUntil,
    reason: blockCooldownReason ?? "",
  };
};
