const pool = require("../../config/postgres");


// ==========================================
// Save Single Event
// ==========================================

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


// ==========================================
// Save Multiple Events in One Batch
// ==========================================

async function saveEvents(events) {
  if (!events.length) {
    return [];
  }

  const values = [];
  const placeholders = [];

  events.forEach((event, index) => {
    const offset = index * 5;

    placeholders.push(
      `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, NOW(), 'processed')`
    );

    values.push(
      event.eventId,
      event.eventType,
      event.source,
      JSON.stringify(event.payload),
      event.receivedAt
    );
  });

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
    VALUES ${placeholders.join(", ")}
    ON CONFLICT (event_id) DO NOTHING
    RETURNING id, event_id, status
  `;

  const result = await pool.query(query, values);

  return result.rows;
}


// ==========================================
// Exports
// ==========================================

module.exports = {
  saveEvent,
  saveEvents
};