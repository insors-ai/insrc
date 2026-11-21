/* Copyright (c) Procix Software India. Licensed under the MIT License. */
#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <poll.h>
#include <signal.h>
#include <stddef.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/prctl.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/syscall.h>
#include <sys/types.h>
#include <sys/un.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>

static int pidfd(pid_t pid) { return (int)syscall(SYS_pidfd_open, pid, 0); }
static int dead(int fd) {
 struct pollfd p = { .fd = fd, .events = POLLIN };
 int r = poll(&p, 1, 0); return r < 0 || (p.revents & (POLLERR | POLLNVAL)) ? -1 : !!(p.revents & (POLLIN | POLLHUP));
}
static int terminate(int fd) {
 if (syscall(SYS_pidfd_send_signal, fd, SIGKILL, NULL, 0) == 0 || errno == ESRCH) return 0;
 return -1;
}
static long long now_ms(void) {
 struct timespec t; if (clock_gettime(CLOCK_MONOTONIC, &t) < 0) return -1;
 return (long long)t.tv_sec * 1000 + t.tv_nsec / 1000000;
}
static int socket_address(struct sockaddr_un *address, const char *token) {
 memset(address, 0, sizeof(*address)); address->sun_family = AF_UNIX;
 int length = snprintf(address->sun_path + 1, sizeof(address->sun_path) - 1, "insrc-source-%s", token);
 if (length < 0 || (size_t)length >= sizeof(address->sun_path) - 1) return -1;
 return (int)offsetof(struct sockaddr_un, sun_path) + 1 + length;
}
static int marker(pid_t pid, char *out, size_t size) {
 char path[128], line[8192], boot[128];
 snprintf(path, sizeof(path), "/proc/%ld/stat", (long)pid);
 FILE *f = fopen(path, "r"); if (!f) return -1;
 char *ok = fgets(line, sizeof(line), f); fclose(f); if (!ok) return -1;
 char *end = strrchr(line, ')'), *save = NULL; if (!end) return -1;
 char *field = strtok_r(end + 2, " \n", &save);
 for (int i = 0; i < 19 && field; i++) field = strtok_r(NULL, " \n", &save);
 if (!field || strspn(field, "0123456789") != strlen(field)) return -1;
 f = fopen("/proc/sys/kernel/random/boot_id", "r"); if (!f) return -1;
 ok = fgets(boot, sizeof(boot), f); fclose(f); if (!ok) return -1;
 boot[strcspn(boot, "\r\n")] = 0;
 int n = snprintf(out, size, "linux:%s:%s", boot, field);
 return n < 0 || (size_t)n >= size ? -1 : 0;
}
static int line(int fd, char *buffer, size_t size, int timeout) {
 size_t used = 0;
 while (used + 1 < size) {
  struct pollfd p = { .fd = fd, .events = POLLIN };
  int r; do { r = poll(&p, 1, timeout); } while (r < 0 && errno == EINTR);
  if (r <= 0 || (p.revents & (POLLERR | POLLNVAL))) return -1;
  ssize_t n = read(fd, buffer + used, 1); if (n != 1) return -1;
  if (buffer[used++] == '\n') { buffer[used - 1] = 0; return 0; }
 }
 return -1;
}
/* Once the direct child exits, every surviving descendant is adopted by this subreaper.
 * Keep reaping/killing only our current direct children until the kernel reports ECHILD. */
static int close_tree(int rootfd) {
 if (terminate(rootfd) < 0) return -1;
 long long deadline = now_ms() + 10000;
 while (now_ms() < deadline) {
  int status; pid_t result;
  do { result = waitpid(-1, &status, WNOHANG); } while (result > 0);
  if (result < 0 && errno == ECHILD) return 0;
  if (result < 0 && errno != EINTR) return -1;
  char path[128]; snprintf(path, sizeof(path), "/proc/self/task/%ld/children", (long)getpid());
  FILE *f = fopen(path, "r"); if (!f) return -1;
  long child; int failure = 0;
  while (fscanf(f, "%ld", &child) == 1) {
   int fd = pidfd((pid_t)child);
   if (fd < 0) { if (errno != ESRCH) failure = 1; continue; }
   if (terminate(fd) < 0) failure = 1;
   close(fd);
  }
  fclose(f); if (failure) return -1;
  struct timespec pause = { .tv_nsec = 10000000 }; nanosleep(&pause, NULL);
 }
 return -1;
}
static int closed_receipt(int directory, const char *token, pid_t root, const char *start) {
 int fd = openat(directory, "closed.tmp", O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW | O_CLOEXEC, 0600);
 if (fd < 0) return -1;
 int ok = dprintf(fd, "CLOSED %s %ld %s\n", token, (long)root, start) > 0 && fsync(fd) == 0;
 close(fd);
 if (!ok || renameat(directory, "closed.tmp", directory, "closed") < 0 || fsync(directory) < 0) return -1;
 return 0;
}
static int client(int argc, char **argv) {
 if (argc != 5) return 2;
 const char *token = argv[1], *expected = argv[3], *command = argv[4];
 char *end; long owner = strtol(argv[2], &end, 10); if (*end || owner <= 0) return 2;
 struct sockaddr_un address; int length = socket_address(&address, token); if (length < 0) return 2;
 int fd = socket(AF_UNIX, SOCK_STREAM | SOCK_CLOEXEC, 0); if (fd < 0) return 3;
 if (connect(fd, (struct sockaddr *)&address, (socklen_t)length) < 0) { close(fd); return 3; }
 struct ucred peer; socklen_t size = sizeof(peer);
 if (getsockopt(fd, SOL_SOCKET, SO_PEERCRED, &peer, &size) < 0 || peer.uid != getuid() || peer.pid != owner) { close(fd); return 4; }
 int capability = pidfd(peer.pid); char actual[256];
 if (capability < 0 || marker(peer.pid, actual, sizeof(actual)) < 0 || strcmp(actual, expected) || dead(capability) != 0) {
  if (capability >= 0) close(capability);
  close(fd); return 4;
 }
 int sent = dprintf(fd, "%s %s\n", command, token);
 char reply[1024]; int ok = sent > 0 && line(fd, reply, sizeof(reply), 15000) == 0;
 close(capability); close(fd);
 if (!ok) return 5;
 puts(reply); return 0;
}
int main(int argc, char **argv) {
 signal(SIGPIPE, SIG_IGN);
 signal(SIGCHLD, SIG_DFL); /* A direct child's PID cannot be reused before our waitpid. */
 if (argc == 2 && !strcmp(argv[1], "preflight")) {
  int fd = pidfd(getpid());
  if (fd < 0 || prctl(PR_SET_CHILD_SUBREAPER, 1, 0, 0, 0) < 0
   || syscall(SYS_pidfd_send_signal, fd, 0, NULL, 0) < 0) return 3;
  close(fd); puts("SUPPORTED"); return 0;
 }
 if (argc > 1 && !strcmp(argv[1], "control")) return client(argc - 1, argv + 1);
 if (argc != 7) return 2;
 const char *directoryPath = argv[1], *runtime = argv[2], *entry = argv[3], *barrier = argv[4], *token = argv[5];
 if (strlen(token) != 64 || strspn(token, "0123456789abcdef") != 64 || runtime[0] != '/' || entry[0] != '/' || barrier[0] != '/') return 2;
 char *end; long parent = strtol(argv[6], &end, 10); if (*end || parent <= 0 || getppid() != parent) return 3;
 int directory = open(directoryPath, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
 struct stat st; if (directory < 0 || fstat(directory, &st) < 0 || st.st_uid != getuid() || (st.st_mode & 077)) return 3;
 int parentfd = pidfd((pid_t)parent); if (parentfd < 0 || prctl(PR_SET_CHILD_SUBREAPER, 1, 0, 0, 0) < 0) return 3;
 struct sockaddr_un address; int length = socket_address(&address, token);
 int listener = socket(AF_UNIX, SOCK_STREAM | SOCK_CLOEXEC, 0);
 if (length < 0 || listener < 0 || bind(listener, (struct sockaddr *)&address, (socklen_t)length) < 0 || listen(listener, 8) < 0) return 3;
 int channel[2]; if (socketpair(AF_UNIX, SOCK_STREAM | SOCK_CLOEXEC, 0, channel) < 0) return 3;
 pid_t root = fork(); if (root < 0) return 3;
 if (!root) {
  close(channel[0]);
  if (dup2(channel[1], 3) < 0) _exit(126);
  if (channel[1] != 3) close(channel[1]);
  char rootPid[32], ownerPid[32];
  snprintf(rootPid, sizeof(rootPid), "%ld", (long)getpid()); snprintf(ownerPid, sizeof(ownerPid), "%ld", (long)getppid());
  if (setenv("INSRC_SOURCE_ACTOR_TOKEN", token, 1) < 0
   || setenv("INSRC_SOURCE_ACTOR_ROOT_PID", rootPid, 1) < 0 || setenv("INSRC_SOURCE_ACTOR_MONITOR_PID", ownerPid, 1) < 0
   || unsetenv("NODE_CHANNEL_FD") < 0 || unsetenv("NODE_CHANNEL_SERIALIZATION_MODE") < 0 || unsetenv("NODE_UNIQUE_ID") < 0) _exit(126);
  execl(runtime, runtime, "--import", barrier, entry, (char *)NULL); _exit(127);
 }
 close(channel[1]); int rootfd = pidfd(root); char start[256];
 if (rootfd < 0 || marker(root, start, sizeof(start)) < 0) { close(channel[0]); return 4; }
 int waiting = 0, granted = 0, committed = 0, closed = 0, failure = 0;
 for (;;) {
  struct pollfd p[4] = { { .fd = listener, .events = POLLIN }, { .fd = channel[0], .events = POLLIN },
   { .fd = rootfd, .events = POLLIN }, { .fd = committed ? -1 : parentfd, .events = POLLIN } };
  int r; do { r = poll(p, 4, 1000); } while (r < 0 && errno == EINTR);
  if (r < 0) { failure = 1; break; }
  if (p[2].revents || (!committed && p[3].revents)) {
   if (close_tree(rootfd) == 0 && closed_receipt(directory, token, root, start) == 0) closed = 1;
   else failure = 1;
   break;
  }
  if (p[1].revents & POLLIN) {
   char input[256], expected[256]; snprintf(expected, sizeof(expected), "WAITING %s", token);
   if (line(channel[0], input, sizeof(input), 2000) < 0 || strcmp(input, expected) || waiting) { failure = 1; break; }
   waiting = 1;
  }
  if (p[0].revents & POLLIN) {
   int fd = accept4(listener, NULL, NULL, SOCK_CLOEXEC); if (fd < 0) continue;
   struct ucred peer; socklen_t size = sizeof(peer); char input[256], operation[64], supplied[128], extra;
   if (getsockopt(fd, SOL_SOCKET, SO_PEERCRED, &peer, &size) < 0 || peer.uid != getuid()
    || line(fd, input, sizeof(input), 2000) < 0 || sscanf(input, "%63s %127s %c", operation, supplied, &extra) != 2 || strcmp(supplied, token)) {
    close(fd); continue;
   }
   if (!strcmp(operation, "STATUS")) dprintf(fd, "%s %ld\n", committed ? "COMMITTED" : granted ? "RUNNING" : waiting ? "WAITING" : "STARTING", (long)root);
   else if (!strcmp(operation, "GRANT") && waiting && !granted && dead(rootfd) == 0) {
    if (dprintf(channel[0], "GRANT %s\n", token) > 0) { granted = 1; dprintf(fd, "GRANTED %ld\n", (long)root); }
   } else if (!strcmp(operation, "COMMIT") && granted && dead(rootfd) == 0) {
    if (committed || dprintf(channel[0], "COMMIT %s\n", token) > 0) {
     if (channel[0] >= 0) close(channel[0]);
     committed = 1; channel[0] = -1; dprintf(fd, "COMMITTED %ld\n", (long)root);
    }
   } else if (!strcmp(operation, "KILL")) {
    if (close_tree(rootfd) == 0 && closed_receipt(directory, token, root, start) == 0) { closed = 1; dprintf(fd, "CLOSED %ld\n", (long)root); }
    else { failure = 1; dprintf(fd, "UNCONFIRMED %ld\n", (long)root); }
    close(fd); break;
   } else dprintf(fd, "REFUSED %ld\n", (long)root);
   close(fd);
  }
 }
 if (!closed && close_tree(rootfd) == 0 && closed_receipt(directory, token, root, start) == 0) closed = 1;
 if (channel[0] >= 0) close(channel[0]);
 close(rootfd); close(parentfd); close(listener); close(directory);
 (void)failure;
 return closed ? 0 : 5;
}
