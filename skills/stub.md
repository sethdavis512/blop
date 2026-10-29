---
name: blop
description: Use the blop code generator. Use when the user wants to scaffold files with a generator from this project's blop.config.ts, or to add or change a generator (run `blop schema` to see them).
---

# blop

`blop` is installed on this machine. Its instructions ship inside the binary, so they always match the installed version.

Before you first use it in a session, run:

```bash
blop skills get core
```

Then use `blop schema` to list the generators and their flags, and `blop skills get config` before writing a generator. Always pass `--json` and `--non-interactive`, and preview with `--dry-run` before writing files.
