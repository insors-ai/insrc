import { homedir } from 'node:os';
import { join } from 'node:path';

const INSRC_DIR = join(homedir(), '.insrc');
const LOG_DIR   = join('/tmp', '.insrc');

export const PATHS = {
  insrc:       INSRC_DIR,
  config:      join(INSRC_DIR, 'config.json'),
  graph:       join(INSRC_DIR, 'graph'),   // Kuzu — Code Knowledge Graph
  lance:       join(INSRC_DIR, 'lance'),   // LanceDB — entity store + embeddings
  configStore: join(INSRC_DIR, 'config-store'), // LanceDB — config entry store
  templates:   join(INSRC_DIR, 'templates'),    // global config templates
  feedback:    join(INSRC_DIR, 'feedback'),     // global config feedback
  conventions: join(INSRC_DIR, 'conventions'),  // global config conventions
  pidFile:     join(INSRC_DIR, 'daemon.pid'),
  sockFile:    join(INSRC_DIR, 'daemon.sock'),
  agents:      join(INSRC_DIR, 'agents'),          // agent run storage
  agentIndex:  join(INSRC_DIR, 'agents', 'index.json'),
  logDir:      LOG_DIR,
  daemonLog:   join(LOG_DIR, 'daemon.log'),
  agentLog:    join(LOG_DIR, 'agent.log'),
} as const;
