# @insrc/project-memory

Independent Node 22 ESM project-memory module. The S1 foundation provides public contracts and embedded lifecycle; durable ingestion, Lance storage, semantic processing, recall and IPC belong to later stories. Data methods remain explicitly unavailable until implemented.

The public import performs no I/O. Host policy, models, logging, limits and a dedicated data directory are supplied explicitly. No daemon, index store or backend source is required.

Native ownership uses fs-ext 2.1.1. Building from source requires Python, make, a C++ compiler, Node 22 headers and C++17. On macOS use `CXXFLAGS=-std=c++17 npm ci` (or `CXXFLAGS=-std=c++17 npm rebuild fs-ext`) under Node 22; the compiler default is insufficient on the qualification machine. The external-consumer test must reproduce this documented prerequisite. Linux qualification remains pending until its required tests run.
