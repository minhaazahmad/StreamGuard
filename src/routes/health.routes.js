const pool = require("../config/postgres");
const redis = require("../config/redis");
const { Queue } = require("bullmq");

const deadLetterQueue = new Queue("streamguard-dead-letter", {
  connection: redis
});

async function healthRoutes(app) {
  app.get(
    "/api/v1/health",
    {
      schema: {
        tags: ["Health"],

        summary: "Check system health",

        description:
          "Checks the availability of PostgreSQL, Redis, and the Dead Letter Queue.",

        response: {
          200: {
            description: "All required services are healthy",

            type: "object",

            properties: {
              status: {
                type: "string"
              },

              timestamp: {
                type: "string"
              },

              services: {
                type: "object",

                properties: {
                  postgres: {
                    type: "string"
                  },

                  redis: {
                    type: "string"
                  }
                }
              },

              queues: {
                type: "object",

                properties: {
                  deadLetter: {
                    type: "integer"
                  }
                }
              }
            }
          },

          503: {
            description: "One or more required services are unavailable",

            type: "object",

            properties: {
              status: {
                type: "string"
              },

              timestamp: {
                type: "string"
              },

              services: {
                type: "object",

                properties: {
                  postgres: {
                    type: "string"
                  },

                  redis: {
                    type: "string"
                  }
                }
              },

              queues: {
                type: "object",

                properties: {
                  deadLetter: {
                    type: "integer"
                  }
                }
              }
            }
          }
        }
      }
    },

    async (request, reply) => {
      let postgresStatus = "down";
      let redisStatus = "down";
      let deadLetterCount = 0;

      try {
        await pool.query("SELECT 1");
        postgresStatus = "up";
      } catch (error) {
        postgresStatus = "down";
      }

      try {
        await redis.ping();
        redisStatus = "up";
      } catch (error) {
        redisStatus = "down";
      }

      try {
        deadLetterCount =
          await deadLetterQueue.getWaitingCount();
      } catch (error) {
        deadLetterCount = -1;
      }

      const healthy =
        postgresStatus === "up" &&
        redisStatus === "up";

      return reply
        .code(healthy ? 200 : 503)
        .send({
          status: healthy ? "healthy" : "unhealthy",

          timestamp: new Date().toISOString(),

          services: {
            postgres: postgresStatus,
            redis: redisStatus
          },

          queues: {
            deadLetter: deadLetterCount
          }
        });
    }
  );
}

module.exports = healthRoutes;