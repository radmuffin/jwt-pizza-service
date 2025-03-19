const config = require("./config");
const os = require("os");

const requests = {};
const activeUsers = {};
const authAttempts = {};
let latencies = [];
const pizzas = {};
let revenue = 0.0;
let pizzaLatencies = [];

// pizza trackers
function pizzaCountMetric(success, count = 1) {
  const key = success ? "success" : "failure";
  pizzas[key] = (pizzas[key] || 0) + count;
}

// revenue tracker
function revenueMetric(amount) {
  revenue += amount;
}

function getCpuUsagePercentage() {
  const cpuUsage = os.loadavg()[0] / os.cpus().length;
  return cpuUsage.toFixed(2) * 100;
}

function getMemoryUsagePercentage() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const memoryUsage = (usedMemory / totalMemory) * 100;
  return memoryUsage.toFixed(2);
}

// This function updates the active user list with a timestamp for inactivity
function updateUser(user) {
  activeUsers[user] = Date.now() + 5 * 60 * 1000; // 5 minutes of inactivity
}

// remove when logged out
function removeUser(user) {
  delete activeUsers[user];
}

// This function cleans up inactive users from the active user list
function cleanupInactiveUsers() {
  const now = Date.now();
  Object.keys(activeUsers).forEach((username) => {
    if (activeUsers[username] < now) {
      delete activeUsers[username];
    }
  });
}

// tracks the number of authentication attempts
function authMetric(success) {
  const key = success ? "success" : "failure";
  authAttempts[key] = (authAttempts[key] || 0) + 1;
}

// This middleware tracks the number of requests per HTTP method
async function requestTracker(req, res, next) {
  const method = req.method;
  requests[method] = (requests[method] || 0) + 1;
  next();
}

// service latency middleware
async function serviceLatency(req, res, next) {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    latencies.push(duration);
  });
  next();
}

// pizza latency function
function pizzaLatencyMetric(latency) {
  pizzaLatencies.push(latency);
}

// This will periodically send metrics to Grafana
setInterval(() => {
  // http requests
  Object.keys(requests).forEach((endpoint) => {
    sendMetricToGrafana("requests", requests[endpoint], { endpoint });
  });

  // active users
  cleanupInactiveUsers();
  sendMetricToGrafana("active_users", Object.keys(activeUsers).length, {});

  // authentication attempts
  Object.keys(authAttempts).forEach((status) => {
    sendMetricToGrafana("auth_attempts", authAttempts[status], { status });
  });

  // CPU
  const cpuUsage = getCpuUsagePercentage();
  sendPercentageMetric("cpu_usage", cpuUsage);

  // Memory
  const memoryUsage = getMemoryUsagePercentage();
  sendPercentageMetric("memory_usage", memoryUsage);

  // Latency
  if (latencies.length > 0) {
    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    sendMetricToGrafana("service_latency", avgLatency, {});
    latencies = [];
  }

  // Pizzas
  Object.keys(pizzas).forEach((status) => {
    sendMetricToGrafana("pizza_count", pizzas[status], { status });
  });

  // Revenue
  sendMetricToGrafana("revenue", revenue, {});

  // Pizza Latency
  if (pizzaLatencies.length > 0) {
    const avgPizzaLatency =
      pizzaLatencies.reduce((a, b) => a + b, 0) / pizzaLatencies.length;
    sendMetricToGrafana("pizza_latency", avgPizzaLatency, {});
    pizzaLatencies = [];
  }
}, 10000);

function sendMetric(metric, metricName) {
  fetch(`${config.metrics.url}`, {
    method: "POST",
    body: JSON.stringify(metric),
    headers: {
      Authorization: `Bearer ${config.metrics.apiKey}`,
      "Content-Type": "application/json",
    },
  })
    .then((response) => {
      if (!response.ok) {
        console.error("Failed to push metrics data to Grafana");
      } else {
        console.log(`Pushed ${metricName}`);
      }
    })
    .catch((error) => {
      console.error("Error pushing metrics:", error);
    });
}

function sendPercentageMetric(metricName, metricValue) {
  const metric = {
    resourceMetrics: [
      {
        scopeMetrics: [
          {
            metrics: [
              {
                name: metricName,
                unit: "%",
                gauge: {
                  dataPoints: [
                    {
                      asDouble: metricValue,
                      timeUnixNano: Date.now() * 1000000,
                      attributes: [
                        {
                          key: "source",
                          value: { stringValue: config.metrics.source },
                        },
                      ],
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    ],
  };

  sendMetric(metric, metricName);
}

function sendMetricToGrafana(metricName, metricValue, attributes) {
  attributes = { ...attributes, source: config.metrics.source };

  const metric = {
    resourceMetrics: [
      {
        scopeMetrics: [
          {
            metrics: [
              {
                name: metricName,
                unit: "1",
                sum: {
                  dataPoints: [
                    {
                      asDouble: metricValue,
                      timeUnixNano: Date.now() * 1000000,
                      attributes: [],
                    },
                  ],
                  aggregationTemporality: "AGGREGATION_TEMPORALITY_CUMULATIVE",
                  isMonotonic: true,
                },
              },
            ],
          },
        ],
      },
    ],
  };

  Object.keys(attributes).forEach((key) => {
    metric.resourceMetrics[0].scopeMetrics[0].metrics[0].sum.dataPoints[0].attributes.push(
      {
        key: key,
        value: { stringValue: attributes[key] },
      },
    );
  });

  sendMetric(metric, metricName);
}

module.exports = {
  requestTracker,
  updateUser,
  removeUser,
  authMetric,
  serviceLatency,
  pizzaCountMetric,
  revenueMetric,
  pizzaLatencyMetric,
};
