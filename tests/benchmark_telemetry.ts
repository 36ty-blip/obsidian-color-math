// tests/benchmark_telemetry.ts
// Precision metrics instrumentation for CPU, RAM, Latency Percentiles, and Cache Tracking

export interface CpuMetrics {
  userMs: number;
  systemMs: number;
  totalCpuMs: number;
  wallMs: number;
  cpuPercent: number;
}

export class CpuTracker {
  private startUsage?: NodeJS.CpuUsage;
  private startHr?: bigint;

  start(): void {
    this.startUsage = process.cpuUsage();
    this.startHr = process.hrtime.bigint();
  }

  stop(): CpuMetrics {
    if (!this.startUsage || !this.startHr) {
      throw new Error("CpuTracker was not started");
    }
    const endHr = process.hrtime.bigint();
    const diff = process.cpuUsage(this.startUsage);
    const wallNs = Number(endHr - this.startHr);
    const wallMs = wallNs / 1_000_000;
    const userMs = diff.user / 1_000;
    const systemMs = diff.system / 1_000;
    const totalCpuMs = userMs + systemMs;
    const cpuPercent = wallMs > 0 ? (totalCpuMs / wallMs) * 100 : 0;

    return {
      userMs,
      systemMs,
      totalCpuMs,
      wallMs,
      cpuPercent,
    };
  }
}

export interface MemorySnapshot {
  heapUsed: number;
  heapTotal: number;
  rss: number;
  external: number;
  arrayBuffers: number;
}

export interface MemoryMetrics {
  before: MemorySnapshot;
  after: MemorySnapshot;
  deltaHeapUsedBytes: number;
  deltaRssBytes: number;
  heapUsedMB: number;
  rssMB: number;
}

export class MemoryTracker {
  static getSnapshot(): MemorySnapshot {
    const mem = process.memoryUsage();
    return {
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      rss: mem.rss,
      external: mem.external,
      arrayBuffers: (mem as any).arrayBuffers || 0,
    };
  }

  static runGcIfAvailable(): boolean {
    if (typeof (global as any).gc === "function") {
      (global as any).gc();
      return true;
    }
    return false;
  }

  static measure<T>(fn: () => T): { result: T; metrics: MemoryMetrics } {
    this.runGcIfAvailable();
    const before = this.getSnapshot();

    const result = fn();

    const afterRaw = this.getSnapshot();
    this.runGcIfAvailable();
    const after = this.getSnapshot();

    return {
      result,
      metrics: {
        before,
        after: afterRaw,
        deltaHeapUsedBytes: afterRaw.heapUsed - before.heapUsed,
        deltaRssBytes: afterRaw.rss - before.rss,
        heapUsedMB: Number((afterRaw.heapUsed / (1024 * 1024)).toFixed(2)),
        rssMB: Number((afterRaw.rss / (1024 * 1024)).toFixed(2)),
      },
    };
  }
}

export interface LatencyStats {
  samples: number;
  totalTimeMs: number;
  minUs: number;
  meanUs: number;
  medianUs: number; // p50
  p90Us: number;
  p95Us: number;
  p99Us: number;
  maxUs: number;
  stdDevUs: number;
  opsPerSec: number;
}

export class LatencySampler {
  private samplesNs: number[] = [];

  addSampleNs(ns: bigint | number): void {
    this.samplesNs.push(typeof ns === "bigint" ? Number(ns) : ns);
  }

  computeStats(): LatencyStats {
    const count = this.samplesNs.length;
    if (count === 0) {
      return {
        samples: 0,
        totalTimeMs: 0,
        minUs: 0,
        meanUs: 0,
        medianUs: 0,
        p90Us: 0,
        p95Us: 0,
        p99Us: 0,
        maxUs: 0,
        stdDevUs: 0,
        opsPerSec: 0,
      };
    }

    // Sort ascending for percentiles
    const sorted = [...this.samplesNs].sort((a, b) => a - b);
    const totalNs = sorted.reduce((acc, val) => acc + val, 0);
    const totalMs = totalNs / 1_000_000;
    const meanNs = totalNs / count;

    let varianceSum = 0;
    for (const val of sorted) {
      varianceSum += (val - meanNs) ** 2;
    }
    const stdDevNs = Math.sqrt(varianceSum / count);

    const getPercentile = (pct: number): number => {
      const idx = Math.min(count - 1, Math.floor((pct / 100) * count));
      return sorted[idx];
    };

    const minUs = sorted[0] / 1_000;
    const maxUs = sorted[count - 1] / 1_000;
    const meanUs = meanNs / 1_000;
    const medianUs = getPercentile(50) / 1_000;
    const p90Us = getPercentile(90) / 1_000;
    const p95Us = getPercentile(95) / 1_000;
    const p99Us = getPercentile(99) / 1_000;
    const stdDevUs = stdDevNs / 1_000;

    const opsPerSec = totalMs > 0 ? (count / totalMs) * 1_000 : 0;

    return {
      samples: count,
      totalTimeMs: Number(totalMs.toFixed(3)),
      minUs: Number(minUs.toFixed(3)),
      meanUs: Number(meanUs.toFixed(3)),
      medianUs: Number(medianUs.toFixed(3)),
      p90Us: Number(p90Us.toFixed(3)),
      p95Us: Number(p95Us.toFixed(3)),
      p99Us: Number(p99Us.toFixed(3)),
      maxUs: Number(maxUs.toFixed(3)),
      stdDevUs: Number(stdDevUs.toFixed(3)),
      opsPerSec: Math.round(opsPerSec),
    };
  }
}

export class CacheTelemetryTracker<K, V> {
  hits: number = 0;
  misses: number = 0;
  sets: number = 0;
  evictions: number = 0;

  recordHit(): void {
    this.hits++;
  }

  recordMiss(): void {
    this.misses++;
  }

  recordSet(): void {
    this.sets++;
  }

  recordEviction(): void {
    this.evictions++;
  }

  reset(): void {
    this.hits = 0;
    this.misses = 0;
    this.sets = 0;
    this.evictions = 0;
  }

  get hitRatePercent(): number {
    const total = this.hits + this.misses;
    return total > 0 ? (this.hits / total) * 100 : 0;
  }
}
