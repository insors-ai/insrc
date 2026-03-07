import { homedir } from 'node:os';
import { join } from 'node:path';

const INSRC_DIR = join(homedir(), '.insrc');

export const PATHS = {
  insrc:     INSRC_DIR,
  graph:     join(INSRC_DIR, 'graph'),   // Kuzu — Code Knowledge Graph
  lance:     join(INSRC_DIR, 'lance'),   // LanceDB — entity store + embeddings
  pidFile:   join(INSRC_DIR, 'daemon.pid'),
  sockFile:  join(INSRC_DIR, 'daemon.sock'),
  logDir:    join(INSRC_DIR, 'logs'),
  daemonLog: join(INSRC_DIR, 'logs', 'daemon.log'),
} as const;
