import { assert, it } from "@effect/vitest";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as TestClock from "effect/testing/TestClock";

import { nextAlignedRefreshDelay } from "./alignedRefreshSchedule.ts";

it.effect("delays to the next wall-clock interval boundary", () =>
  Effect.gen(function* () {
    yield* TestClock.setTime(Date.parse("2026-11-28T12:02:30.000Z"));
    assert.strictEqual(
      Duration.toMillis(yield* nextAlignedRefreshDelay("5 minutes")),
      2 * 60_000 + 30_000,
    );

    yield* TestClock.setTime(Date.parse("2026-11-28T12:05:00.000Z"));
    assert.strictEqual(Duration.toMillis(yield* nextAlignedRefreshDelay("5 minutes")), 5 * 60_000);
  }),
);
