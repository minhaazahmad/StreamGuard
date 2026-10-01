const client = require("@prometheus-io/client");

const register = new client.Registry();

client.collectDefaultMetrics({
  register
});

const eventsReceived = new client.Counter({
  name: "streamguard_events_received_total",
  help: "Total number of events received by the API"
});

const eventsProcessed = new client.Counter({
  name: "streamguard_events_processed_total",
  help: "Total number of events successfully processed"
});

const eventsFailed = new client.Counter({
  name: "streamguard_events_failed_total",
  help: "Total number of events that failed processing"
});

register.registerMetric(eventsReceived);
register.registerMetric(eventsProcessed);
register.registerMetric(eventsFailed);

module.exports = {
  register,
  eventsReceived,
  eventsProcessed,
  eventsFailed
};