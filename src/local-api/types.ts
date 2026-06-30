export type GroupStatus = "active" | "paused" | "needs_review" | "failed" | "removed";
export type ResultStatus = "posted" | "skipped" | "failed" | "needs_review" | "pending";
export type SessionState =
  | "draft"
  | "running"
  | "paused"
  | "stopped"
  | "completed"
  | "needs_review";
export type FacebookSessionCheckStatus =
  | "never_checked"
  | "logged_in"
  | "not_logged_in"
  | "checkpoint_or_review"
  | "unknown";
export type BrowserMode = "managed_playwright_profile" | "imported_chrome_profile_snapshot";

export type ChromeProfileDiagnostics = {
  timestamp: string;
  action: "test" | "launch" | "check_session" | "import_snapshot";
  browserMode: BrowserMode;
  chromeExecutablePathUsed: string;
  chromeUserDataDirUsed: string;
  chromeProfileDirectoryUsed: string;
  resolvedProfilePath: string;
  executableExists: boolean;
  userDataDirExists: boolean;
  profileDirExists: boolean;
  preferencesExists: boolean;
  cookiesExists: boolean;
  loginDataExists: boolean;
  localStateExists: boolean;
  isDefaultChromeUserDataDir: boolean;
  pathLooksLikeFullProfilePath: boolean;
  snapshotPath: string;
  snapshotExists: boolean;
  snapshotProfileDirExists: boolean;
  snapshotProfileDirectory: string;
  snapshotImportedAt: string;
  snapshotSource: string;
  chromeAppearsLockedOrOpen: boolean;
  lockIndicators: string[];
  launchAttempted: boolean;
  launchMethod: string;
  fallbackAttempted: boolean;
  playwrightLaunchError: string;
  currentUrl: string;
  pageTitle: string;
  detectedFacebookSessionState: FacebookSessionCheckStatus | "";
  debugPath: string;
  warnings: string[];
};

export type FacebookGroup = {
  id: string;
  name: string;
  url: string;
  category: string;
  subcategory: string;
  tags: string[];
  status: GroupStatus;
  notes: string;
  source: string;
  sourceCapturedAt: string | null;
  sourceUpdatedAt: string | null;
  lastPostedAt: string | null;
  failureCount: number;
  createdAt: string;
  updatedAt: string;
};

export type GroupCollection = {
  id: string;
  name: string;
  description: string;
  groupIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type AppSettings = {
  defaultMode: "human_review";
  minDelaySeconds: number;
  maxDelaySeconds: number;
  maxGroupsPerSession: number;
  maxJoinedGroupsSyncPerRun: number;
  joinedGroupsSyncScrollDelayMs: number;
  joinedGroupsSyncStopAfterNoNewPasses: number;
  joinedGroupsSyncDefaultCategory: string;
  joinedGroupsSyncUrl: string;
  browserMode: BrowserMode;
  browserProfilePath: string;
  chromeExecutablePath: string;
  chromeUserDataDir: string;
  chromeProfileDirectory: string;
  chromeProfileSnapshotProfileDirectory: string;
  chromeProfileSnapshotImportedAt: string | null;
  chromeProfileSnapshotSource: string;
  stopOnCheckpoint: boolean;
  stopOnRepeatedFailures: boolean;
  defaultCategory: string;
  theme: "light" | "dark" | "system";
  autoSubmitEnabled: boolean;
  facebookSessionStatus: FacebookSessionCheckStatus;
  facebookSessionCheckedAt: string | null;
};

export type PostSession = {
  id: string;
  postText: string;
  mode: "human_review";
  state: SessionState;
  selectedGroupIds: string[];
  currentIndex: number;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

export type SessionResult = {
  id: string;
  sessionId: string;
  groupId: string;
  groupName: string;
  groupUrl: string;
  status: ResultStatus;
  message: string;
  timestamp: string;
  durationSeconds: number;
};

export type RunnerDiagnostics = {
  runnerStatus: "idle" | "running" | "paused" | "waiting_for_human" | "stopped" | "error";
  currentUrl: string;
  pageTitle: string;
  lastError: string;
  lastScreenshotPath: string;
  lastHtmlSnippetPath: string;
  lastDetectedState: string;
  lastSelectorAttemptSummary: string;
  lastWorkingSelector: string;
  lastDebugRecordPath: string;
  updatedAt: string;
};

export type SessionStatus = {
  session: PostSession | null;
  currentGroup: FacebookGroup | null;
  nextGroup: FacebookGroup | null;
  results: SessionResult[];
  counts: Record<ResultStatus, number>;
  remainingCount: number;
  totalCount: number;
  diagnostics: RunnerDiagnostics;
};

export type JoinedGroupsSyncRow = {
  name: string;
  url: string;
  category: string;
  subcategory: string;
  tags: string[];
  status: GroupStatus;
  source: "facebook_joined_groups_sync";
  capturedAt: string;
  updatedAt: string;
  notes: string;
};

export type JoinedGroupsSyncStatus = {
  state: "idle" | "running" | "stopped" | "failed" | "ready" | "imported";
  groupsFound: number;
  duplicateCount: number;
  newCount: number;
  updatedCount: number;
  currentPass: number;
  noNewPasses: number;
  maxGroups: number;
  startedAt: string | null;
  completedAt: string | null;
  lastError: string;
  debugPath: string;
  rows: JoinedGroupsSyncRow[];
};
