import * as Clock from "effect/Clock";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";

/** Pass the caller's own `now` when it also derives the boundary, so both use one clock read. */
export const nextAlignedRefreshDelay = Effect.fn("nextAlignedRefreshDelay")(function* (
  interval: Duration.Input,
  at?: number,
) {
  const intervalMs = Duration.toMillis(Duration.fromInputUnsafe(interval));
  const now = at ?? (yield* Clock.currentTimeMillis);
  const remainder = now % intervalMs;
  return Duration.millis(remainder === 0 ? intervalMs : intervalMs - remainder);
});
