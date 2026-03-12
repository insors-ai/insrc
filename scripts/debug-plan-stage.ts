#!/usr/bin/env tsx
/**
 * Debug script: runs Analyze + Plan stages and dumps raw LLM responses.
 * Tests the real user flow: short prompt + attached reference document.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadConfig } from '../src/agent/config.js';
import { OllamaProvider } from '../src/agent/providers/ollama.js';
import { runAnalyze } from '../src/agent/pipeline/analyze.js';
import { runPlan } from '../src/agent/pipeline/plan-steps.js';
import { shimLogger } from '../src/agent/pipeline/types.js';
import type { PipelineConfig } from '../src/agent/pipeline/types.js';

const config = loadConfig();
const local = new OllamaProvider(config.models.local, config.ollama.host, config.models.context.local);
const ctx = config.models.context;

// Short user prompt — the real use case
const userMessage = `Create a design document for the insrc CLI — the terminal interface for the insrc AI coding agent. Use the attached VS Code plugin design as a reference for structure, depth, and visual style. The CLI has two modes: interactive REPL and one-shot commands, both connecting to the same daemon backend.`;

// Attached reference document
const referenceDoc = readFileSync(resolve('design/vscode-plugin.html'), 'utf-8');

const designConfig: PipelineConfig = {
  type: 'design',
  analyzePrompt: '',
  planPrompt: '',
  sketchPrompt: '',
  enhancePrompt: '',
  assemblyStrategy: 'concatenate',
  alwaysEnhance: true,
};

const logger = shimLogger((msg) => console.log(msg));

async function main() {
  console.log('=== Stage 1: Analyze ===\n');
  console.log(`Input: ${userMessage.length} chars prompt + ${referenceDoc.length} chars reference doc`);
  console.log(`Estimated tokens: ${Math.ceil((userMessage.length + referenceDoc.length) / 3)}\n`);

  const analysis = await runAnalyze(
    userMessage, '', referenceDoc, local, ctx, logger,
  );

  console.log(`\nElements: ${analysis.elements.length}`);
  console.log(`Requirements: ${analysis.requirements.length}`);
  console.log(`Scope: ${analysis.scope}`);
  console.log(`Format: ${analysis.outputFormat}`);
  console.log(`Condensed: ${analysis.condensed.slice(0, 300)}...\n`);

  console.log('--- Elements ---');
  for (let i = 0; i < analysis.elements.length; i++) {
    const el = analysis.elements[i]!;
    console.log(`  ${i}. [${el.kind}] ${el.title}`);
    console.log(`     ${el.content.slice(0, 150)}${el.content.length > 150 ? '...' : ''}`);
  }

  console.log('\n=== Stage 2: Plan ===\n');
  const plan = await runPlan(analysis, designConfig, local, ctx, logger);

  console.log(`\nSteps: ${plan.steps.length}`);
  console.log('--- Steps ---');
  for (const step of plan.steps) {
    console.log(`  ${step.index}. ${step.title}`);
    console.log(`     prompt: ${step.prompt.slice(0, 150)}${step.prompt.length > 150 ? '...' : ''}`);
    console.log(`     requirements: [${step.requirementIndices.join(', ')}]`);
    console.log(`     needsEnhance: ${step.needsEnhance}`);
  }
}

main().catch(console.error);
