import os from "node:os";
import { execSync } from "node:child_process";

/**
 * Configure process scheduling priority and P-core processor affinity.
 * Intel Core i5-13420H has 4 P-cores (threads 0-7) and 4 E-cores (threads 8-11).
 * Affinity mask 255 (0xFF) binds execution exclusively to the 8 P-core logical threads.
 */
export function setupPerformanceOptimization(pCoresOnly = true) {
  try {
    os.setPriority(os.constants.priority.PRIORITY_ABOVE_NORMAL);
  } catch {
    // Non-fatal if priority elevation is restricted
  }

  if (pCoresOnly && process.platform === "win32") {
    try {
      execSync(
        `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "(Get-Process -Id ${process.pid}).ProcessorAffinity = 255"`,
        { stdio: "ignore" }
      );
    } catch {
      // Non-fatal if affinity binding is not permitted
    }
  }
}

/**
 * Probe current system CPU utilization using a 3-second average sample.
 * If average CPU <= 36.0%, allocate up to 50% CPU budget (6 worker threads).
 * If average CPU > 36.0%, scale down to 2 threads to maintain system responsiveness.
 */
export function getOptimalThreadCount(quickMode = false, requestedThreads = undefined) {
  if (requestedThreads !== undefined && Number.isInteger(requestedThreads)) {
    const clamped = Math.max(2, Math.min(6, requestedThreads));
    return { count: clamped, avgCpu: null, source: "manual-override" };
  }

  if (quickMode) {
    return { count: 6, avgCpu: null, source: "quick-mode-max-50pct" };
  }

  if (process.platform === "win32") {
    try {
      const output = execSync(
        `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "[Math]::Round(((Get-Counter '\\Processor(_Total)\\% Processor Time' -SampleInterval 1 -MaxSamples 3).CounterSamples.CookedValue | Measure-Object -Average).Average, 1)"`,
        { encoding: "utf-8", timeout: 8000 }
      ).trim();
      const avgCpu = parseFloat(output);
      if (!isNaN(avgCpu)) {
        const count = avgCpu <= 36.0 ? 6 : 2;
        return { count, avgCpu, source: "sampled-counter" };
      }
    } catch {
      // Fallback on sampling timeout or counter error
    }
  }

  return { count: 4, avgCpu: null, source: "default-fallback" };
}

/**
 * Scale the libuv threadpool to accommodate worker threads and crypto tasks.
 */
export function configureLibuvThreadPool(threadCount) {
  const desired = Math.max(8, threadCount * 2);
  process.env.UV_THREADPOOL_SIZE = String(desired);
}
