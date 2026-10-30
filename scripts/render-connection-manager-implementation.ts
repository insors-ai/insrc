/** Deterministic implementation companions; approved design artifacts remain historical. */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderUxCompanion, renderSequenceCompanion, renderComponentCompanion } from '../src/workflow/artifacts/companion/render.js';
import type { UxDefinition } from '../src/workflow/artifacts/companion/ux.js';
import type { SequenceDefinition } from '../src/workflow/artifacts/companion/sequence.js';
import type { ComponentDependencyDefinition } from '../src/workflow/artifacts/companion/component.js';

const directory='docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S005';
const definitions=JSON.parse(readFileSync(resolve(directory,'implementation-definitions.json'),'utf8')) as {
 uxDefinition:UxDefinition;sequenceDefinition:SequenceDefinition;componentDependencyDefinition:ComponentDependencyDefinition;
};
const opts={repoPath:process.cwd(),header:{projectName:'insrc',workItemId:'S005 implementation',sourceDoc:{id:'Implementation definitions',href:'implementation-definitions.json'},date:'2026-10-30',user:'insrc',contextLine:'Implemented VS Code + JetBrains consumers. Live acceptance pending user manual testing.'}};
const companions=[];
companions.push(await renderUxCompanion(definitions.uxDefinition,'Implemented Connections layout',resolve(directory,'implementation-ux.html'),opts));
companions.push(await renderSequenceCompanion(definitions.sequenceDefinition,'Implemented ownership and recovery',resolve(directory,'implementation-sequence.html'),opts));
companions.push(await renderComponentCompanion(definitions.componentDependencyDefinition,'Implemented client boundaries',resolve(directory,'implementation-components.html'),opts));
writeFileSync(resolve(directory,'implementation-companions.json'),JSON.stringify(companions,null,2)+'\n');
