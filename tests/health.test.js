const t = require("tap");

const buildApp = require("../src/app");
const pool = require("../src/config/postgres");
const redis = require("../src/config/redis");

t.test("GET /api/v1/health", async (t) => {
  const app = buildApp();

  try {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/health"
    });

    t.equal(response.statusCode, 200);

    const body = JSON.parse(response.body);

    t.equal(body.status, "healthy");
    t.equal(body.services.postgres, "up");
    t.equal(body.services.redis, "up");
  } finally {
    await app.close();
    await pool.end();
    await redis.quit();
  }
});