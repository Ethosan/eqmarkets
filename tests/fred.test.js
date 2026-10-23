import { afterEach, describe, expect, it, vi } from "vitest";
import { fredSeries } from "../src/data/sources.js";

const csv = (id, rows) => "observation_date," + id + "\n" + rows.map(([d, v]) => d + "," + v).join("\n") + "\n";

afterEach(() => vi.unstubAllGlobals());

describe("FRED fetch", () => {
  it("puts the series in the proxy path and rejects a CSV for another series", async () => {
    const urls = [];
    vi.stubGlobal("fetch", vi.fn(async url => {
      urls.push(url);
      /* The same-origin proxy answers with a cached CSV for a different series. */
      return new Response(csv("BAMLC0A0CM", [["2026-10-14", "0.84"], ["2026-10-15", "0.84"]]), { status: 200 });
    }));
    const s = await fredSeries("T10YIE", 30);
    expect(urls[0]).toMatch(/^\/fredx\/T10YIE\/\d{4}-\d{2}-\d{2}\/graph\/fredgraph\.csv\?id=T10YIE&/);
    /* One transport: a rejected CSV fails the feed instead of falling through. */
    expect(urls).toHaveLength(1);
    expect(s).toBeNull();
  });

  it("parses a CSV that names the series", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(csv("T10YIE", [["2026-10-14", "2.35"], ["2026-10-15", "."], ["2026-10-16", "2.32"]]), { status: 200 })));
    const s = await fredSeries("T10YIE", 30);
    expect(s.values).toEqual([2.35, 2.32]);
    expect(s.asOf).toBe("2026-10-16");
  });
});
