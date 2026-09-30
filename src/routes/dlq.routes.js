const { Queue } = require("bullmq");
const redis = require("../config/redis");

const deadLetterQueue = new Queue("streamguard-dead-letter", {
  connection: redis
});

const eventQueue = new Queue("event-processing", {
  connection: redis
});

async function dlqRoutes(app) {
  // View DLQ jobs
  app.get("/api/v1/dlq", async (request, reply) => {
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
  });

  // Retry a failed DLQ job
  app.post("/api/v1/dlq/:jobId/retry", async (request, reply) => {
    const { jobId } = request.params;

    const job = await deadLetterQueue.getJob(jobId);

    if (!job) {
      return reply.code(404).send({
        status: "error",
        message: "DLQ job not found"
      });
    }

    const event = job.data.event;

    await eventQueue.add("process-event", event, {
      jobId: event.eventId,
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 2000
      }
    });

    await job.remove();

    return reply.send({
      status: "retrying",
      eventId: event.eventId,
      message: "Event moved back to processing queue"
    });
  });
}

module.exports = dlqRoutes;