/**
 * Development-only Performance Telemetry Tracker.
 * Measures fine-grained timing intervals across user tap, request dispatch,
 * response headers, body parsing, React state commit, and screen render.
 *
 * PRIVACY & SAFETY:
 * Strictly measurements only. NEVER logs user queries, URLs, or payload bodies.
 */

interface RequestMetric {
  id: string;
  kind: string;
  tTap: number;
  tDispatch?: number;
  tHeaders?: number;
  tParsed?: number;
  tStateCommit?: number;
  tRender?: number;
  // URL job specific
  tJobSubmitStart?: number;
  tJobSubmitDone?: number;
  tPollStart?: number;
  pollCount?: number;
  tPollDone?: number;
}

class PerfTracker {
  private metrics = new Map<string, RequestMetric>();

  public recordTap(id: string, kind = "request"): void {
    if (typeof __DEV__ === "undefined" || !__DEV__) return;
    this.metrics.set(id, {
      id,
      kind,
      tTap: performance.now(),
    });
  }

  public recordDispatch(id: string): void {
    if (typeof __DEV__ === "undefined" || !__DEV__) return;
    const m = this.metrics.get(id);
    if (m) m.tDispatch = performance.now();
  }

  public recordHeaders(id: string): void {
    if (typeof __DEV__ === "undefined" || !__DEV__) return;
    const m = this.metrics.get(id);
    if (m) m.tHeaders = performance.now();
  }

  public recordBodyParsed(id: string): void {
    if (typeof __DEV__ === "undefined" || !__DEV__) return;
    const m = this.metrics.get(id);
    if (m) m.tParsed = performance.now();
  }

  public recordStateCommit(id: string): void {
    if (typeof __DEV__ === "undefined" || !__DEV__) return;
    const m = this.metrics.get(id);
    if (m) m.tStateCommit = performance.now();
  }

  public recordRender(id: string): void {
    if (typeof __DEV__ === "undefined" || !__DEV__) return;
    const m = this.metrics.get(id);
    if (!m) return;
    m.tRender = performance.now();
    this.report(m);
    this.metrics.delete(id);
  }

  // URL job telemetry
  public recordJobSubmitStart(id: string): void {
    if (typeof __DEV__ === "undefined" || !__DEV__) return;
    const m = this.metrics.get(id);
    if (m) m.tJobSubmitStart = performance.now();
  }

  public recordJobSubmitDone(id: string): void {
    if (typeof __DEV__ === "undefined" || !__DEV__) return;
    const m = this.metrics.get(id);
    if (m) m.tJobSubmitDone = performance.now();
  }

  public recordPollStart(id: string): void {
    if (typeof __DEV__ === "undefined" || !__DEV__) return;
    const m = this.metrics.get(id);
    if (m) {
      m.tPollStart = performance.now();
      m.pollCount = 0;
    }
  }

  public recordPollCycle(id: string): void {
    if (typeof __DEV__ === "undefined" || !__DEV__) return;
    const m = this.metrics.get(id);
    if (m) m.pollCount = (m.pollCount || 0) + 1;
  }

  public recordPollDone(id: string): void {
    if (typeof __DEV__ === "undefined" || !__DEV__) return;
    const m = this.metrics.get(id);
    if (m) m.tPollDone = performance.now();
  }

  private report(m: RequestMetric): void {
    const tapToDispatch = m.tDispatch ? (m.tDispatch - m.tTap).toFixed(1) : "n/a";
    const dispatchToHeaders =
      m.tDispatch && m.tHeaders ? (m.tHeaders - m.tDispatch).toFixed(1) : "n/a";
    const headersToParse =
      m.tHeaders && m.tParsed ? (m.tParsed - m.tHeaders).toFixed(1) : "n/a";
    const parseToCommit =
      m.tParsed && m.tStateCommit ? (m.tStateCommit - m.tParsed).toFixed(1) : "n/a";
    const commitToRender =
      m.tStateCommit && m.tRender ? (m.tRender - m.tStateCommit).toFixed(1) : "n/a";
    const total = m.tRender ? (m.tRender - m.tTap).toFixed(1) : "n/a";

    if (m.tJobSubmitStart && m.tPollDone) {
      const submitDuration = m.tJobSubmitDone
        ? (m.tJobSubmitDone - m.tJobSubmitStart).toFixed(1)
        : "n/a";
      const pollDuration = m.tPollStart
        ? (m.tPollDone - m.tPollStart).toFixed(1)
        : "n/a";
      console.log(
        `[Tabayyan Perf] URL Job (${m.id}):\n` +
          `  • Tap to Submit: ${tapToDispatch}ms\n` +
          `  • Job Submission: ${submitDuration}ms\n` +
          `  • Polling/Processing: ${pollDuration}ms (${m.pollCount || 0} polls)\n` +
          `  • State Commit to Render: ${commitToRender}ms\n` +
          `  • Total Elapsed: ${total}ms`
      );
    } else {
      console.log(
        `[Tabayyan Perf] ${m.kind} (${m.id}):\n` +
          `  • Tap to Dispatch: ${tapToDispatch}ms\n` +
          `  • Dispatch to Headers (Server/Network): ${dispatchToHeaders}ms\n` +
          `  • Headers to Parse (JSON/Body): ${headersToParse}ms\n` +
          `  • Parse to State Commit: ${parseToCommit}ms\n` +
          `  • Commit to Component Render: ${commitToRender}ms\n` +
          `  • Total Elapsed (Tap to Render): ${total}ms`
      );
    }
  }
}

export const perfTracker = new PerfTracker();
