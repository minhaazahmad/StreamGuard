const pool = require("../../config/postgres");

async function saveEvent(event) {
  const query = `
    INSERT INTO events (
      event_id,
      event_type,
      source,
      payload,
      received_at,
      processed_at,
      status
    )
    VALUES ($1, $2, $3, $4, $5, NOW(), $6)
    ON CONFLICT (event_id) DO NOTHING
    RETURNING id, event_id, status
  `;

  const values = [
    event.eventId,
    event.eventType,
    event.source,
    JSON.stringify(event.payload),
    event.receivedAt,
    "processed"
  ];

  const result = await pool.query(query, values);

  return result.rows[0] || null;
}

module.exports = {
  saveEvent
};