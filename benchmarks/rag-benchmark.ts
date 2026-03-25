/**
 * RAG Quality Benchmark
 *
 * Tests knowledge base search quality with 20 queries.
 * Measures Mean Reciprocal Rank (MRR) — target > 0.7.
 *
 * Usage:
 *   npx tsx benchmarks/rag-benchmark.ts --agentId=<id> --baseUrl=http://localhost:3000
 */

interface BenchmarkQuery {
  query: string;
  expectedKeywords: string[];
}

const BENCHMARK_QUERIES: BenchmarkQuery[] = [
  { query: "How to handle errors in TypeScript", expectedKeywords: ["error", "try", "catch", "throw"] },
  { query: "REST API design patterns", expectedKeywords: ["api", "rest", "endpoint", "resource"] },
  { query: "Database indexing strategies", expectedKeywords: ["index", "database", "query", "performance"] },
  { query: "React component best practices", expectedKeywords: ["react", "component", "hook", "state"] },
  { query: "Authentication with OAuth", expectedKeywords: ["oauth", "auth", "token", "login"] },
  { query: "Unit testing strategies", expectedKeywords: ["test", "unit", "mock", "assert"] },
  { query: "Docker containerization", expectedKeywords: ["docker", "container", "image", "build"] },
  { query: "SQL query optimization", expectedKeywords: ["sql", "query", "optimize", "index"] },
  { query: "Git branching strategy", expectedKeywords: ["git", "branch", "merge", "commit"] },
  { query: "CI/CD pipeline configuration", expectedKeywords: ["ci", "cd", "pipeline", "deploy"] },
  { query: "Python type hints", expectedKeywords: ["python", "type", "hint", "annotation"] },
  { query: "Security vulnerability scanning", expectedKeywords: ["security", "vulnerability", "scan", "owasp"] },
  { query: "Caching strategies for web apps", expectedKeywords: ["cache", "redis", "ttl", "memory"] },
  { query: "Microservice communication", expectedKeywords: ["microservice", "api", "message", "queue"] },
  { query: "Tailwind CSS responsive design", expectedKeywords: ["tailwind", "responsive", "css", "breakpoint"] },
  { query: "Go concurrency patterns", expectedKeywords: ["go", "goroutine", "channel", "concurrent"] },
  { query: "Prisma schema design", expectedKeywords: ["prisma", "schema", "model", "relation"] },
  { query: "WebSocket real-time communication", expectedKeywords: ["websocket", "real-time", "connection", "event"] },
  { query: "Kubernetes pod management", expectedKeywords: ["kubernetes", "pod", "container", "deploy"] },
  { query: "Rate limiting implementation", expectedKeywords: ["rate", "limit", "throttle", "request"] },
];

interface SearchResult {
  content: string;
  score: number;
}

interface BenchmarkResult {
  query: string;
  reciprocalRank: number;
  topResultRelevant: boolean;
  latencyMs: number;
}

function isRelevant(content: string, keywords: string[]): boolean {
  const lower = content.toLowerCase();
  const matchCount = keywords.filter((kw) => lower.includes(kw.toLowerCase())).length;
  return matchCount >= Math.ceil(keywords.length * 0.5);
}

async function runBenchmark(agentId: string, baseUrl: string): Promise<void> {
  const results: BenchmarkResult[] = [];
  let totalMRR = 0;

  console.log(`\nRAG Benchmark — ${BENCHMARK_QUERIES.length} queries`);
  console.log(`Agent: ${agentId}`);
  console.log(`URL: ${baseUrl}`);
  console.log("─".repeat(60));

  for (const bq of BENCHMARK_QUERIES) {
    const start = Date.now();

    try {
      const res = await fetch(`${baseUrl}/api/agents/${agentId}/knowledge/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: bq.query, topK: 5 }),
      });

      const latencyMs = Date.now() - start;

      if (!res.ok) {
        results.push({ query: bq.query, reciprocalRank: 0, topResultRelevant: false, latencyMs });
        continue;
      }

      const json = await res.json();
      const searchResults: SearchResult[] = json.data?.results ?? [];

      let reciprocalRank = 0;
      let topResultRelevant = false;

      for (let i = 0; i < searchResults.length; i++) {
        if (isRelevant(searchResults[i].content, bq.expectedKeywords)) {
          reciprocalRank = 1 / (i + 1);
          if (i === 0) topResultRelevant = true;
          break;
        }
      }

      totalMRR += reciprocalRank;
      results.push({ query: bq.query, reciprocalRank, topResultRelevant, latencyMs });

      const status = reciprocalRank > 0 ? "HIT" : "MISS";
      console.log(`  [${status}] RR=${reciprocalRank.toFixed(2)} ${latencyMs}ms — ${bq.query}`);
    } catch (err) {
      const latencyMs = Date.now() - start;
      results.push({ query: bq.query, reciprocalRank: 0, topResultRelevant: false, latencyMs });
      console.log(`  [ERR] ${latencyMs}ms — ${bq.query}: ${err}`);
    }
  }

  const mrr = totalMRR / BENCHMARK_QUERIES.length;
  const avgLatency = results.reduce((sum, r) => sum + r.latencyMs, 0) / results.length;
  const p99Latency = results.map((r) => r.latencyMs).sort((a, b) => a - b)[Math.floor(results.length * 0.99)];
  const topHitRate = results.filter((r) => r.topResultRelevant).length / results.length;

  console.log("\n" + "─".repeat(60));
  console.log(`MRR:          ${mrr.toFixed(3)} (target > 0.700)`);
  console.log(`Top-1 Hit:    ${(topHitRate * 100).toFixed(1)}%`);
  console.log(`Avg Latency:  ${avgLatency.toFixed(0)}ms`);
  console.log(`P99 Latency:  ${p99Latency}ms (target < 2000ms)`);
  console.log(`Status:       ${mrr >= 0.7 ? "PASS" : "FAIL"}`);
}

const args = process.argv.slice(2);
const agentId = args.find((a) => a.startsWith("--agentId="))?.split("=")[1] ?? "";
const baseUrl = args.find((a) => a.startsWith("--baseUrl="))?.split("=")[1] ?? "http://localhost:3000";

if (!agentId) {
  console.error("Usage: npx tsx benchmarks/rag-benchmark.ts --agentId=<id> [--baseUrl=<url>]");
  process.exit(1);
}

runBenchmark(agentId, baseUrl);
