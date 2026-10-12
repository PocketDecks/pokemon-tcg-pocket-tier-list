import fs from "fs";
import os from "os";
import path from "path";
import http from "http";
import { AddressInfo } from "net";
import { stageOgImages } from "../utils/generate-og-images";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

describe("stageOgImages", () => {
  let workDir: string;
  let outputDir: string;
  let fixtureUrl: string;
  let missingUrl: string;
  let server: http.Server;
  const previousOutputDir = process.env.OG_OUTPUT_DIR;

  beforeAll(async () => {
    server = http.createServer((request, response) => {
      if (request.url?.includes("missing")) {
        response.writeHead(404);
        response.end();
        return;
      }
      response.writeHead(200, { "Content-Type": "image/png" });
      response.end(ONE_PIXEL_PNG);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    fixtureUrl = `${base}/card.png`;
    missingUrl = `${base}/missing.png`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), "og-images-test-"));
    outputDir = path.join(workDir, "og", "deck");
    process.env.OG_OUTPUT_DIR = outputDir;
  });

  afterEach(() => {
    fs.rmSync(workDir, { recursive: true, force: true });
    if (previousOutputDir === undefined) {
      delete process.env.OG_OUTPUT_DIR;
    } else {
      process.env.OG_OUTPUT_DIR = previousOutputDir;
    }
  });

  it("leaves the output directory untouched until commit", async () => {
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, "stale.png"), "old");

    const staged = await stageOgImages([
      { slug: "deck-a", name: "Charizard ex", iconUrls: [fixtureUrl] },
    ]);

    expect(fs.readdirSync(outputDir)).toEqual(["stale.png"]);
    staged.discard();
    expect(fs.readdirSync(outputDir)).toEqual(["stale.png"]);
  });

  it("publishes valid PNGs and prunes orphans on commit", async () => {
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, "stale.png"), "old");

    const staged = await stageOgImages([
      { slug: "deck-a", name: "Charizard ex", iconUrls: [fixtureUrl] },
      { slug: "deck-b", name: "Mewtwo ex", iconUrls: [fixtureUrl, fixtureUrl] },
    ]);
    staged.commit();

    expect(fs.readdirSync(outputDir).sort()).toEqual(["deck-a.png", "deck-b.png"]);
    for (const slug of staged.slugs) {
      const bytes = fs.readFileSync(path.join(outputDir, `${slug}.png`));
      expect(bytes.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
      expect(bytes.readUInt32BE(16)).toBe(1200);
      expect(bytes.readUInt32BE(20)).toBe(630);
    }
  });

  it("does not rewrite an image whose bytes are unchanged", async () => {
    const decks = [{ slug: "deck-a", name: "Charizard ex", iconUrls: [fixtureUrl] }];
    (await stageOgImages(decks)).commit();
    const published = path.join(outputDir, "deck-a.png");
    const past = new Date("2020-01-01T00:00:00.000Z");
    fs.utimesSync(published, past, past);

    (await stageOgImages(decks)).commit();

    expect(fs.statSync(published).mtime.getTime()).toBe(past.getTime());
  });

  it("fails and publishes nothing when a card image cannot be loaded", async () => {
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, "keep.png"), "old");

    await expect(
      stageOgImages([{ slug: "deck-a", name: "Charizard ex", iconUrls: [missingUrl] }])
    ).rejects.toThrow("failed to load card image");

    expect(fs.readdirSync(outputDir)).toEqual(["keep.png"]);
  });

  it("leaves the previous image set in place when a stale backup blocks the swap", async () => {
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, "keep.png"), "old");

    const staged = await stageOgImages([
      { slug: "deck-a", name: "Charizard ex", iconUrls: [fixtureUrl] },
    ]);
    // A leftover backup from an interrupted run must stop the swap and leave
    // the generation it belongs to alone.
    fs.mkdirSync(`${outputDir}.previous`, { recursive: true });

    expect(() => staged.commit()).toThrow("a previous image directory is still at");
    expect(fs.readdirSync(outputDir)).toEqual(["keep.png"]);
    staged.discard();
  });

  it("rejects a slug that could escape the directory", async () => {
    await expect(
      stageOgImages([{ slug: "../escape", name: "x", iconUrls: [fixtureUrl] }])
    ).rejects.toThrow("Invalid OG image slug");
  });
});
