/* Copyright (c) Procix Software India. Licensed under the MIT License. */
#ifndef INSRC_PROCESS_BROKER_H
#define INSRC_PROCESS_BROKER_H
#include <sys/types.h>

#define INSRC_MARKER_SIZE 256
#define INSRC_COMMAND_SIZE 65536
struct insrc_target {
	pid_t pid;
	void *capability;
	char marker[INSRC_MARKER_SIZE];
	char command[INSRC_COMMAND_SIZE];
};
/* Capture the kernel capability BEFORE inspecting the PID's metadata. */
int insrc_capture(pid_t pid, struct insrc_target *target);
/* 0 = alive, 1 = exited, -1 = unverifiable (errno). */
int insrc_state(const struct insrc_target *target);
/* 0 = termination requested, 1 = already exited, -1 = failed (errno). */
int insrc_terminate(const struct insrc_target *target);
void insrc_release(struct insrc_target *target);
#endif
