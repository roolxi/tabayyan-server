/** Only the newest request may update UI; cancellation also invalidates late responses. */
export class LatestRequest {
  private controller: AbortController | null = null;
  begin(): AbortController {
    this.cancel();
    this.controller = new AbortController();
    return this.controller;
  }
  isCurrent(controller: AbortController): boolean {
    return this.controller === controller && !controller.signal.aborted;
  }
  cancel(): void {
    this.controller?.abort();
    this.controller = null;
  }
}
