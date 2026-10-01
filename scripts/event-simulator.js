const http = require("http");

const TOTAL_EVENTS = 100;
const DELAY_MS = 100;

function sendEvent(index) {
  const event = {
    eventType: "order.created",
    source: "event-simulator",
    payload: {
      orderId: `ORD-${Date.now()}-${index}`,
      customerId: `CUST-${index}`,
      amount: Math.floor(Math.random() * 5000) + 100,
      message: "Simulated event"
    }
  };

  const data = JSON.stringify(event);

  const options = {
    hostname: "localhost",
    port: 3000,
    path: "/api/v1/events",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(data)
    }
  };

  const request = http.request(options, (response) => {
    let body = "";

    response.on("data", (chunk) => {
      body += chunk;
    });

    response.on("end", () => {
      console.log(
        `Event ${index}/${TOTAL_EVENTS} → ${response.statusCode}`
      );
    });
  });

  request.on("error", (error) => {
    console.error(`Event ${index} failed:`, error.message);
  });

  request.write(data);
  request.end();
}

let current = 1;

const interval = setInterval(() => {
  if (current > TOTAL_EVENTS) {
    clearInterval(interval);
    console.log("\nEvent simulation completed.");
    return;
  }

  sendEvent(current);
  current++;
}, DELAY_MS);