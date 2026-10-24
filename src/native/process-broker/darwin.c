/* Copyright (c) Procix Software India. Licensed under the MIT License. */
#include "broker.h"
#include <bsm/libbsm.h>
#include <errno.h>
#include <mach/mach.h>
#include <mach/task_info.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/sysctl.h>

struct darwin_capability { mach_port_t task; };
int insrc_state(const struct insrc_target *target) {
	const struct darwin_capability *cap = target->capability;
	mach_port_type_t type;
	if (mach_port_type(mach_task_self(), cap->task, &type) != KERN_SUCCESS) { errno = EIO; return -1; }
	if (type & MACH_PORT_TYPE_DEAD_NAME) return 1;
	if (!(type & MACH_PORT_TYPE_SEND)) { errno = EIO; return -1; }
	return 0;
}
void insrc_release(struct insrc_target *target) {
	struct darwin_capability *cap = target->capability;
	if (cap) { mach_port_deallocate(mach_task_self(), cap->task); free(cap); target->capability = NULL; }
}
static int command_line(pid_t pid, char *out, size_t capacity) {
	int size_mib[] = { CTL_KERN, KERN_ARGMAX }, maximum = 0;
	size_t size = sizeof(maximum);
	if (sysctl(size_mib, 2, &maximum, &size, NULL, 0) != 0) return -1;
	if (size != sizeof(maximum)) { errno = EIO; return -1; }
	if (maximum < (int)sizeof(int) || maximum > 1024 * 1024) { errno = EOVERFLOW; return -1; }
	char *buffer = malloc((size_t)maximum);
	if (!buffer) { errno = ENOMEM; return -1; }
	int mib[] = { CTL_KERN, KERN_PROCARGS2, pid };
	size = (size_t)maximum;
	if (sysctl(mib, 3, buffer, &size, NULL, 0) != 0) { int error = errno; free(buffer); errno = error; return -1; }
	if (size < sizeof(int)) { free(buffer); errno = EIO; return -1; }
	int argc; memcpy(&argc, buffer, sizeof(argc));
	char *p = buffer + sizeof(argc), *end = buffer + size;
	char *zero = memchr(p, 0, (size_t)(end - p));
	if (!zero || argc <= 0 || argc > 4096) { free(buffer); errno = EIO; return -1; }
	p = zero + 1; while (p < end && *p == 0) ++p;
	size_t used = 0;
	for (int i = 0; i < argc; ++i) {
		zero = memchr(p, 0, (size_t)(end - p));
		if (!zero) { free(buffer); errno = EIO; return -1; }
		size_t length = (size_t)(zero - p);
		if (used + length + (i ? 1u : 0u) >= capacity) { free(buffer); errno = EOVERFLOW; return -1; }
		if (i) out[used++] = ' ';
		memcpy(out + used, p, length); used += length; p = zero + 1;
	}
	out[used] = 0; free(buffer); return 0;
}
int insrc_capture(pid_t pid, struct insrc_target *target) {
	mach_port_t task = MACH_PORT_NULL;
	if (task_for_pid(mach_task_self(), pid, &task) != KERN_SUCCESS) { errno = EPERM; return -1; }
	struct darwin_capability *cap = malloc(sizeof(*cap));
	if (!cap) { mach_port_deallocate(mach_task_self(), task); errno = ENOMEM; return -1; }
	cap->task = task; target->capability = cap; target->pid = pid;
	audit_token_t first, last;
	mach_msg_type_number_t count = TASK_AUDIT_TOKEN_COUNT;
	if (task_info(task, TASK_AUDIT_TOKEN, (task_info_t)&first, &count) != KERN_SUCCESS || count != TASK_AUDIT_TOKEN_COUNT || audit_token_to_pid(first) != pid) { errno = EPERM; goto fail; }
	if (command_line(pid, target->command, sizeof(target->command)) != 0) goto fail;
	count = TASK_AUDIT_TOKEN_COUNT;
	/* Recheck the retained port, not another task_for_pid lookup after possible PID reuse. */
	if (task_info(task, TASK_AUDIT_TOKEN, (task_info_t)&last, &count) != KERN_SUCCESS || count != TASK_AUDIT_TOKEN_COUNT || memcmp(&first, &last, sizeof(first)) != 0) { errno = ESRCH; goto fail; }
	if (snprintf(target->marker, sizeof(target->marker), "darwin:%ld:%d", (long)pid, audit_token_to_pidversion(first)) >= (int)sizeof(target->marker)) { errno = EOVERFLOW; goto fail; }
	return 0;
fail: {
	int error = errno, state = insrc_state(target);
	if (state == 1) error = ESRCH;
	else if (error == ESRCH || error == ENOENT) error = EIO;
	insrc_release(target); errno = error; return -1;
}
}
int insrc_terminate(const struct insrc_target *target) {
	const struct darwin_capability *cap = target->capability;
	if (task_terminate(cap->task) == KERN_SUCCESS) return 0;
	int state = insrc_state(target);
	if (state == 1) return 1;
	errno = EPERM; return -1;
}
