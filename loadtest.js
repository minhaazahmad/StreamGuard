const autocannon = require("autocannon");

const options = {
  url: "http://localhost:3000/api/v1/events",
  connections: 10,
  duration: 10,
  method: "POST",

  headers: {
    "content-type": "application/json"
  },

  body: JSON.stringify({
    eventType: "load_test",
    source: "simulator",
    payload: {
      message: "benchmark"
    }
  })
};

autocannon(options, (error, result) => {
  if (error) {
    console.error(error);
    process.exit(1);
  }

  console.log(autocannon.printResult(result));

  console.log("\nHTTP Status Codes:");

  if (result.statusCodeStats) {
    console.table(result.statusCodeStats);
  } else {
    console.log("Status code statistics not available.");
  }
});