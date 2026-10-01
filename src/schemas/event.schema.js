const eventSchema = {
  body: {
    type: "object",

    required: [
      "eventType",
      "source",
      "payload"
    ],

    properties: {
      eventType: {
        type: "string",
        minLength: 1,
        maxLength: 100
      },

      source: {
        type: "string",
        minLength: 1,
        maxLength: 100
      },

      payload: {
        type: "object"
      }
    },

    additionalProperties: false
  }
};

module.exports = eventSchema;