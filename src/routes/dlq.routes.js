const { Queue } = require("bullmq");
const redis = require("../config/redis");

const deadLetterQueue = new Queue("streamguard-dead-letter", {
  connection: redis
});

const eventQueue = new Queue("event-processing", {
  connection: redis
});

async function dlqRoutes(app) {

  // ==========================================
  // View Dead Letter Queue
  // ==========================================

  app.get(
    "/api/v1/dlq",
    {
      schema: {
        tags: ["Dead Letter Queue"],

        summary: "View failed events",

        description:
          "Returns events that failed processing after all configured retry attempts and were moved to the Dead Letter Queue.",

        response: {
          200: {
            description:
              "Dead Letter Queue retrieved successfully",

            type: "object",

            properties: {
              count: {
                type: "integer",
                description:
                  "Number of events currently waiting in the Dead Letter Queue"
              },

              jobs: {
                type: "array",

                description:
                  "List of failed events stored in the Dead Letter Queue",

                items: {
                  type: "object",

                  properties: {
                    id: {
                      type: "string",
                      description:
                        "BullMQ job ID assigned to the DLQ job"
                    },

                    name: {
                      type: "string",
                      description:
                        "BullMQ job name"
                    },

                    data: {
                      type: "object",
                      description:
                        "Original event data and failure information"
                    },

                    attemptsMade: {
                      type: "integer",
                      description:
                        "Number of processing attempts recorded for the DLQ job"
                    },

                    failedReason: {
                      type: ["string", "null"],
                      description:
                        "Failure reason reported by the queue, if available"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },

    async (request, reply) => {
      const jobs = await deadLetterQueue.getWaiting();

      return reply.send({
        count: jobs.length,

        jobs: jobs.map((job) => ({
          id: job.id,
          name: job.name,
          data: job.data,
          attemptsMade: job.attemptsMade,
          failedReason: job.failedReason || null
        }))
      });
    }
  );


  // ==========================================
  // Retry DLQ Job
  // ==========================================

  app.post(
    "/api/v1/dlq/:jobId/retry",
    {
      schema: {
        tags: ["Dead Letter Queue"],

        summary: "Retry a failed event",

        description:
          "Moves a failed event from the Dead Letter Queue back into the main event processing queue for another processing attempt.",

        params: {
          type: "object",

          required: ["jobId"],

          properties: {
            jobId: {
              type: "string",
              description:
                "BullMQ job ID of the failed event stored in the DLQ"
            }
          }
        },

        response: {
          200: {
            description:
              "Event successfully moved back to the processing queue",

            type: "object",

            properties: {
              status: {
                type: "string",
                description:
                  "Current status of the retry operation"
              },

              eventId: {
                type: "string",
                description:
                  "Unique identifier of the event being retried"
              },

              message: {
                type: "string",
                description:
                  "Human-readable result of the retry operation"
              }
            }
          },

          404: {
            description:
              "The requested DLQ job does not exist",

            type: "object",

            properties: {
              status: {
                type: "string",
                description:
                  "Error status"
              },

              message: {
                type: "string",
                description:
                  "Description of the error"
              }
            }
          }
        }
      }
    },

    async (request, reply) => {
      const { jobId } = request.params;

      const job = await deadLetterQueue.getJob(jobId);

      if (!job) {
        return reply.code(404).send({
          status: "error",
          message: "DLQ job not found"
        });
      }

      const event = job.data.event;

      await eventQueue.add(
        "process-event",
        event,
        {
          jobId: event.eventId,

          attempts: 3,

          backoff: {
            type: "exponential",
            delay: 2000
          }
        }
      );

      await job.remove();

      return reply.send({
        status: "retrying",
        eventId: event.eventId,
        message: "Event moved back to processing queue"
      });
    }
  );
}

module.exports = dlqRoutes;