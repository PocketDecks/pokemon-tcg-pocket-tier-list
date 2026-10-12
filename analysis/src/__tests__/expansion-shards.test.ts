import { EXPANSION_RELEASE_DATE } from "../settings";
import {
  PRE_LAUNCH_SHARD,
  SHARD_WINDOWS,
  buildShardWindows,
  shardIdForDate,
} from "../utils/expansion-shards";

const list = [
  { id: "a1", release_date: "2024-10-30" },
  { id: "a1a", release_date: "2024-12-17" },
  { id: "pa", release_date: null },
  { id: "a4b", release_date: "2025-01-05" },
  { id: "a2", release_date: "2025-01-29" },
];

describe("buildShardWindows", () => {
  it("drops excluded and undated expansions and sorts by release", () => {
    const shuffled = [list[4], list[0], list[3], list[2], list[1]];
    expect(buildShardWindows(shuffled, new Set(["a4b"])).map((w) => w.id)).toEqual([
      "a1",
      "a1a",
      "a2",
    ]);
  });
});

describe("shardIdForDate", () => {
  const windows = buildShardWindows(list, new Set(["a4b"]));

  it("files a date before the first release under the pre-launch shard", () => {
    expect(shardIdForDate("2024-10-29T23:59:59.999Z", windows)).toBe(PRE_LAUNCH_SHARD);
  });

  it("starts a shard on the exact release instant", () => {
    expect(shardIdForDate("2024-10-30T00:00:00.000Z", windows)).toBe("a1");
  });

  it("ends a shard one millisecond before the next release", () => {
    expect(shardIdForDate("2024-12-16T23:59:59.999Z", windows)).toBe("a1");
    expect(shardIdForDate("2024-12-17T00:00:00.000Z", windows)).toBe("a1a");
  });

  it("keeps a date inside an excluded expansion's span in the earlier shard", () => {
    expect(shardIdForDate("2025-01-10T00:00:00.000Z", windows)).toBe("a1a");
  });

  it("files every later date under the newest shard", () => {
    expect(shardIdForDate("2030-01-01T00:00:00.000Z", windows)).toBe("a2");
  });

  it("rejects an unparseable date", () => {
    expect(() => shardIdForDate("not a date", windows)).toThrow("invalid date");
  });
});

describe("SHARD_WINDOWS", () => {
  it("ends on the release the pipeline treats as current", () => {
    const newest = SHARD_WINDOWS[SHARD_WINDOWS.length - 1];
    expect(newest.start).toBe(EXPANSION_RELEASE_DATE.getTime());
  });
});
