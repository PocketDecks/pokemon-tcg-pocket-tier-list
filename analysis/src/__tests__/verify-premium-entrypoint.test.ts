import { describe, expect, it } from "vitest";

import { verifyPremium } from "../../scripts/verify-premium";
import { PREMIUM_ARTEFACT_NAMES, premiumVersion, sha256Hex } from "../utils/premium-artefacts";

describe("verify-premium entry point", () => {
  it("verifies a complete uploaded set", async () => {
    const payloads = Object.fromEntries(
      PREMIUM_ARTEFACT_NAMES.map((name) => [name, `{"name":"${name}"}`])
    );
    const version = premiumVersion(payloads);
    const db = {
      doc: (path: string) => ({
        get: async () => {
          if (path.endsWith(version)) {
            return {
              exists: true,
              get: (field: string) =>
                field === "artefacts"
                  ? Object.fromEntries(
                      Object.entries(payloads).map(([name, payload]) => [name, sha256Hex(payload)])
                    )
                  : null,
            };
          }
          const name = path.split("/").pop() ?? "";
          return {
            exists: name in payloads,
            get: (field: string) =>
              field === "payload" ? payloads[name] : sha256Hex(payloads[name] ?? ""),
          };
        },
      }),
    };
    const lines: string[] = [];
    const failures: string[] = [];
    await verifyPremium(
      { db, version },
      (line) => lines.push(line),
      (line) => failures.push(line)
    );
    expect(failures).toEqual([]);
    expect(lines[0]).toMatch(/is complete in/);
  });

  it("lists every problem before failing", async () => {
    const db = { doc: () => ({ get: async () => ({ exists: false, get: () => null }) }) };
    const failures: string[] = [];
    await expect(
      verifyPremium({ db }, () => {}, (line) => failures.push(line))
    ).rejects.toThrow(/is not complete/);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatch(/version .+ is missing/);
  });
});
