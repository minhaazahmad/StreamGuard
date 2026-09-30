require("dotenv").config();

const Fastify = require("fastify");
const eventRoutes = require("./routes/events.routes");
const dlqRoutes = require("./routes/dlq.routes");
const healthRoutes = require("./routes/health.routes");

function buildApp() {
  const app = Fastify({
    logger: true
  });

  app.get("/", async () => {
    return {
      name: "StreamGuard",
      status: "running",
      message: "Distributed Event Ingestion Pipeline"
    };
  });

  // Register event ingestion routes
  app.register(eventRoutes);
  app.register(dlqRoutes);
  app.register(healthRoutes);

  return app;
}

module.exports = buildApp;