import type {
  ProviderUsageLimitsUpdate,
  ServerProviderUsageLimits,
  ServerProviderUsageWindow,
} from "@t3tools/contracts";

const WINDOW_KIND_ORDER: Record<ServerProviderUsageWindow["kind"], number> = {
  session: 0,
  weekly: 1,
  monthly: 2,
  other: 3,
};

export function clampPercent(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
}

function sortWindows(
  windows: Iterable<ServerProviderUsageWindow>,
): ReadonlyArray<ServerProviderUsageWindow> {
  return [...windows].toSorted(
    (left, right) =>
      WINDOW_KIND_ORDER[left.kind] - WINDOW_KIND_ORDER[right.kind] ||
      left.id.localeCompare(right.id),
  );
}

export function makeUsageLimits(input: {
  readonly checkedAt: string;
  readonly windows: Iterable<ServerProviderUsageWindow>;
}): ServerProviderUsageLimits {
  return { checkedAt: input.checkedAt, windows: sortWindows(input.windows) };
}

export function makeUnavailableUsageLimits(input: {
  readonly checkedAt: string;
  readonly reason: "unsupported" | "probeFailed";
  readonly message?: string;
}): ServerProviderUsageLimits {
  return {
    checkedAt: input.checkedAt,
    windows: [],
    unavailable: {
      reason: input.reason,
      ...(input.message ? { message: input.message } : {}),
    },
  };
}

const RESET_ADVANCE_MIN_MS = 60 * 60 * 1000;
const RESET_USAGE_DROP_MIN_POINTS = 5;

/**
 * A fresh window whose reset time jumped forward while its usage dropped is a real reset.
 * Anchor the new window at the last probe; a rolling timer that merely drifts forward is not.
 */
function anchorResetWindow(
  previous: ServerProviderUsageLimits | undefined,
  existing: ServerProviderUsageWindow | undefined,
  window: ServerProviderUsageWindow,
): ServerProviderUsageWindow {
  if (existing === undefined) return window;
  const carried = window.windowStartAt ?? existing.windowStartAt;
  const advanced =
    window.resetsAt !== undefined &&
    existing.resetsAt !== undefined &&
    Date.parse(window.resetsAt) - Date.parse(existing.resetsAt) >= RESET_ADVANCE_MIN_MS;
  const dropped = existing.usedPercent - window.usedPercent >= RESET_USAGE_DROP_MIN_POINTS;
  const startAt = advanced && dropped ? previous?.checkedAt : carried;
  return startAt === undefined || startAt === window.windowStartAt
    ? window
    : { ...window, windowStartAt: startAt };
}

export function applyUsageLimitsUpdate(input: {
  readonly previous: ServerProviderUsageLimits | undefined;
  readonly update: ProviderUsageLimitsUpdate;
  readonly checkedAt: string;
}): ServerProviderUsageLimits | undefined {
  const { previous, update } = input;
  if (update.windows.length === 0 || previous?.unavailable?.reason === "unsupported") {
    return previous;
  }
  const merged = new Map(previous?.windows.map((window) => [window.id, window] as const));
  // Codex repeats unchanged limits on token ticks; avoid allocating snapshots for no-ops.
  let changed = false;
  for (const window of update.windows) {
    const existing = merged.get(window.id);
    const next = anchorResetWindow(previous, existing, {
      ...window,
      usedPercent: clampPercent(window.usedPercent),
      ...(window.resetsAt === undefined && existing?.resetsAt !== undefined
        ? { resetsAt: existing.resetsAt }
        : {}),
      ...(window.windowDurationMins === undefined && existing?.windowDurationMins !== undefined
        ? { windowDurationMins: existing.windowDurationMins }
        : {}),
    });
    if (existing === undefined || !usageWindowEquals(existing, next)) {
      merged.set(window.id, next);
      changed = true;
    }
  }
  if (!changed && previous !== undefined) {
    return previous;
  }
  const unavailable =
    previous === undefined ? { reason: "probeFailed" as const } : previous.unavailable;
  return {
    ...makeUsageLimits({ checkedAt: input.checkedAt, windows: merged.values() }),
    ...(previous?.resetCredits !== undefined ? { resetCredits: previous.resetCredits } : {}),
    ...(previous?.zeroSpendCap ? { zeroSpendCap: true } : {}),
    ...(unavailable !== undefined ? { unavailable } : {}),
  };
}

function usageWindowEquals(a: ServerProviderUsageWindow, b: ServerProviderUsageWindow): boolean {
  return (
    a.id === b.id &&
    a.kind === b.kind &&
    a.label === b.label &&
    a.usedPercent === b.usedPercent &&
    (a.modelIds === b.modelIds ||
      (a.modelIds !== undefined &&
        b.modelIds !== undefined &&
        a.modelIds.length === b.modelIds.length &&
        a.modelIds.every((id, index) => id === b.modelIds?.[index]))) &&
    (a.providerIds === b.providerIds ||
      (a.providerIds !== undefined &&
        b.providerIds !== undefined &&
        a.providerIds.length === b.providerIds.length &&
        a.providerIds.every((id, index) => id === b.providerIds?.[index]))) &&
    a.resetsAt === b.resetsAt &&
    a.windowStartAt === b.windowStartAt &&
    a.windowDurationMins === b.windowDurationMins
  );
}

export function resolveUsageLimitsAfterProbe(input: {
  readonly published: ServerProviderUsageLimits | undefined;
  readonly probed: ServerProviderUsageLimits | undefined;
}): ServerProviderUsageLimits | undefined {
  const { published, probed } = input;
  if (probed?.unavailable?.reason === "probeFailed" && published && !published.unavailable) {
    return published;
  }
  if (
    published &&
    probed &&
    !published.unavailable &&
    !probed.unavailable &&
    Date.parse(published.checkedAt) > Date.parse(probed.checkedAt)
  ) {
    return { ...probed, checkedAt: published.checkedAt, windows: published.windows };
  }
  if (probed === undefined || probed.windows.length === 0) return probed;
  const publishedById = new Map(published?.windows.map((window) => [window.id, window] as const));
  const windows = probed.windows.map((window) =>
    anchorResetWindow(published, publishedById.get(window.id), window),
  );
  return windows.some((window, index) => window !== probed.windows[index])
    ? { ...probed, windows }
    : probed;
}
