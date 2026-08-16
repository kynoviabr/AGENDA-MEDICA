import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { AiEvaluationRunner } from '../src/ai/evaluation/runner.ts';
import { AI_EVALUATION_DATASET_V1, AI_EVALUATION_FAST_V1 } from '../src/ai/evaluation/datasets/v1/index.ts';
import { DeterministicAuraEvaluationSubject } from '../src/ai/evaluation/testing/DeterministicAuraEvaluationSubject.ts';
import { formatAiEvaluationConsoleReport, serializeAiEvaluationJsonReport } from '../src/ai/evaluation/reporters.ts';
import type { AiEvaluationBaseline } from '../src/ai/evaluation/baselines.ts';

const suite = process.argv[2] === 'fast' ? 'fast' : process.argv[2] === 'model' ? 'model' : 'full';
if (suite === 'model') {
  const enabled = process.env.AURA_AI_MODEL_EVAL_ENABLED === 'true' && Boolean(process.env.OPENAI_API_KEY);
  if (!enabled) {
    console.log('AI model evaluation: SKIPPED (set AURA_AI_MODEL_EVAL_ENABLED=true and OPENAI_API_KEY).');
    process.exit(0);
  }
  console.error('AI model evaluation adapter is gated and intentionally deferred; deterministic safety gates remain authoritative.');
  process.exit(2);
}

const root = process.cwd();
const baselinePath = resolve(root, 'src/ai/evaluation/baselines/v1-approved.json');
let baseline: AiEvaluationBaseline | undefined;
try { baseline = JSON.parse(await readFile(baselinePath, 'utf8')) as AiEvaluationBaseline; } catch { baseline = undefined; }

const scenarios = suite === 'fast' ? AI_EVALUATION_FAST_V1 : AI_EVALUATION_DATASET_V1;
const result = await new AiEvaluationRunner(new DeterministicAuraEvaluationSubject())
  .run(scenarios, { suite, baseline: suite === 'full' ? baseline : undefined });
const artifactDirectory = resolve(root, 'artifacts/ai-evals');
await mkdir(artifactDirectory, { recursive: true });
await writeFile(resolve(artifactDirectory, `${suite}-latest.json`), serializeAiEvaluationJsonReport(result), 'utf8');
console.log(formatAiEvaluationConsoleReport(result));
if (!result.passedQualityGates) process.exitCode = 1;
