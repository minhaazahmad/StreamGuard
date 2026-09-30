const { Queue } = require("bullmq");
const redis = require("../config/redis");

const deadLetterQueue = new Queue("streamguard-dead-letter", {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 100
  }
});

module.exports = deadLetterQueue;