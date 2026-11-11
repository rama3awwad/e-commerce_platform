const fs = require('fs');
const path = require('path');

const endpointMetrics = [
  ['GET /products', 'products'],
  ['GET /products/:id', 'product_detail'],
  ['GET /orders', 'orders'],
  ['POST /orders', 'create_order'],
];

function median(values) {
  const sorted = values.slice().sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function readSummary(file) {
  const summary = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!summary.metrics) throw new Error(`${file} is not a k6 summary export (missing metrics)`);
  return summary;
}

function metricValues(metric) {
  return metric.values || metric;
}

function aggregate(files, output) {
  if (files.length !== 3) throw new Error('Provide exactly three k6 run summaries for median aggregation');
  const runs = files.map(readSummary);
  const metricNames = Object.keys(runs[0].metrics);
  for (const run of runs.slice(1)) {
    if (JSON.stringify(Object.keys(run.metrics).sort()) !== JSON.stringify(metricNames.slice().sort())) {
      throw new Error('The three k6 summaries have different metric sets');
    }
  }

  const result = JSON.parse(JSON.stringify(runs[0]));
  const spread = {};
  for (const name of metricNames) {
    spread[name] = {};
    const targetValues = metricValues(result.metrics[name]);
    delete targetValues.thresholds;
    for (const field of Object.keys(targetValues)) {
      const values = runs.map((run) => metricValues(run.metrics[name])[field]);
      if (values.every((value) => typeof value === 'number' && Number.isFinite(value))) {
        targetValues[field] = median(values);
        const sorted = values.slice().sort((left, right) => left - right);
        spread[name][field] = {
          min: sorted[0],
          max: sorted[sorted.length - 1],
          range: sorted[sorted.length - 1] - sorted[0],
        };
      }
    }
  }
  result.metadata = {
    aggregation: 'median of three independent k6 runs',
    runs: files.map((file) => path.basename(file)),
    spread,
  };
  fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`Median k6 summary written to ${output}`);
}

function findMetric(summary, prefix, suffix) {
  const candidates = Object.entries(summary.metrics)
    .filter(([name]) => name === `${prefix}_${suffix}` || name.startsWith(`${prefix}_${suffix}{`));
  if (!candidates.length) return undefined;
  return metricValues(candidates[0][1]);
}

function fmt(value, digits = 2) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : 'n/a';
}

function metricRate(metric) {
  return metric?.rate ?? metric?.value;
}

function comparison(beforeFile, afterFile, output) {
  const before = readSummary(beforeFile);
  const after = readSummary(afterFile);
  const lines = [
    `| Endpoint | p50 before (ms) | p50 after (ms) | p95 before (ms) | p95 after (ms) | p99 before (ms) | p99 after (ms) | req/s before | req/s after | errors before | errors after | bytes before | bytes after |`,
    `|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|`,
  ];

  for (const [endpoint, prefix] of endpointMetrics) {
    const beforeDuration = findMetric(before, prefix, 'duration');
    const afterDuration = findMetric(after, prefix, 'duration');
    const beforeRequests = findMetric(before, prefix, 'requests');
    const afterRequests = findMetric(after, prefix, 'requests');
    const beforeFailed = findMetric(before, prefix, 'failed');
    const afterFailed = findMetric(after, prefix, 'failed');
    const beforeBytes = findMetric(before, prefix, 'bytes_received');
    const afterBytes = findMetric(after, prefix, 'bytes_received');
    lines.push(`| ${endpoint} | ${fmt(beforeDuration?.med)} | ${fmt(afterDuration?.med)} | ${fmt(beforeDuration?.['p(95)'])} | ${fmt(afterDuration?.['p(95)'])} | ${fmt(beforeDuration?.['p(99)'])} | ${fmt(afterDuration?.['p(99)'])} | ${fmt(beforeRequests?.rate, 3)} | ${fmt(afterRequests?.rate, 3)} | ${fmt(metricRate(beforeFailed), 4)} | ${fmt(metricRate(afterFailed), 4)} | ${fmt(beforeBytes?.count, 0)} | ${fmt(afterBytes?.count, 0)} |`);
  }

  const markdown = `${lines.join('\n')}\n`;
  if (output) fs.writeFileSync(output, markdown);
  console.log(markdown);
}

const args = process.argv.slice(2);
if (args[0] === '--aggregate') {
  const outputIndex = args.indexOf('--output');
  if (outputIndex < 0 || outputIndex !== args.length - 2) {
    throw new Error('Usage: node scripts/compare-results.js --aggregate run1.json run2.json run3.json --output results/baseline.json');
  }
  aggregate(args.slice(1, outputIndex), args[outputIndex + 1]);
} else {
  if (args.length < 2 || args.length > 3) {
    throw new Error('Usage: node scripts/compare-results.js before.json after.json [output.md]');
  }
  comparison(args[0], args[1], args[2]);
}
