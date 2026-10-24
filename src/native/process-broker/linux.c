/* Copyright (c) Procix Software India. Licensed under the MIT License. */
#define _GNU_SOURCE
#include "broker.h"
#include <errno.h>
#include <poll.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/syscall.h>
#include <unistd.h>

struct linux_capability { int fd; };
static int read_file(const char *path, char *buffer, size_t capacity) {
	FILE *file = fopen(path, "rb");
	if (!file) return -1;
	size_t count = fread(buffer, 1, capacity - 1, file);
	int extra = fgetc(file);
	int error = ferror(file) ? EIO : extra != EOF ? EOVERFLOW : 0;
	fclose(file);
	if (error) { errno = error; return -1; }
	buffer[count] = '\0';
	return (int)count;
}
int insrc_state(const struct insrc_target *target) {
	const struct linux_capability *cap = target->capability;
	struct pollfd fd = { .fd = cap->fd, .events = POLLIN };
	int result;
	do { result = poll(&fd, 1, 0); } while (result < 0 && errno == EINTR);
	if (result < 0) return -1;
	if (fd.revents & (POLLNVAL | POLLERR)) { errno = EIO; return -1; }
	return (fd.revents & (POLLIN | POLLHUP)) != 0;
}
void insrc_release(struct insrc_target *target) {
	struct linux_capability *cap = target->capability;
	if (cap) { close(cap->fd); free(cap); target->capability = NULL; }
}
int insrc_capture(pid_t pid, struct insrc_target *target) {
#if !defined(SYS_pidfd_open) || !defined(SYS_pidfd_send_signal)
	(void)pid; (void)target; errno = ENOTSUP; return -1;
#else
	int fd = (int)syscall(SYS_pidfd_open, pid, 0);
	if (fd < 0) return -1;
	struct linux_capability *cap = malloc(sizeof(*cap));
	if (!cap) { close(fd); errno = ENOMEM; return -1; }
	cap->fd = fd; target->capability = cap; target->pid = pid;
	char path[64], stat[4096], boot[128];
	snprintf(path, sizeof(path), "/proc/%ld/stat", (long)pid);
	if (read_file(path, stat, sizeof(stat)) < 0) goto fail;
	char *last = strrchr(stat, ')'), *save = NULL;
	if (!last || last[1] != ' ') { errno = EIO; goto fail; }
	char *field = strtok_r(last + 2, " \n", &save);
	for (int i = 0; i < 19 && field; ++i) field = strtok_r(NULL, " \n", &save);
	if (!field || *field == '\0' || strspn(field, "0123456789") != strlen(field)) { errno = EIO; goto fail; }
	if (read_file("/proc/sys/kernel/random/boot_id", boot, sizeof(boot)) < 0) goto fail;
	boot[strcspn(boot, "\r\n")] = '\0';
	if (*boot == '\0' || snprintf(target->marker, sizeof(target->marker), "linux:%s:%s", boot, field) >= (int)sizeof(target->marker)) { errno = EOVERFLOW; goto fail; }
	snprintf(path, sizeof(path), "/proc/%ld/cmdline", (long)pid);
	int length = read_file(path, target->command, sizeof(target->command));
	if (length <= 0) { if (length == 0) errno = EIO; goto fail; }
	while (length > 0 && target->command[length - 1] == '\0') --length;
	for (int i = 0; i < length; ++i) if (target->command[i] == '\0') target->command[i] = ' ';
	target->command[length] = '\0';
	/* If the bound process died while metadata was read, do not bind recycled-PID metadata to it. */
	int state = insrc_state(target);
	if (state != 0) { if (state > 0) errno = ESRCH; goto fail; }
	return 0;
fail: {
	int error = errno, state = insrc_state(target);
	if (state == 1) error = ESRCH;
	else if (error == ENOENT || error == ESRCH) error = EIO;
	insrc_release(target); errno = error; return -1;
}
#endif
}
int insrc_terminate(const struct insrc_target *target) {
#ifdef SYS_pidfd_send_signal
	const struct linux_capability *cap = target->capability;
	if (syscall(SYS_pidfd_send_signal, cap->fd, SIGKILL, NULL, 0) == 0) return 0;
	return errno == ESRCH ? 1 : -1;
#else
	(void)target; errno = ENOTSUP; return -1;
#endif
}
