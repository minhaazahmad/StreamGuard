require("dotenv").config();

const { Worker } = require("bullmq");
const http = require("http");

const redis = require("../config/redis");
const { saveEvents } = require("../database/repositories/event.repository");
const deadLetterQueue = require("../queues/dead-letter.queue");

const {
  register,
  eventsProcessed,
  eventsFailed,
  dlqSize
} = require("../metrics/worker-metrics");


// ==========================================
// Configuration
// ==========================================

const BATCH_SIZE = 100;
const BATCH_FLUSH_DELAY = 25;


// ==========================================
// Worker Metrics Server
// ==========================================

const metricsServer = http.createServer(async (request, response) => {
  if (request.url === "/metrics") {
    try {
      response.statusCode = 200;

      response.setHeader(
        "Content-Type",
        register.contentType
      );

      const metrics = await register.metrics();

      response.end(metrics);
    } catch (error) {
      console.error("Metrics error:", error);

      response.statusCode = 500;
      response.end("Failed to generate metrics");
    }

    return;
  }

  response.statusCode = 404;
  response.end("Not Found");
});

metricsServer.listen(3001, "0.0.0.0", () => {
  console.log(
    "Worker metrics running on http://localhost:3001/metrics"
  );
});


// ==========================================
// Dead Letter Queue Metric
// ==========================================

const updateDlqMetric = async () => {
  try {
    const count = await deadLetterQueue.getWaitingCount();

    dlqSize.set(count);
  } catch (error) {
    console.error(
      "Failed to update DLQ metric:",
      error.message
    );
  }
};


// Initial DLQ metric update
updateDlqMetric();


// Update every 5 seconds
const dlqMetricInterval = setInterval(
  updateDlqMetric,
  5000
);


// ==========================================
// Worker Throughput Tracking
// ==========================================

let workerProcessedCount = 0;
let workerStartTime = Date.now();


// ==========================================
// Batch Processing
// ==========================================

const eventBuffer = [];

let batchFlushInProgress = false;
let batchTimer = null;


const flushBatch = async () => {
  if (
    batchFlushInProgress ||
    eventBuffer.length === 0
  ) {
    return;
  }

  batchFlushInProgress = true;

  if (batchTimer) {
    clearTimeout(batchTimer);
    batchTimer = null;
  }

  const batch = eventBuffer.splice(
    0,
    BATCH_SIZE
  );

  try {

    // ------------------------------------------
    // Extract Events
    // ------------------------------------------

    const events = batch.map(
      (item) => item.event
    );


    // ------------------------------------------
    // Batch Insert
    // ------------------------------------------

    await saveEvents(events);


    // ------------------------------------------
    // Resolve Jobs
    // ------------------------------------------

    for (const item of batch) {

      eventsProcessed.inc();

      workerProcessedCount++;

      item.resolve();
    }


    // ------------------------------------------
    // Throughput
    // ------------------------------------------

    const elapsedSeconds =
      (Date.now() - workerStartTime) / 1000;

    const throughput =
      workerProcessedCount / elapsedSeconds;


    console.log(
      `Batch processed: ${batch.length} events | ` +
      `Total: ${workerProcessedCount} | ` +
      `Worker throughput: ${throughput.toFixed(2)} events/sec`
    );


  } catch (error) {

    // ------------------------------------------
    // Reject All Jobs in Failed Batch
    // ------------------------------------------

    for (const item of batch) {
      item.reject(error);
    }

    console.error(
      "Batch processing failed:",
      error.message
    );

  } finally {

    batchFlushInProgress = false;


    // ------------------------------------------
    // Process Remaining Events
    // ------------------------------------------

    if (eventBuffer.length >= BATCH_SIZE) {

      flushBatch().catch((error) => {
        console.error(
          "Next batch flush failed:",
          error.message
        );
      });

    } else if (eventBuffer.length > 0) {

      scheduleBatchFlush();
    }
  }
};


// ==========================================
// Flush All Remaining Batches
// ==========================================

const flushAllBatches = async () => {

  if (batchTimer) {
    clearTimeout(batchTimer);
    batchTimer = null;
  }

  while (
    eventBuffer.length > 0 ||
    batchFlushInProgress
  ) {

    if (!batchFlushInProgress && eventBuffer.length > 0) {
      await flushBatch();
    }

    if (batchFlushInProgress) {
      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });
    }
  }
};


// ==========================================
// Schedule Batch Flush
// ==========================================

function scheduleBatchFlush() {

  if (
    batchTimer ||
    batchFlushInProgress
  ) {
    return;
  }

  batchTimer = setTimeout(() => {

    batchTimer = null;

    flushBatch().catch((error) => {
      console.error(
        "Scheduled batch flush failed:",
        error.message
      );
    });

  }, BATCH_FLUSH_DELAY);
}


// ==========================================
// Add Event to Batch
// ==========================================

function enqueueEvent(event) {

  return new Promise((resolve, reject) => {

    eventBuffer.push({
      event,
      resolve,
      reject
    });


    // ------------------------------------------
    // Full Batch
    // ------------------------------------------

    if (eventBuffer.length >= BATCH_SIZE) {

      flushBatch().catch((error) => {
        console.error(
          "Batch flush failed:",
          error.message
        );
      });

      return;
    }


    // ------------------------------------------
    // Partial Batch
    // ------------------------------------------

    scheduleBatchFlush();
  });
}


// ==========================================
// Event Worker
// ==========================================

const eventWorker = new Worker(
  "event-processing",

  async (job) => {

    const event = job.data;


    // ------------------------------------------
    // Test Failure
    // ------------------------------------------

    if (
      event.payload?.forceFail === true
    ) {

      throw new Error(
        "Intentional failure for DLQ test"
      );
    }


    // ------------------------------------------
    // Add Event to Batch
    // ------------------------------------------

    await enqueueEvent(event);
  },

  {
    connection: redis,
    concurrency: 100
  }
);


console.log(
  "StreamGuard event worker started"
);


// ==========================================
// Job Failed
// ==========================================

eventWorker.on(
  "failed",
  async (job, error) => {

    // ------------------------------------------
    // Failed Metric
    // ------------------------------------------

    eventsFailed.inc();


    console.error(
      `Job failed: ${job?.id}, attempt ${job?.attemptsMade}`,
      error.message
    );


    // ------------------------------------------
    // Move to Dead Letter Queue
    // after final retry
    // ------------------------------------------

    if (
      job &&
      job.attemptsMade >= job.opts.attempts
    ) {

      try {

        await deadLetterQueue.add(
          "failed-event",
          {
            originalJobId: job.id,

            event: job.data,

            error: error.message,

            attempts: job.attemptsMade,

            failedAt:
              new Date().toISOString()
          }
        );


        console.log(
          `Event moved to Dead Letter Queue: ${job.id}`
        );


        await updateDlqMetric();

      } catch (dlqError) {

        console.error(
          "Failed to add event to Dead Letter Queue:",
          dlqError
        );
      }
    }
  }
);


// ==========================================
// Graceful Shutdown
// ==========================================

let shuttingDown = false;


const shutdown = async (signal) => {

  if (shuttingDown) {
    return;
  }

  shuttingDown = true;


  console.log(
    `\n${signal} received. Shutting down StreamGuard worker...`
  );


  try {

    // ----------------------------------------
    // Stop accepting new jobs
    // ----------------------------------------

    await eventWorker.pause();


    // ----------------------------------------
    // Wait for currently running jobs
    // ----------------------------------------

    await eventWorker.close();


    // ----------------------------------------
    // Flush all remaining events
    // ----------------------------------------

    await flushAllBatches();


    // ----------------------------------------
    // Stop DLQ metric interval
    // ----------------------------------------

    clearInterval(dlqMetricInterval);


    // ----------------------------------------
    // Close Metrics Server
    // ----------------------------------------

    await new Promise((resolve, reject) => {

      metricsServer.close((error) => {

        if (error) {
          reject(error);
        } else {
          resolve();
        }

      });

    });


    // ----------------------------------------
    // Close Redis
    // ----------------------------------------

    await redis.quit();


    console.log(
      "Worker stopped gracefully."
    );


    process.exit(0);

  } catch (error) {

    console.error(
      "Error during worker shutdown:",
      error
    );


    process.exit(1);
  }
};


// ==========================================
// Shutdown Signals
// ==========================================

process.on(
  "SIGINT",
  () => shutdown("SIGINT")
);

process.on(
  "SIGTERM",
  () => shutdown("SIGTERM")
);