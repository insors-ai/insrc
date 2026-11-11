/* Copyright (c) Procix Software India. Licensed under the MIT License. */
#include <errno.h>
#include <libproc.h>
#include <limits.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/event.h>
#include <sys/file.h>
#include <sys/proc_info.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/sysctl.h>
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

/* Return the exact argv and current directory, without dumping the environment. */
static int print_context(pid_t pid) {
	struct identity before, after;
	struct proc_vnodepathinfo cwd;
	if (read_identity(pid, &before) != 0 || before.info.pbi_uid != getuid()) { errno = EPERM; return -1; }
	if (proc_pidinfo(pid, PROC_PIDVNODEPATHINFO, 0, &cwd, sizeof(cwd)) != sizeof(cwd)) return -1;
	int max = 0, argmax[] = { CTL_KERN, KERN_ARGMAX };
	size_t size = sizeof(max);
	if (sysctl(argmax, 2, &max, &size, NULL, 0) != 0 || max < (int)sizeof(int) || max > 1024 * 1024) return -1;
	char *bytes = malloc((size_t)max);
	if (bytes == NULL) return -1;
	int args[] = { CTL_KERN, KERN_PROCARGS2, pid }, count;
	size = (size_t)max;
	int result = -1;
	if (sysctl(args, 3, bytes, &size, NULL, 0) != 0 || size < sizeof(count)) goto done;
	memcpy(&count, bytes, sizeof(count));
	if (count <= 0 || count > 4096) goto done;
	char *p = bytes + sizeof(count), *end = bytes + size;
	char *zero = memchr(p, 0, (size_t)(end - p));
	if (zero == NULL) goto done;
	p = zero + 1;
	while (p < end && *p == '\0') ++p;
	char *first = p;
	for (int i = 0; i < count; ++i) {
		zero = memchr(p, 0, (size_t)(end - p));
		if (zero == NULL) goto done;
		p = zero + 1;
	}
	if (read_identity(pid, &after) != 0 || after.info.pbi_uid != before.info.pbi_uid
		|| after.info.pbi_start_tvsec != before.info.pbi_start_tvsec
		|| after.info.pbi_start_tvusec != before.info.pbi_start_tvusec
		|| strcmp(after.executable, before.executable) != 0) { errno = ESTALE; goto done; }
	size_t cwd_length = strnlen(cwd.pvi_cdir.vip_path, sizeof(cwd.pvi_cdir.vip_path));
	if (cwd_length == 0 || cwd_length == sizeof(cwd.pvi_cdir.vip_path)) goto done;
	if (fwrite(cwd.pvi_cdir.vip_path, 1, cwd_length + 1, stdout) != cwd_length + 1
		|| fwrite(first, 1, (size_t)(p - first), stdout) != (size_t)(p - first)) goto done;
	result = fflush(stdout);
done:
	free(bytes);
	return result;
}

static int same_number(const char *value, uint64_t expected) {
	char *end;
	errno = 0;
	unsigned long long parsed = strtoull(value, &end, 10);
	return errno == 0 && *value >= '0' && *value <= '9' && *end == '\0' && parsed == expected;
}

static int swap_directories(const char *first, const char *second, const char *device, const char *left_ino, const char *right_ino) {
	struct stat left, right;
	if (first[0] != '/' || second[0] != '/' || lstat(first, &left) != 0 || lstat(second, &right) != 0) return -1;
	if (!S_ISDIR(left.st_mode) || !S_ISDIR(right.st_mode) || left.st_uid != getuid() || right.st_uid != getuid()
		|| left.st_dev != right.st_dev || left.st_ino == right.st_ino) { errno = EINVAL; return -1; }
	if (!same_number(device, (uint64_t)left.st_dev) || !same_number(left_ino, left.st_ino)
		|| !same_number(right_ino, right.st_ino)) { errno = ESTALE; return -1; }
	return renamex_np(first, second, RENAME_SWAP);
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
	if (argc == 2 && strcmp(argv[1], "lock") == 0) {
		/* The caller retains its own descriptor for the same open file. */
		if (flock(3, LOCK_EX | LOCK_NB) == 0) return EXIT_SUCCESS;
		if (errno == EWOULDBLOCK) return 75;
	} else if (argc == 2 && strcmp(argv[1], "peer") == 0) result = print_peer();
	else if (argc == 7 && strcmp(argv[1], "swap-directories") == 0) result = swap_directories(argv[2], argv[3], argv[4], argv[5], argv[6]);
	else if (argc >= 3) {
		long pid = positive(argv[2]);
		if (pid > 0 && argc == 3 && strcmp(argv[1], "identity") == 0) result = print_identity((pid_t)pid);
		if (pid > 0 && argc == 3 && strcmp(argv[1], "context") == 0) result = print_context((pid_t)pid);
		if (pid > 0 && argc == 6 && strcmp(argv[1], "observe") == 0) {
			long timeout = positive(argv[5]);
			if (timeout > 0) result = observe((pid_t)pid, argv[3], argv[4], timeout);
		}
	}
	if (result == 0) return EXIT_SUCCESS;
	fprintf(stderr, "Darwin lifecycle observation failed (errno %d)\n", errno);
	return EXIT_FAILURE;
}
