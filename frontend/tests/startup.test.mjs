import test from "node:test";
import assert from "node:assert/strict";

const url = process.env.FRONTEND_URL;
test(
  "running frontend serves workspace and protects project API",
  { skip: !url },
  async () => {
    const health = await fetch(`${url}/api/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: "ok", milestone: 4 });
    const page = await fetch(url);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /Super Onboard/);
    assert.match(html, /Loading workspace/);
    if (process.env.BACKEND_RUNNING === "1") {
      const privateResponse = await fetch(`${url}/api/projects`);
      assert.equal(privateResponse.status, 401);
    }
  },
);
