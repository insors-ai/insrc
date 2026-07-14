/**
 * CLI setup command — detect hardware, recommend models, write config.
 *
 * Usage:
 *   insrc setup             Interactive setup with hardware detection
 *   insrc setup --detect    Show system info only (no config changes)
 *   insrc setup --recommend Show recommendations only (no config changes)
 *   insrc setup --apply     Apply recommended config without prompting
 */

import { getSystemInfo } from '../../shared/system-info.js';
import { recommendModels, toConfig, type ModelRecommendation } from '../../shared/model-recommender.js';
import { PATHS } from '../../shared/paths.js';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';

export async function setupCommand(opts: {
  detect?: boolean;
  recommend?: boolean;
  apply?: boolean;
}): Promise<void> {
  const info = getSystemInfo();

  // --detect: show system info only
  if (opts.detect) {
    printSystemInfo(info);
    return;
  }

  const rec = recommendModels(info);

  // --recommend: show recommendation only
  if (opts.recommend) {
    printSystemInfo(info);
    console.log('');
    printRecommendation(rec);
    return;
  }

  // Full interactive or --apply
  printSystemInfo(info);
  console.log('');
  printRecommendation(rec);
  console.log('');

  if (opts.apply) {
    applyConfig(rec);
    await pullModels(rec);
    return;
  }

  // Interactive: ask user
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>(resolve => {
    rl.question('Apply this configuration? [Y/n] ', resolve);
  });
  rl.close();

  if (answer.toLowerCase() !== 'n') {
    applyConfig(rec);
    await pullModels(rec);
  } else {
    console.log('Setup cancelled. You can edit ~/.insrc/config.json manually.');
  }
}

function printSystemInfo(info: ReturnType<typeof getSystemInfo>): void {
  console.log('━━━ System Info ━━━');
  console.log(`  CPU:    ${info.cpu.model} (${info.cpu.cores} cores)`);
  console.log(`  RAM:    ${Math.round(info.ram.totalMb / 1024)}GB total, ${Math.round(info.ram.freeMb / 1024)}GB free`);

  if (info.gpu) {
    console.log(`  GPU:    ${info.gpu.name}`);
    console.log(`  VRAM:   ${Math.round(info.gpu.vramMb / 1024)}GB total, ${Math.round(info.gpu.vramFreeMb / 1024)}GB free`);
    if (info.gpu.cuda) console.log(`  CUDA:   ${info.gpu.cuda}`);
  } else {
    console.log(`  GPU:    none detected`);
  }

  console.log(`  Ollama: ${info.ollama.available ? `v${info.ollama.version} (${info.ollama.models.length} models)` : 'not found'}`);

  if (info.ollama.models.length > 0) {
    console.log('  Models installed:');
    for (const m of info.ollama.models) {
      const sizeMb = Math.round(m.size / (1024 * 1024));
      console.log(`    ${m.name} (${m.parameterSize}, ${m.quantization}, ${sizeMb}MB)`);
    }
  }
}

function printRecommendation(rec: ModelRecommendation): void {
  console.log(`━━━ Recommendation (${rec.tier}) ━━━`);
  console.log(`  Coder:     ${rec.coder.model} (${rec.coder.params})${rec.coder.pull ? ' ← needs pull' : ''}`);
  console.log(`  Embedding: ${rec.embedding.model} (${rec.embedding.dims} dims)${rec.embedding.pull ? ' ← needs pull' : ''}`);
  console.log(`  Context:   ${rec.context.shape} (${rec.context.tokens} tokens)`);
  console.log(`  Max output: ${rec.context.maxOutput} tokens`);
  console.log('');
  console.log('  Notes:');
  for (const note of rec.notes) {
    console.log(`    • ${note}`);
  }

  // Ollama optimizations
  if (rec.ollamaOptimizations.length > 0) {
    console.log('');
    console.log(`━━━ Ollama Optimizations (${rec.ollamaOptimizations.length}) ━━━`);
    for (const opt of rec.ollamaOptimizations) {
      const icon = opt.impact === 'high' ? '🔴' : opt.impact === 'medium' ? '🟡' : '🟢';
      console.log(`  ${icon} ${opt.issue}`);
      console.log(`     Fix: ${opt.fix}`);
      console.log(`     Run:`);
      for (const line of opt.command.split('\n')) {
        console.log(`       ${line}`);
      }
      console.log('');
    }
  }
}

function applyConfig(rec: ModelRecommendation): void {
  const recommended = toConfig(rec);

  // Merge with existing config (preserve keys, custom settings)
  let existing: Record<string, unknown> = {};
  if (existsSync(PATHS.config)) {
    try {
      existing = JSON.parse(readFileSync(PATHS.config, 'utf-8')) as Record<string, unknown>;
    } catch { /* start fresh */ }
  }

  // Deep merge: recommended values as defaults, existing values take precedence for keys/permissions/routing
  const merged = {
    ...recommended,
    ...existing,
    models: {
      ...recommended.models,
      ...(existing['models'] as Record<string, unknown> ?? {}),
      // Always update these from recommendation
      local: recommended.models.local,
      embedding: recommended.models.embedding,
      embeddingDim: recommended.models.embeddingDim,
      context: recommended.models.context,
      // Preserve existing tiers if set
      tiers: {
        ...recommended.models.tiers,
        ...((existing['models'] as Record<string, unknown> ?? {})['tiers'] as Record<string, unknown> ?? {}),
      },
    },
  };

  writeFileSync(PATHS.config, JSON.stringify(merged, null, 2) + '\n', 'utf-8');
  console.log(`\n✓ Config written to ${PATHS.config}`);
}

async function pullModels(rec: ModelRecommendation): Promise<void> {
  const { execSync } = await import('node:child_process');

  const toPull: string[] = [];
  if (rec.coder.pull) toPull.push(rec.coder.model);
  if (rec.embedding.pull) toPull.push(rec.embedding.model);

  if (toPull.length === 0) {
    console.log('✓ All recommended models already installed.');
    return;
  }

  for (const model of toPull) {
    console.log(`\nPulling ${model}...`);
    try {
      execSync(`ollama pull ${model}`, { stdio: 'inherit', timeout: 600_000 });
      console.log(`✓ ${model} pulled successfully.`);
    } catch (err) {
      console.error(`✗ Failed to pull ${model}: ${err}`);
    }
  }
}
