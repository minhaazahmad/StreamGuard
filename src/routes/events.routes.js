const crypto = require("crypto");
const apiKeyAuth = require("../middleware/auth");
const eventSchema = require("../schemas/event.schema");
const eventQueue = require("../queues/event.queue");
const { eventsReceived } = require("../metrics/metrics");

async function eventRoutes(app) {
  app.post(
    "/api/v1/events",
    {
      preHandler: apiKeyAuth,
      schema: {
        ...eventSchema,
        security: [
          {
            ApiKeyAuth: []
          }
        ],
        tags: ["Events"],

        summary: "Ingest a new event",

        description:
          "Accepts an event and places it into the StreamGuard processing queue for asynchronous processing.",

        headers: {
          type: "object",
          properties: {
            "idempotency-key": {
              type: "string",
              description:
                "Optional unique key used to prevent duplicate event creation."
            }
          }
        },

        response: {
          202: {
            description: "Event accepted for asynchronous processing",

            type: "object",

            properties: {
              status: {
                type: "string"
              },

              eventId: {
                type: "string"
              },

              message: {
                type: "string"
              }
            }
          },

          400: {
            description: "Request validation failed",

            type: "object",

            properties: {
              status: {
                type: "string"
              },

              code: {
                type: "string"
              },

              message: {
                type: "string"
              },

              details: {
                type: "array",

                items: {
                  type: "object",

                  properties: {
                    field: {
                      type: "string"
                    },

                    message: {
                      type: "string"
                    }
                  }
                }
              }
            }
          },

          500: {
            description: "Unexpected server error",

            type: "object",

            properties: {
              status: {
                type: "string"
              },

              code: {
                type: "string"
              },

              message: {
                type: "string"
              }
            }
          }
        }
      }
    },

    async (request, reply) => {
      const eventId =
        request.headers["idempotency-key"] ||
        `evt_${crypto.randomUUID()}`;

      const event = {
        eventId,
        eventType: request.body.eventType,
        source: request.body.source,
        payload: request.body.payload,
        receivedAt: new Date().toISOString()
      };

      app.log.info(
        {
          eventId,
          eventType: event.eventType
        },
        "Event received"
      );

      await eventQueue.add("process-event", event, {
        jobId: eventId,

        attempts: 3,

        backoff: {
          type: "exponential",
          delay: 1000
        },

        removeOnComplete: true,
        removeOnFail: false
      });

      // Increment Prometheus metric
      eventsReceived.inc();

      return reply.code(202).send({
        status: "accepted",
        eventId,
        message: "Event accepted for processing"
      });
    }
  );
}

module.exports = eventRoutes;