const apiKeyAuth = async (request, reply) => {
  const providedKey = request.headers["x-api-key"];

  if (!providedKey) {
    return reply.code(401).send({
      status: "error",
      code: "MISSING_API_KEY",
      message: "API key is required"
    });
  }

  if (providedKey !== process.env.API_KEY) {
    return reply.code(401).send({
      status: "error",
      code: "INVALID_API_KEY",
      message: "Invalid API key"
    });
  }
};

module.exports = apiKeyAuth;