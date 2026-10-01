require("dotenv").config();

const buildApp = require("./app");
const pool = require("./config/postgres");
const redis = require("./config/redis");

const app = buildApp();

const start = async () => {
  try {
    const port = Number(process.env.PORT) || 3000;

    await app.listen({
      port,
      host: "0.0.0.0",
    });

    console.log(
      `StreamGuard API running on http://localhost:${port}`
    );
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

// ==========================================
// Graceful Shutdown
// ==========================================

const shutdown = async (signal) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);

  try {
    // Stop accepting new HTTP requests
    await app.close();
    console.log("HTTP server closed");

    // Close PostgreSQL connection pool
    await pool.end();
    console.log("PostgreSQL connection pool closed");

    // Close Redis connection
    await redis.quit();
    console.log("Redis connection closed");

    console.log("StreamGuard shutdown complete");

    process.exit(0);
  } catch (error) {
    console.error("Error during shutdown:", error);
    process.exit(1);
  }
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

start();