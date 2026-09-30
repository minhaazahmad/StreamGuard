const { Worker } = require("bullmq");
const redis = require("../config/redis");
const pool = require("../config/postgres");
const deadLetterQueue = require("../queues/dead-letter.queue");

const eventWorker = new Worker(
  "event-processing",
  async (job) => {
    const event = job.data;

    console.log("Processing event:", event);

    // Test-only failure for retry/DLQ testing
    if (event.payload?.forceFail === true) {
      throw new Error("Intentional failure for DLQ test");
    }

    // Check if event already exists
    const existingEvent = await pool.query(
      "SELECT event_id FROM events WHERE event_id = $1",
      [event.eventId]
    );

    if (existingEvent.rows.length > 0) {
      console.log(`Event already exists: ${event.eventId}`);
      return;
    }

    // Save event to PostgreSQL
    await pool.query(
      `INSERT INTO events
        (event_id, event_type, source, payload, status, received_at, processed_at)
       VALUES
        ($1, $2, $3, $4, $5, $6, $7)`,
      [
        event.eventId,
        event.eventType,
        event.source,
        JSON.stringify(event.payload),
        "processed",
        event.receivedAt,
        new Date()
      ]
    );

    console.log(`Event saved to PostgreSQL: ${event.eventId}`);
  },
  {
    connection: redis
  }
);

console.log("StreamGuard event worker started");

eventWorker.on("completed", (job) => {
  console.log(`Job completed: ${job.id}`);
});

eventWorker.on("failed", async (job, error) => {
  console.error(
    `Job failed: ${job?.id}, attempt ${job?.attemptsMade}`,
    error.message
  );

  // Move to DLQ only after final retry
  if (job && job.attemptsMade >= job.opts.attempts) {
    try {
      await deadLetterQueue.add("failed-event", {
        originalJobId: job.id,
        event: job.data,
        error: error.message,
        attempts: job.attemptsMade,
        failedAt: new Date().toISOString()
      });

      console.log(`Event moved to Dead Letter Queue: ${job.id}`);
    } catch (dlqError) {
      console.error(
        "Failed to add event to Dead Letter Queue:",
        dlqError
      );
    }
  }
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\nShutting down StreamGuard worker...");

  try {
    await eventWorker.close();
    await pool.end();
    await redis.quit();

    console.log("Worker stopped gracefully.");
    process.exit(0);
  } catch (error) {
    console.error("Error during worker shutdown:", error);
    process.exit(1);
  }
});