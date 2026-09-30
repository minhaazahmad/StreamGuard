const { Queue } = require("bullmq");
const redis = require("../config/redis");

const eventQueue = new Queue("event-processing", {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,

    backoff: {
      type: "exponential",
      delay: 2000
    },

    removeOnComplete: 100,
    removeOnFail: 100
  }
});

module.exports = eventQueue;