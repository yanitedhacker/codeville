# Security Policy

Report privately. Do not file a public issue for an unpatched vulnerability.

Use [GitHub Security Advisories](https://github.com/yanitedhacker/codeville/security/advisories/new) on `yanitedhacker/codeville`. If that form is not available yet, wait until private vulnerability reporting is on; do not dump a repro in Issues.

## Trust model

codeville is a local developer tool. You point it at a tree you chose. A hostile *input repo* is in scope: XSS in the export HTML, path traversal on the GitHub route, zip bombs, credential leakage into an atlas or the cache. A user pointing it at their own secrets is not a vulnerability. Prompt injection that changes a summary sentence is not XSS.

## In scope

- Export HTML breakout (script escape, `</script>` in excerpts, unexpected network from the standalone page).
- GitHub `ref` tricks and resource exhaustion on `/api/github` (path escape off `codeload.github.com/${owner}/${name}/tar.gz/`, oversized archives, gunzip bombs).
- Credentials written into the atlas, `~/.cache/codeville`, or logs.
- Writes into the analysed repository.

The GitHub route already rejects a `ref` that contains `..`, checks the constructed URL stays on `codeload.github.com` under `/${owner}/${name}/tar.gz/`, refuses archives over 90MB, and caps gunzip output. See [docs/security.md](docs/security.md) for the numbers and the code.

## Out of scope

- Scanner-only findings with no demonstrated impact.
- "I piped a private key into a file and it appeared in an excerpt." That is the product reading the tree you gave it.

## Please include

What you found, a minimal repro against current `main`, and why it crosses a boundary above. We will not argue taste as a CVE.

Expanded threat model: [docs/security.md](docs/security.md).
