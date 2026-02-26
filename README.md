# Council

Standalone multi-AI chatroom environment bootstrapped as an offline Electron application.

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```
2. Launch the application:
   ```bash
   npm start
   ```

Ensure a local Ollama instance is running on `http://localhost:11434` with the seat models, embedding model, and summarizer available.

## Features

- **Living Throne** orchestrator that rotates through the configured Council seats, maintains RAM-disk backed bubbles, and loops autonomously once a session seed is provided.
- **Flowfield retrieval** layer that embeds documents from `./flowfield_docs` into a RAM-disk vector cache for contextual prompts.
- **Optical Thinker** summarizer that condenses Throne logs periodically and on-demand.
- **Council Vision HUD** showing seat activity, active topic, RAM/GPU usage, token estimates, pool models, and last summary timestamp with an in-app log drawer.
- **Expanded Persona Registry** auto-detects every persona JSON in `./personas/`, lets you enable or disable seats before a session, and persists model bindings in `~/.council_config.json`.
- **Rotating model pools** automatically cycle each seat through a curated list of Ollama models unless you lock a manual override in the options drawer.
- **Council Exporter** button in the HUD that writes the current transcript plus RAM-disk bubbles to `archive/exports/` for archival or sharing.
- **Session seeding** via the input bar start button to kick off a self-running conversation loop, with additional prompts queued through the chat input.
- **Continuum Recall** persists the latest topic, seat roster, and harmonic weights so the Council resumes mid-conversation on next launch.

## Codex Summary Template

After every build or change, append a short report so Noirion Zeal can audit what changed and why:

```
Summary

    Implemented Continuum Recall system to persist Council state (topic, seats, harmony) in /archive/continuum_state.json.
    Patched main.js to load the last topic at boot and resume discussion if found.
    Updated throne.js to snapshot state after each iteration.
    Purpose: ensure persistent memory between sessions; Council now "wakes up mid-conversation".

Snippet

    [Continuum] State saved: Flowfield baseline...
    [Continuum] Recalled: Flowfield baseline...
```

Use your own wording for the summary entries, but always include at least three bullet points and a small log snippet that proves the behavior.

Place Flowfield knowledge files (`.txt`, `.md`, `.pdf`) in `flowfield_docs/` before launch to include them in the vector cache.


## Diagnostics

Run a quick health report before starting Electron:

```bash
npm run doctor
```

This prints the current seat execution plan, disabled seats, Thinker embedding lock, and detected Ollama pool count.
