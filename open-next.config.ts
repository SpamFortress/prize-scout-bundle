import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/** Local preview uses an in-memory cache. R2 is not configured and nothing is deployed. */
export default defineCloudflareConfig({
  incrementalCache: "dummy",
});
