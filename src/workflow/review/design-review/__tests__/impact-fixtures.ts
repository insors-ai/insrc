import { designFixture } from './fixtures.js';
import { consolidateDesignReview } from '../results.js';
import type { DesignAttempt, DesignChunkPlan, DesignImpactAssessment } from '../contracts.js';
export function impactFixture(t:Parameters<typeof designFixture>[0],author:'controller'|'daemon'='controller'){
 const f=designFixture(t,author),baseline=structuredClone(f.checkpoint.attempts[0]!);
 const selectors=f.prepared.inventory.units.map(u=>u.id);
 const plan:DesignChunkPlan={chunks:[{id:'keep',title:'Unchanged concern',selectors,concerns:['ownership'],dependsOn:[],purpose:'substantive'},{id:'edit',title:'Corrected concern',selectors,concerns:['correctness'],dependsOn:['keep'],purpose:'substantive'},{id:'final',title:'Consistency',selectors:[],concerns:['consistency'],dependsOn:['keep','edit'],purpose:'consistency'}],coverageExplanation:'All inventory units',finalConsistencyChunkId:'final',coverage:selectors.map(unitId=>({unitId,chunkIds:['keep','edit']}))};
 baseline.reviewer=f.prepared.subject.reviewer;baseline.plan=structuredClone(plan);baseline.completedChunks=plan.chunks.map(c=>({chunkId:c.id,status:'passed',summary:'Accepted deterministic fixture',findings:[],inspectedReferences:[...selectors,f.md,f.path],limitations:[],advice:[]}));baseline.status='passed';
 baseline.report=consolidateDesignReview('review-1',1,f.prepared.subject,baseline.baseline.contentIdentity,plan,baseline.completedChunks);
 const current:DesignAttempt={...structuredClone(f.checkpoint.attempts[0]!),number:2,reviewer:f.prepared.subject.reviewer,preparationKind:'impact'};
 const impact:DesignImpactAssessment={baselineAttempt:1,mode:'affected_chunks',changes:['Corrected concern'],directChunkIds:['edit'],indirectChunkIds:[],rationale:'Ownership unaffected; inspect contract and consistency',chunkMapping:[{priorIds:['keep'],currentIds:['keep'],explanation:'Equivalent ownership'},{priorIds:['edit'],currentIds:['edit'],explanation:'Corrected contract'}],retainedCoverage:[{chunkId:'keep',fromAttempt:1,fromChunkId:'keep',justification:'Equivalent unchanged concern'}],carriedFindingIds:[],consistencyChunkIds:['final']};
 return{...f,baseline,current,plan,impact,history:[baseline]};
}
