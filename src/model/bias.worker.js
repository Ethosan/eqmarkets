/* Builds the market-bias read off the main thread (see bias.js). */
import { computeBiasData } from "./bias.js";

self.onmessage = async e => {
  try {
    const out = await computeBiasData(e.data.range, (done, total) => self.postMessage({ progress: [done, total] }));
    self.postMessage({ done: out });
  } catch (err) {
    self.postMessage({ error: String(err?.message || err) });
  }
};
