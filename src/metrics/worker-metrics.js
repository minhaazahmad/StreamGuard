const client = require("@prometheus-io/client");

const register = new client.Registry();

client.collectDefaultMetrics({
  register
});

// Total events successfully processed
const eventsProcessed = new client.Counter({
  name: "streamguard_worker_events_processed_total",
  help: "Total number of events successfully processed by the worker"
});

// Total events that failed
const eventsFailed = new client.Counter({
  name: "streamguard_worker_events_failed_total",
  help: "Total number of events that failed in the worker"
});

// Current number of events in Dead Letter Queue
const dlqSize = new client.Gauge({
  name: "streamguard_dead_letter_queue_size",
  help: "Current number of events in the Dead Letter Queue"
});

// Register metrics
register.registerMetric(eventsProcessed);
register.registerMetric(eventsFailed);
register.registerMetric(dlqSize);

module.exports = {
  register,
  eventsProcessed,
  eventsFailed,
  dlqSize
};