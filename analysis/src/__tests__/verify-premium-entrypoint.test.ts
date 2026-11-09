import { describe, expect, it } from "vitest";

import { runVerifyPremium, verifyPremium } from "../../scripts/verify-premium";
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
    const payloads = Object.fromEntries(
      PREMIUM_ARTEFACT_NAMES.map((name) => [name, `{"name":"${name}"}`])
    );
    const version = premiumVersion(payloads);
    const missing = [PREMIUM_ARTEFACT_NAMES[0], PREMIUM_ARTEFACT_NAMES[2]];
    const corrupt = [PREMIUM_ARTEFACT_NAMES[1], PREMIUM_ARTEFACT_NAMES[3]];
    const db = {
      doc: (path: string) => ({
        get: async () => {
          if (path.endsWith(version)) {
            return {
              exists: true,
              get: (field: string) =>
                field === "artefacts"
                  ? Object.fromEntries(
                      PREMIUM_ARTEFACT_NAMES.map((name) => [
                        name,
                        corrupt.includes(name) ? "wrong-hash" : sha256Hex(payloads[name]),
                      ])
                    )
                  : null,
            };
          }
          const name = path.split("/").pop() ?? "";
          return {
            exists: !missing.includes(name),
            get: (field: string) =>
              field === "payload"
                ? (corrupt.includes(name) ? "broken" : payloads[name])
                : sha256Hex(corrupt.includes(name) ? "broken" : payloads[name] ?? ""),
          };
        },
      }),
    };
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const exit = vi.fn();
    try {
      await runVerifyPremium({ db, version, projectId: "demo-project" }, exit);
      expect(exit).toHaveBeenCalledExactlyOnceWith(1);
      expect(error.mock.calls.map(([line]) => line)).toEqual([
        `artefact ${missing[0]} is missing`,
        `artefact ${corrupt[0]} hash mismatch`,
        `artefact ${missing[1]} is missing`,
        `artefact ${corrupt[1]} hash mismatch`,
        `premium version ${version} is not complete in demo-project`,
      ]);
    } finally {
      error.mockRestore();
    }
  });
});
