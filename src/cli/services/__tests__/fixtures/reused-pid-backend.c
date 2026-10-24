/* Deterministic test-only OS adapter: two incarnations share one numeric PID. */
#include "broker.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
struct held { int exited; };
int insrc_capture(pid_t pid, struct insrc_target *target) {
 target->pid = pid; target->capability = calloc(1, sizeof(struct held));
 if (!target->capability) return -1;
 strcpy(target->marker, "linux:fixture-original-incarnation"); strcpy(target->command, "node /fixture/daemon/index.js"); return 0;
}
int insrc_state(const struct insrc_target *target) { return ((struct held *)target->capability)->exited; }
int insrc_terminate(const struct insrc_target *target) {
 /* Signal the captured capability, never resolve the current numeric PID table. */
 FILE *log = fopen(getenv("INSRC_REUSE_SIGNAL_LOG"), "a"); if (!log) return -1;
 fprintf(log, "%d original-incarnation\n", (int)target->pid); fclose(log);
 ((struct held *)target->capability)->exited = 1; return 0;
}
void insrc_release(struct insrc_target *target) { free(target->capability); target->capability = NULL; }
