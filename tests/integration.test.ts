import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { AddressInfo } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileRecordStore } from "../src/storage/files";
import {
  DEFAULT_CONFIG,
  ProviderSchema,
  SavedRecord,
} from "../src/core/schema";
import { jsonProvider } from "../src/providers/json";
import { sendToAnki } from "../src/core/anki";
import { requestHtml, requestJson } from "../src/core/http";

function sample(id: string): SavedRecord {
  return {
    id,
    text: "abstraction",
    context: "The abstraction is useful.",
    profileId: "cs",
    profileName: "计算机",
    createdAt: "2026-10-26",
    updatedAt: "2026-10-26",
    results: [],
  };
}
async function server(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
) {
  const app = createServer(handler);
  await new Promise<void>((resolve) => app.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${(app.address() as AddressInfo).port}`,
    close: () => new Promise<void>((resolve) => app.close(() => resolve())),
  };
}
test("atomic notebook records survive concurrent independent saves and deletion", async () => {
  const directory = await mkdtemp(join(tmpdir(), "raydict-test-"));
  try {
    const store = new FileRecordStore(directory);
    await Promise.all(
      Array.from({ length: 20 }, (_, i) => store.put(sample(`record-${i}`))),
    );
    assert.equal((await store.list()).length, 20);
    await store.remove("record-2");
    assert.equal((await store.list()).length, 19);
    await assert.rejects(() => store.remove("../escape"));
    await store.clear();
    assert.equal((await store.list()).length, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
test("no-code POST provider sends exact text and configured token header", async () => {
  const service = await server((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      assert.equal(req.headers.authorization, "Bearer test-secret");
      const input = JSON.parse(body);
      assert.equal(input.text, 'a "quoted"\nline');
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ data: [{ meaning: "映射成功" }] }));
    });
  });
  try {
    const config = ProviderSchema.parse({
      id: "test",
      name: "Test",
      kind: "json",
      endpoint: service.url,
      method: "POST",
      tokenSlot: "1",
      headers: { Authorization: "Bearer {token}" },
      body: { text: "{word}" },
      mapping: { entries: "data", definition: "meaning" },
    });
    const result = await jsonProvider.lookup({
      input: { text: 'a "quoted"\nline' },
      profile: DEFAULT_CONFIG.profiles[0],
      config,
      signal: AbortSignal.timeout(1000),
      token: "test-secret",
    });
    assert.equal(result?.summary, "映射成功");
  } finally {
    await service.close();
  }
});
test("HTTP failures, invalid JSON and redirects surface cleanly", async () => {
  const service = await server((req, res) => {
    if (req.url === "/limit") res.statusCode = 429;
    if (req.url === "/redirect") {
      res.statusCode = 302;
      res.setHeader("Location", "/target");
    }
    res.end("not JSON");
  });
  try {
    await assert.rejects(
      () => requestJson(`${service.url}/limit`, AbortSignal.timeout(1000)),
      /限流/,
    );
    await assert.rejects(
      () => requestJson(`${service.url}/bad`, AbortSignal.timeout(1000)),
      /JSON/,
    );
    await assert.rejects(() =>
      requestJson(`${service.url}/redirect`, AbortSignal.timeout(1000)),
    );
  } finally {
    await service.close();
  }
});
test("public dictionary HTML follows bounded same-origin canonical redirects", async () => {
  const visited: string[] = [];
  const service = await server((req, res) => {
    visited.push(req.url ?? "");
    if (req.url === "/run") {
      res.writeHead(302, { Location: "/run_1" });
    } else if (req.url === "/loop") {
      res.writeHead(302, { Location: "/loop" });
    } else if (req.url === "/other") {
      res.writeHead(302, { Location: "https://example.com/" });
    } else if (req.url === "/credentials") {
      res.writeHead(302, {
        Location: service.url.replace("://", "://user:secret@") + "/run_1",
      });
    }
    res.end("<html>canonical word entry</html>");
  });
  try {
    assert.equal(
      await requestHtml(`${service.url}/run`, AbortSignal.timeout(1000)),
      "<html>canonical word entry</html>",
    );
    assert.deepEqual(visited, ["/run", "/run_1"]);
    await assert.rejects(
      () => requestHtml(`${service.url}/loop`, AbortSignal.timeout(1000)),
      /跳转次数/,
    );
    await assert.rejects(
      () => requestHtml(`${service.url}/other`, AbortSignal.timeout(1000)),
      /不同站点/,
    );
    await assert.rejects(
      () =>
        requestHtml(`${service.url}/credentials`, AbortSignal.timeout(1000)),
      /不同站点/,
    );
  } finally {
    await service.close();
  }
});
test("Anki checks model and deck, preserves API key, and submits duplicate-safe fields", async () => {
  const actions: string[] = [];
  const service = await server((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const payload = JSON.parse(body);
      actions.push(payload.action);
      assert.equal(payload.version, 6);
      assert.equal(payload.key, "local-key");
      let result: unknown;
      if (payload.action === "modelFieldNames") result = ["Front", "Back"];
      if (payload.action === "deckNames") result = ["Default"];
      if (payload.action === "addNote") {
        assert.equal(payload.params.note.options.allowDuplicate, false);
        assert(payload.params.note.fields.Front.includes("abstraction"));
        result = 123;
      }
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ result, error: null }));
    });
  });
  try {
    assert.equal(
      await sendToAnki(sample("id"), {
        endpoint: service.url,
        key: "local-key",
        deck: "Default",
        model: "Basic",
        front: "Front",
        back: "Back",
      }),
      123,
    );
    assert.deepEqual(actions, ["modelFieldNames", "deckNames", "addNote"]);
    await assert.rejects(
      () =>
        sendToAnki(sample("id"), {
          endpoint: "http://remote.example.com",
          deck: "Default",
          model: "Basic",
          front: "Front",
          back: "Back",
        }),
      /本机/,
    );
  } finally {
    await service.close();
  }
});
