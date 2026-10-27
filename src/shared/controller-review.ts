/** Wire description of an actual isolated controller helper, separate from tool arguments. */
export interface ControllerExecutionCapability {
 readonly adapterId: 'cli-claude' | 'cli-codex';
 readonly maxInputChars: number;
 readonly helperEpoch?: string | undefined;
 readonly modelLabel?: string | undefined;
}
