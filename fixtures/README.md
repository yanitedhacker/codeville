# Public test fixtures

## Runtime trace fixtures

`runtime/minimal-otlp.json` and `runtime/minimal-otlp.jsonl` are synthetic public test inputs for Runtime Lens. They contain equivalent normalized evidence:

- two traces;
- three spans;
- one recorded error;
- one sensitive `authorization` value that produces one redaction;
- one exact recorded source path, `packages/core/src/runtime/index.ts`.

`minimal-otlp.json` contains one JSON document. `minimal-otlp.jsonl` contains two JSONL documents, one on each non-empty line. Importing either fixture produces equal normalized traces and spans.

These fixtures are not real capture, target execution, field evidence, or qualification evidence.
