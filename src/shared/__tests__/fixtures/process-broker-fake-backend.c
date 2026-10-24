/* Test-only backend, linked instead of the OS backend; never shipped. */
#include "broker.h"
#include <errno.h>
#include <stdlib.h>
#include <string.h>
int insrc_capture(pid_t pid, struct insrc_target *target) {
	const char *mode = getenv("INSRC_TEST_CAPTURE");
	if (mode && strcmp(mode, "denied") == 0) { errno = EPERM; return -1; }
	if (mode && strcmp(mode, "unsupported") == 0) { errno = ENOTSUP; return -1; }
	if (mode && strcmp(mode, "missing-metadata") == 0) { errno = ENOENT; return -1; }
	target->pid = pid; target->capability = target;
	strcpy(target->marker, "darwin:fixture:incarnation");
	strcpy(target->command, "node /fixture/daemon/index.js");
	return 0;
}
int insrc_state(const struct insrc_target *target) { (void)target; return 0; }
int insrc_terminate(const struct insrc_target *target) { (void)target; abort(); }
void insrc_release(struct insrc_target *target) { target->capability = NULL; }
