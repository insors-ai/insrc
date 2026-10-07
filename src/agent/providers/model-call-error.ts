/**
 * Typed errors a provider raises so a caller can tell "the call to the
 * model failed" from "the model answered, but not in the required
 * shape" without matching on message text.
 */

/**
 * The request to the model itself failed: it was rejected, timed out,
 * or the transport broke. Raised where text cannot identify the
 * failure (an MCP sampling client reports it in its own words).
 */
export class ModelCallFailedError extends Error {
	/** The underlying failure's own message. */
	readonly detail: string;

	constructor(detail: string) {
		super(`Model call failed: ${detail}`);
		this.name = 'ModelCallFailedError';
		this.detail = detail;
	}
}

/**
 * The model's response arrived but is not in a shape the provider can
 * use (for example a sampling response whose content is not text).
 * A failure of shape, not of the call.
 */
export class ModelResponseShapeError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ModelResponseShapeError';
	}
}
