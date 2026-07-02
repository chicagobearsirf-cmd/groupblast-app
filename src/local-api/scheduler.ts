import { delay, storage, timestamp } from "./db";
import { runner } from "./runner";
import type { AppSettings, FacebookGroup, ScheduledPost } from "./types";

const FALLBACK_DAILY_CAP = 25;
const POSTING_WINDOW_START_HOUR = 9;
const POSTING_WINDOW_END_HOUR = 20;
const DISPATCH_INTERVAL_MS = 60_000;
const WAIT_POLL_MS = 5_000;

type PostingWindow = {
  start: Date;
  end: Date;
  capacity: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const localDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const localDayStart = (date: Date, offsetDays = 0) => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() + offsetDays);
  return next;
};

const localHour = (day: Date, hour: number) => {
  const next = new Date(day);
  next.setHours(hour, 0, 0, 0);
  return next;
};

const localDayIsoRange = (date: Date) => {
  const start = localDayStart(date);
  const end = localDayStart(date, 1);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
};

const readDailyCap = (settings: AppSettings) => {
  const raw = Number((settings as AppSettings & { maxPostsPerDay?: number }).maxPostsPerDay);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : FALLBACK_DAILY_CAP;
};

const minDelayMs = (settings: AppSettings) =>
  Math.max(60, Number(settings.minDelaySeconds) || 60) * 1000;

const postingWindow = (
  baseDate: Date,
  settings: AppSettings,
  notBefore: Date,
  existingPostedCount = 0,
): PostingWindow => {
  const day = localDayStart(baseDate);
  const start = new Date(
    Math.max(localHour(day, POSTING_WINDOW_START_HOUR).getTime(), notBefore.getTime()),
  );
  const end = localHour(day, POSTING_WINDOW_END_HOUR);
  const remainingDailyCap = Math.max(0, readDailyCap(settings) - existingPostedCount);
  if (start > end || remainingDailyCap === 0) return { start, end, capacity: 0 };
  const spacingCapacity = Math.floor((end.getTime() - start.getTime()) / minDelayMs(settings)) + 1;
  return { start, end, capacity: Math.max(0, Math.min(remainingDailyCap, spacingCapacity)) };
};

const buildWindows = (
  count: number,
  requestedDays: number,
  settings: AppSettings,
  notBefore: Date,
): PostingWindow[] => {
  const windows: PostingWindow[] = [];
  let capacity = 0;
  let offset = 0;
  const minimumDays = Math.max(1, requestedDays);
  while (capacity < count || windows.length < minimumDays) {
    const day = localDayStart(notBefore, offset);
    const { startIso, endIso } = localDayIsoRange(day);
    const postedToday = storage.postedResultsBetween(startIso, endIso);
    const window = postingWindow(day, settings, notBefore, postedToday);
    windows.push(window);
    capacity += window.capacity;
    offset += 1;
  }
  return windows;
};

const allocateCounts = (count: number, windows: PostingWindow[]) => {
  const allocations = windows.map(() => 0);
  let remaining = count;
  while (remaining > 0) {
    let assignedThisPass = false;
    for (const [index, window] of windows.entries()) {
      if (remaining === 0) break;
      if (allocations[index] >= window.capacity) continue;
      allocations[index] += 1;
      remaining -= 1;
      assignedThisPass = true;
    }
    if (!assignedThisPass) break;
  }
  return allocations;
};

const timesForWindow = (window: PostingWindow, count: number, settings: AppSettings) => {
  if (count <= 0) return [];
  const minGap = minDelayMs(settings);
  if (count === 1) {
    const start = window.start.getTime();
    const end = Math.max(start, window.end.getTime());
    return [new Date(start + Math.random() * (end - start))];
  }
  const requiredSpan = (count - 1) * minGap;
  const availableSpan = Math.max(requiredSpan, window.end.getTime() - window.start.getTime());
  const gap = Math.max(minGap, availableSpan / (count - 1));
  const jitterBudget = Math.min(Math.max(0, gap - minGap) / 3, 30 * 60 * 1000);
  const times: Date[] = [];
  for (let index = 0; index < count; index += 1) {
    const previous = times[index - 1]?.getTime() ?? window.start.getTime() - minGap;
    const remaining = count - index - 1;
    const ideal = window.start.getTime() + index * gap;
    const jitter = jitterBudget ? (Math.random() * 2 - 1) * jitterBudget : 0;
    const earliest = Math.max(window.start.getTime(), previous + minGap);
    const latest = window.end.getTime() - remaining * minGap;
    times.push(new Date(clamp(ideal + jitter, earliest, latest)));
  }
  return times;
};

export const buildSpreadSchedule = (
  groups: FacebookGroup[],
  postText: string,
  requestedDays: number,
  settings: AppSettings,
  notBefore = new Date(Date.now() + 60_000),
) => {
  const safeNotBefore = new Date(notBefore);
  const windows = buildWindows(groups.length, requestedDays, settings, safeNotBefore);
  const allocations = allocateCounts(groups.length, windows);
  const times = windows.flatMap((window, index) =>
    timesForWindow(window, allocations[index], settings),
  );
  return groups.map((group, index) => ({
    group,
    postText,
    scheduledFor: times[index].toISOString(),
    earliestRunAt: times[index].toISOString(),
  }));
};

const nextRetryTime = (settings: AppSettings) => {
  const tomorrow = localDayStart(new Date(), 1);
  return buildWindows(1, 1, settings, localHour(tomorrow, POSTING_WINDOW_START_HOUR))[0].start;
};

export class ScheduledPostDispatcher {
  private timer: NodeJS.Timeout | null = null;
  private busy = false;

  start() {
    if (this.timer) return;
    this.rescheduleOverduePendingPosts(new Date(Date.now() + minDelayMs(storage.getSettings())));
    this.timer = setInterval(() => void this.tick(), DISPATCH_INTERVAL_MS);
    void this.tick();
  }

  stop() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  private async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      const settings = storage.getSettings();
      if (storage.getActiveBlockCooldown()) return;
      const { startIso, endIso } = localDayIsoRange(new Date());
      if (storage.postedResultsBetween(startIso, endIso) >= readDailyCap(settings)) {
        this.rescheduleOverduePendingPosts(
          localHour(localDayStart(new Date(), 1), POSTING_WINDOW_START_HOUR),
        );
        return;
      }
      const status = await runner.getStatus();
      if (["running", "paused", "waiting_for_human"].includes(status.diagnostics.runnerStatus)) {
        return;
      }
      const item = storage.claimDueScheduledPost(timestamp());
      if (!item) return;
      await this.runScheduledPost(item);
      this.rescheduleOverduePendingPosts(new Date(Date.now() + minDelayMs(storage.getSettings())));
    } finally {
      this.busy = false;
    }
  }

  private async runScheduledPost(item: ScheduledPost) {
    try {
      const session = storage.createSession(item.postText, [item.groupId]);
      storage.updateScheduledPost(item.id, { createdSessionId: session.id, lastError: "" });
      await runner.start(session.id);
      await this.waitForSession(session.id, item.id);
      const sessionAfterRun = storage.getSession(session.id);
      if (sessionAfterRun?.state === "blocked") {
        storage.updateScheduledPost(item.id, {
          status: "pending",
          lastError: "Facebook has temporarily limited posting. This post will wait.",
        });
        return;
      }
      const result = storage.resultForGroup(session.id, item.groupId);
      if (result?.status === "posted") {
        storage.updateScheduledPost(item.id, {
          status: "posted",
          completedAt: timestamp(),
          lastError: "",
        });
        return;
      }
      if (result?.status === "skipped") {
        storage.updateScheduledPost(item.id, {
          status: "skipped",
          completedAt: timestamp(),
          lastError: result.message,
        });
        return;
      }
      const message = result?.message || `Posting ended as ${result?.status ?? "stopped"}.`;
      this.failOrRetry(item.id, message);
    } catch (error) {
      if (storage.getActiveBlockCooldown()) {
        storage.updateScheduledPost(item.id, {
          status: "pending",
          lastError: "Facebook has temporarily limited posting. This post will wait.",
        });
        return;
      }
      this.failOrRetry(item.id, error instanceof Error ? error.message : "Scheduled post failed.");
    }
  }

  private async waitForSession(sessionId: string, scheduledPostId: string) {
    while (true) {
      const scheduledPost = storage.getScheduledPost(scheduledPostId);
      if (scheduledPost?.status === "canceled") {
        runner.stop();
        return;
      }
      const session = storage.getSession(sessionId);
      if (!session || ["blocked", "completed", "stopped"].includes(session.state)) return;
      await delay(WAIT_POLL_MS);
    }
  }

  private failOrRetry(scheduledPostId: string, message: string) {
    const item = storage.getScheduledPost(scheduledPostId);
    if (!item) return;
    if (item.attempts < 2) {
      const retryAt = nextRetryTime(storage.getSettings());
      storage.updateScheduledPost(item.id, {
        status: "pending",
        scheduledFor: retryAt.toISOString(),
        earliestRunAt: retryAt.toISOString(),
        lastError: message,
      });
      return;
    }
    storage.updateScheduledPost(item.id, {
      status: "failed",
      completedAt: timestamp(),
      lastError: message,
    });
  }

  private rescheduleOverduePendingPosts(notBefore: Date) {
    const overdue = storage
      .listScheduledPosts(["pending"])
      .filter((item) => new Date(item.earliestRunAt).getTime() < Date.now());
    if (!overdue.length) return;
    const settings = storage.getSettings();
    const slots = buildSpreadSchedule(
      overdue.map((item) => ({
        id: item.groupId,
        name: item.groupName,
        url: item.groupUrl,
        category: "",
        subcategory: "",
        tags: [],
        status: "active",
        notes: "",
        source: "scheduled_queue",
        sourceCapturedAt: null,
        sourceUpdatedAt: null,
        lastPostedAt: null,
        failureCount: 0,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
      "",
      Math.ceil(overdue.length / readDailyCap(settings)),
      settings,
      notBefore,
    );
    for (const [index, item] of overdue.entries()) {
      const slot = slots[index];
      storage.updateScheduledPost(item.id, {
        scheduledFor: slot.scheduledFor,
        earliestRunAt: slot.earliestRunAt,
      });
    }
  }
}

export const scheduledPostDispatcher = new ScheduledPostDispatcher();
