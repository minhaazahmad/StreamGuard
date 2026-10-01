const t = require("tap");

const buildApp = require("../src/app");
const pool = require("../src/config/postgres");
const redis = require("../src/config/redis");

t.test("API authentication", async (t) => {
  const app = buildApp();

  try {
    // Missing API key
    const missingKey = await app.inject({
      method: "POST",
      url: "/api/v1/events",
      payload: {
        eventType: "auth-test",
        source: "test",
        payload: {
          message: "missing key"
        }
      }
    });

    t.equal(missingKey.statusCode, 401);

    const missingBody = JSON.parse(missingKey.body);

    t.equal(missingBody.code, "MISSING_API_KEY");

    // Invalid API key
    const invalidKey = await app.inject({
      method: "POST",
      url: "/api/v1/events",
      headers: {
        "x-api-key": "wrong-key"
      },
      payload: {
        eventType: "auth-test",
        source: "test",
        payload: {
          message: "invalid key"
        }
      }
    });

    t.equal(invalidKey.statusCode, 401);

    const invalidBody = JSON.parse(invalidKey.body);

    t.equal(invalidBody.code, "INVALID_API_KEY");

    // Valid API key
    const validKey = await app.inject({
      method: "POST",
      url: "/api/v1/events",
      headers: {
        "x-api-key": process.env.API_KEY
      },
      payload: {
        eventType: "auth-test",
        source: "test",
        payload: {
          message: "valid key"
        }
      }
    });

    t.equal(validKey.statusCode, 202);

    const validBody = JSON.parse(validKey.body);

    t.equal(validBody.status, "accepted");
  } finally {
    await app.close();
    await pool.end();
    await redis.quit();
  }
});
