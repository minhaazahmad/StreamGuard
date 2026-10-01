require("dotenv").config();

const Fastify = require("fastify");
const rateLimit = require("@fastify/rate-limit");

const eventRoutes = require("./routes/events.routes");
const dlqRoutes = require("./routes/dlq.routes");
const healthRoutes = require("./routes/health.routes");

const swagger = require("@fastify/swagger");
const swaggerUI = require("@fastify/swagger-ui");

const { register } = require("./metrics/metrics");

function buildApp() {
  const app = Fastify({
    logger: true
  });

  // ==========================================
  // Rate Limiting
  // ==========================================

  app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute"
  });

  // ==========================================
  // Global Error Handler
  // ==========================================

  app.setErrorHandler((error, request, reply) => {
    // Log complete error internally
    request.log.error(error);

    // Fastify / AJV validation error
    if (error.validation) {
      return reply.code(400).send({
        status: "error",
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: error.validation.map((item) => ({
          field:
            item.instancePath ||
            item.params?.missingProperty ||
            "request",
          message: item.message
        }))
      });
    }

    // Known HTTP errors
    if (
      error.statusCode &&
      error.statusCode >= 400 &&
      error.statusCode < 500
    ) {
      return reply.code(error.statusCode).send({
        status: "error",
        code: error.code || "HTTP_ERROR",
        message: error.message
      });
    }

    // Unexpected server errors
    return reply.code(500).send({
      status: "error",
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected server error occurred"
    });
  });

  // ==========================================
  // Swagger / OpenAPI Documentation
  // ==========================================

  app.register(swagger, {
    openapi: {
      info: {
        title: "StreamGuard API",
        description:
          "Distributed Event Ingestion Pipeline API",
        version: "1.0.0"
      },

      components: {
        securitySchemes: {
          ApiKeyAuth: {
            type: "apiKey",
            in: "header",
            name: "x-api-key",
            description:
              "API key required to access protected endpoints."
          }
        }
      }
    }
  });

  // ==========================================
  // Swagger UI
  // ==========================================

  app.register(swaggerUI, {
    routePrefix: "/docs"
  });

  // ==========================================
  // Root Route
  // ==========================================

  app.get("/", async () => {
    return {
      name: "StreamGuard",
      status: "running",
      message: "Distributed Event Ingestion Pipeline"
    };
  });

  // ==========================================
  // API Routes
  // ==========================================

  app.register(eventRoutes);
  app.register(dlqRoutes);
  app.register(healthRoutes);

  // ==========================================
  // Prometheus Metrics
  // ==========================================

  app.get("/metrics", async (request, reply) => {
    reply.header(
      "Content-Type",
      register.contentType
    );

    return register.metrics();
  });

  return app;
}

module.exports = buildApp;