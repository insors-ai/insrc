/** Admission happens before allocation/retention, independently of batch accounting. */
export interface AdmissionSnapshot {
	readonly retained: number;
	readonly peak: number;
	readonly units: number;
}
export class DecoderBudget {
	#retained = 0;
	#peak = 0;
	#units = 0;
	constructor(readonly limit: number, readonly observe?: ((snapshot: AdmissionSnapshot) => void) | undefined) {
		if (!Number.isSafeInteger(limit) || limit <= 0)
			throw new Error('resource-limit');
	}
	reserve(bytes: number): () => void {
		if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > this.limit - this.#retained)
			throw new Error('resource-limit');
		this.#retained += bytes;
		this.#units++;
		this.#peak = Math.max(this.#peak, this.#retained);
		this.#publish();
		let active = true;
		return () => {
			if (!active)
				return;
			active = false;
			this.#retained -= bytes;
			this.#units--;
			this.#publish();
		};
	}
	snapshot(): AdmissionSnapshot {
		return { retained: this.#retained, peak: this.#peak, units: this.#units };
	}
	#publish(): void {
		this.observe?.(this.snapshot());
	}
}
