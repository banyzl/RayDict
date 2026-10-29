import { writeFile } from "node:fs/promises";
import { CATALOG } from "../src/core/catalog";
import { DEFAULT_CONFIG } from "../src/core/schema";
void writeFile(
  "assets/settings-catalog.json",
  JSON.stringify({ defaults: DEFAULT_CONFIG, items: CATALOG }, null, 2),
);
