const crypto = require("crypto");
const eventSchema = require("../schemas/event.schema");
const eventQueue = require("../queues/event.queue");

async function eventRoutes(app) {
  app.post(
    "/api/v1/events",
    {
      schema: eventSchema
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

      return reply.code(202).send({
        status: "accepted",
        eventId,
        message: "Event accepted for processing"
      });
    }
  );
}

module.exports = eventRoutes;