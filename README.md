# Engineer Lab

Hands-on systems labs organized by technology.

Every technology has two tracks:

- `reimplement/` — a Go workspace for a deliberately reduced, from-scratch implementation of the system's important internals. It is for learning the design, not for making a compatible replacement.
- `on-production/` — experiments that run the real technology. Create each experiment as `YYYY-MM-DD-experiment-name/` and record the hypothesis, configuration, observations, and outcome.

Run a reimplementation development container with `docker compose up -d` from its `reimplement/` directory. Production templates live in `on-production/template/`; copy one into a dated experiment directory before changing it.
