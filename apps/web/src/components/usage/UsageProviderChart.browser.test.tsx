import type { UsageProviderKind } from "@t3tools/contracts";
import type { DailyTotals } from "@t3tools/shared/usageMerge";
import { expect, it } from "vite-plus/test";

import { render } from "../../../test/render";
import { UsageProviderChart } from "./UsageProviderChart";

const daily: readonly DailyTotals[] = [
  {
    day: "2026-11-15",
    costUsd: 12,
    totalTokens: 120,
    byProvider: new Map([
      ["codex", { costUsd: 5, totalTokens: 50 }],
      ["claude", { costUsd: 7, totalTokens: 70 }],
    ]),
  },
];

it("announces loading providers and partial totals in the accessible chart table", async () => {
  // The chart has no routing dependencies.
  await using screen = await render(
    <UsageProviderChart
      providers={["codex", "claude"]}
      loadingProviders={new Set<UsageProviderKind>(["claude"])}
      days={["2026-11-15"]}
      daily={daily}
      hours={[]}
      hourly={[]}
      metric="cost"
      referenceTime={undefined}
      resolution="day"
      timeZone="UTC"
      hour12={false}
    />,
    { router: false },
  );

  await expect.element(screen.getByRole("columnheader", { name: /Claude.*Loading/ })).toBeVisible();
  await expect.element(screen.getByRole("columnheader", { name: /Total.*Partial/ })).toBeVisible();
});
