/**
 * Story E20260921ad0d45c9:S001 / t5 — sc4 ConsentGate.
 *
 * The SINGLE consent-prompt contract (k4): every invasive action asks and
 * performs nothing until the developer accepts. s1 performs NO invasive action —
 * it only supplies the gate the invasive stories (s2 install, s3 wire, s4
 * register) call before any side effect. Built over an INJECTED modal-message fn
 * so it is unit-testable off the editor.
 */
import type { ModalMessageFn } from './types.js';

export interface ConsentRequest {
  title: string;
  detail: string;
  acceptLabel: string;
  /** e.g. the detected host names for the combined wiring prompt. */
  items?: string[] | undefined;
}

export type ConsentOutcome = 'accepted' | 'declined' | 'dismissed';

export interface ConsentGate {
  ask(request: ConsentRequest): Promise<ConsentOutcome>;
}

/**
 * Build the sc4 ConsentGate over an injected modal-message fn (VS Code's
 * `window.showInformationMessage` with `modal:true`). The developer's choice maps
 * to `accepted` (they picked the accept action), `declined` (they picked the
 * explicit Cancel/decline), or `dismissed` (they closed the dialog — `undefined`).
 */
export function createConsentGate(showModal: ModalMessageFn): ConsentGate {
  return {
    async ask(request: ConsentRequest): Promise<ConsentOutcome> {
      const detail = request.items !== undefined && request.items.length > 0
        ? `${request.detail}\n\n${request.items.join('\n')}`
        : request.detail;

      const choice = await showModal(
        request.title,
        { modal: true, detail },
        request.acceptLabel,
      );

      if (choice === request.acceptLabel) return 'accepted';
      if (choice === undefined) return 'dismissed';
      return 'declined';
    },
  };
}
