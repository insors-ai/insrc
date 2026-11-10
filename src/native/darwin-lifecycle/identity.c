/* Copyright (c) Procix Software India. Licensed under the MIT License. */
#include <errno.h>
#include <libproc.h>
#include <limits.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/event.h>
#include <sys/proc_info.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>

struct identity {
	struct proc_bsdinfo info;
	char executable[PROC_PIDPATHINFO_MAXSIZE];
};

static int read_identity(pid_t pid, struct identity *identity) {
	struct proc_bsdinfo *info = &identity->info;
	if (proc_pidinfo(pid, PROC_PIDTBSDINFO, 0, info, sizeof(*info)) != sizeof(*info)) return -1;
	if (proc_pidpath(pid, identity->executable, sizeof(identity->executable)) <= 0) return -1;
	struct proc_bsdinfo check;
	if (proc_pidinfo(pid, PROC_PIDTBSDINFO, 0, &check, sizeof(check)) != sizeof(check)) return -1;
	if (check.pbi_pid != info->pbi_pid || check.pbi_uid != info->pbi_uid
		|| check.pbi_start_tvsec != info->pbi_start_tvsec || check.pbi_start_tvusec != info->pbi_start_tvusec) {
		errno = ESTALE; return -1;
	}
	return 0;
}

static int print_identity(pid_t pid) {
	struct identity identity;
	if (read_identity(pid, &identity) != 0) return -1;
	const struct proc_bsdinfo *info = &identity.info;
	printf("%u:%u:%llu:%llu", info->pbi_pid, info->pbi_uid, info->pbi_start_tvsec, info->pbi_start_tvusec);
	putchar('\0');
	fputs(identity.executable, stdout);
	putchar('\0');
	return fflush(stdout);
}

static int print_peer(void) {
	/* fd 3 is a duplicate of the caller's already-connected Unix socket. */
	pid_t pid = 0;
	socklen_t length = sizeof(pid);
	uid_t uid;
	gid_t gid;
	if (getpeereid(3, &uid, &gid) != 0 || getsockopt(3, SOL_LOCAL, LOCAL_PEERPID, &pid, &length) != 0) return -1;
	if (length != sizeof(pid) || pid <= 0) { errno = EINVAL; return -1; }
	return printf("%ld:%u\n", (long)pid, uid) < 0 ? -1 : fflush(stdout);
}

static int observe(pid_t pid, const char *marker, const char *executable, long timeout_ms) {
	struct identity identity;
	char actual[100];
	struct kevent event;
	int queue = kqueue();
	if (queue < 0) return -1;
	/* Verify identity both before and after binding the kernel observer. */
	for (int check = 0; check < 2; ++check) {
		if (read_identity(pid, &identity) != 0) return -1;
		const struct proc_bsdinfo *info = &identity.info;
		snprintf(actual, sizeof(actual), "%u:%u:%llu:%llu", info->pbi_pid, info->pbi_uid,
			info->pbi_start_tvsec, info->pbi_start_tvusec);
		if (strcmp(marker, actual) != 0 || strcmp(executable, identity.executable) != 0) {
			errno = ESTALE; return -1;
		}
		if (check == 0) {
			EV_SET(&event, (uintptr_t)pid, EVFILT_PROC, EV_ADD | EV_ONESHOT, NOTE_EXIT, 0, NULL);
			if (kevent(queue, &event, 1, NULL, 0, NULL) != 0) return -1;
		}
	}
	puts("ready");
	if (fflush(stdout) != 0) return -1;
	const struct timespec timeout = { .tv_sec = timeout_ms / 1000, .tv_nsec = (timeout_ms % 1000) * 1000000 };
	int count = kevent(queue, NULL, 0, &event, 1, &timeout);
	if (count != 1 || event.ident != (uintptr_t)pid || event.filter != EVFILT_PROC
		|| (event.flags & EV_ERROR) || !(event.fflags & NOTE_EXIT)) {
		if (count == 0) errno = ETIMEDOUT;
		else if (count > 0) errno = EIO;
		return -1;
	}
	puts("exited");
	return fflush(stdout);
}

static long positive(const char *text) {
	char *end;
	errno = 0;
	long result = strtol(text, &end, 10);
	return errno == 0 && *text != '\0' && *end == '\0' && result > 0 && result <= INT_MAX ? result : 0;
}

int main(int argc, char **argv) {
	int result = -1;
	errno = EINVAL;
	if (argc == 2 && strcmp(argv[1], "peer") == 0) result = print_peer();
	else if (argc >= 3) {
		long pid = positive(argv[2]);
		if (pid > 0 && argc == 3 && strcmp(argv[1], "identity") == 0) result = print_identity((pid_t)pid);
		if (pid > 0 && argc == 6 && strcmp(argv[1], "observe") == 0) {
			long timeout = positive(argv[5]);
			if (timeout > 0) result = observe((pid_t)pid, argv[3], argv[4], timeout);
		}
	}
	if (result == 0) return EXIT_SUCCESS;
	fprintf(stderr, "Darwin lifecycle observation failed (errno %d)\n", errno);
	return EXIT_FAILURE;
}
