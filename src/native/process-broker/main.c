/* Copyright (c) Procix Software India. Licensed under the MIT License. */
#include "broker.h"
#include <ctype.h>
#include <errno.h>
#include <limits.h>
#include <signal.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static const char *category(int error) {
	if (error == ESRCH) return "gone";
	if (error == EPERM || error == EACCES) return "denied";
	if (error == ENOSYS || error == ENOTSUP) return "unsupported";
	return "unverifiable";
}
static void hex(const char *value) {
	for (const unsigned char *p = (const unsigned char *)value; *p; ++p) printf("%02x", *p);
}
static int ends_with(const char *value, const char *suffix) {
	size_t a = strlen(value), b = strlen(suffix);
	return a >= b && memcmp(value + a - b, suffix, b) == 0;
}
int main(int argc, char **argv) {
	struct insrc_target target = {0};
	char *end;
	errno = 0;
	long pid = argc == 2 ? strtol(argv[1], &end, 10) : 0;
	if (argc != 2 || !isdigit((unsigned char)argv[1][0]) || errno || *end || pid <= 0 || pid > INT_MAX) {
		puts("ERROR invalid-target 22"); return 1;
	}
	(void)signal(SIGPIPE, SIG_IGN);
	if (insrc_capture((pid_t)pid, &target) != 0) {
		int error = errno; printf("ERROR %s %d\n", category(error), error); return 1;
	}
	/* This internal executable controls daemons, not arbitrary commands named by a caller. */
	if (!ends_with(target.command, "/daemon/index.js") && !ends_with(target.command, "/daemon/index.ts")) {
		puts("ERROR wrong-target 22"); insrc_release(&target); return 1;
	}
	printf("READY 1 %ld ", pid); hex(target.marker); putchar(' '); hex(target.command); putchar('\n');
	if (fflush(stdout) != 0) { insrc_release(&target); return 1; }
	char line[128];
	while (fgets(line, sizeof(line), stdin) != NULL) {
		char *newline = strchr(line, '\n');
		if (newline == NULL) { puts("ERROR malformed-request 22"); break; }
		*newline = '\0';
		if (newline > line && newline[-1] == '\r') newline[-1] = '\0';
		errno = 0;
		unsigned long id = strtoul(line, &end, 10);
		if (!isdigit((unsigned char)line[0]) || errno || id == 0 || id > UINT32_MAX || *end != ' ') {
			puts("ERROR malformed-request 22"); break;
		}
		const char *operation = end + 1;
		if (strcmp(operation, "CLOSE") == 0) { printf("%lu CLOSED\n", id); fflush(stdout); break; }
		int result;
		if (strcmp(operation, "STATE") == 0) {
			result = insrc_state(&target);
			if (result >= 0) printf("%lu %s\n", id, result ? "EXITED" : "ALIVE");
		} else if (strcmp(operation, "TERM") == 0) {
			result = insrc_terminate(&target);
			if (result >= 0) printf("%lu %s\n", id, result ? "EXITED" : "SENT");
		} else { printf("%lu ERROR invalid-operation 22\n", id); if (fflush(stdout) != 0) break; continue; }
		if (result < 0) { int error = errno; printf("%lu ERROR %s %d\n", id, category(error), error); }
		if (fflush(stdout) != 0) break;
	}
	insrc_release(&target);
	return 0;
}
