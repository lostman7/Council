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
- **Dynamic Seat Registry** editable from the in-app options drawer so each role can be bound to a different Ollama model at runtime.
- **Session seeding** via the input bar start button to kick off a self-running conversation loop, with additional prompts queued through the chat input.

Place Flowfield knowledge files (`.txt`, `.md`, `.pdf`) in `flowfield_docs/` before launch to include them in the vector cache.
