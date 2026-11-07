# BastillaOS

BastillaOS is a Debian 13 (Trixie) Stable amd64 Live installer with KDE Plasma,
the Bastilla visual identity, and the existing SVL system installed as a local
system service. It is a bootable Linux distribution project, not a web-only
reskin.

## Build requirements

- Linux amd64 host (or GitHub Actions runner) with Docker Engine access,
  permission to run privileged build containers, and a glibc-based Node runtime.
- Node.js 22 or later and npm.
- Bash, `dpkg-deb`, and `sha256sum` on the host.
- Internet access for Debian repositories, npm, and the Debian live-build
  container.
- Approximately 20 GB of free build storage; a KDE installer ISO is large.

The ISO build uses Docker so the Debian live-build tools run on Debian 13 rather
than inheriting Ubuntu or another host's build environment.

## Build an installable ISO

From the repository root:

```sh
bash bastillaos/build-iso.sh
```

The user running the build needs permission to access the Docker daemon, which
launches a privileged but disposable Debian build container. The host-side Node,
npm, and Debian package preparation do not require running `npm` as root.

The script builds the existing React application, compiles its production
server, creates the `bastillaos-system` Debian package, and builds the
Debian Live installer with the repository's live-build configuration. On
success it produces:

- `bastillaos/build/BastillaOS-13-amd64.iso`
- `bastillaos/build/BastillaOS-13-amd64.iso.sha256`

The installer image is built from the current Debian Trixie repositories,
includes KDE Plasma 6 and the official Debian live installer, and supports
amd64 UEFI and legacy BIOS boot.
The image also sets unattended Debian security upgrades, a deny-incoming UFW
firewall policy, and conservative kernel/network sysctl defaults.

GitHub Actions can build the same ISO on demand via **Build BastillaOS Debian
Live ISO → Run workflow**. Pushing a `bastillaos-v*` tag also builds and
publishes the ISO and checksum as a workflow artifact. CI does not commit
generated binaries to the source repository. The workflow frees runner disk
space and syntax/config-checks the build inputs before the full build; after a
successful build, the build script removes root-owned live-build temporaries
via the builder container. Failed builds retain that temporary tree for
diagnosis.

## Boot and install

Write the ISO to a USB drive with a trusted image writer, or attach it to an
amd64 virtual machine configured for UEFI. Back up files before installation:
installing an operating system can erase disk contents. Start the live session,
review the installer partition choices, and explicitly select the target disk.
The installed system starts the local SVL service as `root` so Triad agents can
perform system-level changes. The root-privileged HTTP API is bound to
`127.0.0.1:3000`; do not expose it to a network. Any local process that can
reach this API can execute root commands. The desktop opens using Chromium.

Configure `/etc/bastillaos/system.env` as a root-owned file (`chmod 0600`) and
restart `bastillaos-svl-system` when setting optional runtime credentials. The
service reads this file as root; never make it writable by the desktop user,
and never put API secrets in a Git-tracked file or a public ISO. Optional
Pollinations credentials are used only by the image-generation endpoint. The
service unit fixes its listener to `127.0.0.1:3000` after reading this file, so
the bind address cannot be changed there.

## without_nlp engine

The deterministic Euler & Fourier harmonic engine (`apps/without_nlp`) is
installed as a native system component by the `bastillaos-system` package:

- `/usr/bin/without-nlp` — command-line engine (Python 3 standard library
  only, no network, no NLP/LLM model). Examples:
  `without-nlp "Tekst"`, `echo Tekst | without-nlp -`,
  `without-nlp --omega 2.0 --t 0.5 Tekst`, `without-nlp --decode 0.6797`,
  `without-nlp --status`.
- KDE menu entry **without_nlp**, which opens the BastillaOS desktop directly
  on the engine view (`http://127.0.0.1:3000/?view=without_nlp`).
- The local API keeps serving `GET /api/without_nlp/status` and
  `POST /api/without_nlp/analyze`.
- Engine selection: chat uses local Ollama and optional OpenAI API
  (`LLM_PROVIDERS="openai,ollama"`). Without `OPENAI_CHAT_API_KEY`, OpenAI is
  skipped. `CHAT_LOCAL_FALLBACK="on"` enables deterministic without_nlp replies
  after provider failures; otherwise the chat reports the error.
- Triad chat (`POST /api/triad/message`) is free conversation with the Triad.
  Each agent uses the configured Ollama or OpenAI API provider; local without_nlp
  is an explicit fallback. The server does not silently switch between provider
  modes selected by the operator.
  `bash scripts/setup-ollama.sh` installs Ollama and pulls `llama3.2-vision:11b` by
  default (pass a model tag to select another), tunes the Ollama server (flash
  attention, q8_0 KV cache, keep-alive, parallel requests when memory allows),
  warms the model, measures tokens/s, and writes the settings to the env file.
  The SVL server also preloads the model at start (`[OLLAMA] Model … loaded`).
- Triad mission **Optymalizacja i konfiguracja Ollamy** (`POST
  /api/astyria/mission` with `{"action":"ollama_optimize"}`, also in the
  mission selector): the server warms the model, measures tokens/s, and
  collects version, models, memory placement and host resources; Alex
  (infrastructure), Astyria (performance) and Aurelius (stability/security)
  each post a report with rule-based recommendations plus a short model
  comment. Recommended commands are shown to the operator and are never run
  automatically; commands in model comments are dropped. Put the
  keys in `/etc/bastillaos/system.env` (root-owned, `chmod 0600`).

The Python and TypeScript engines encode Unicode code points identically, so
the CLI, API and desktop view return the same coefficients and harmonics.

## Deterministic agent protocol

The local Triad command interface uses `POST /api/triad/command`. It accepts
only the finite, structured command set declared in
`src/kernel/agentProtocol.ts`: `SYSTEM_STATUS`, `DATA_STORE_AUDIT`,
`VERSION_TIMELINE`, and `SIGNAL_ANALYSIS`. Requests include an `agent` value
(`triad`, `Alex`, `Astyria`, or `Aurelius`); signal analysis also requires a
typed `payload.signal` and accepts optional numeric `omega` and `time` fields.
Unknown commands and fields are rejected. The protocol does not interpret
free-form instructions or require a generative text provider. Successful
responses contain structured agent replies and the resulting system state;
the application persists the protocol transcript.

## Preserved SVL functionality

The Debian package carries the existing built web system and writable runtime
data, including the deterministic Triad command interface, Astyria mission
tooling, terminal, system diagnostics and telemetry, kernel and DATA_STORE,
history and snapshots, file explorer, Apps Studio, without_nlp engine, 3D
visualizations, image generation, and GitHub integration. The service binds to
loopback only. Existing app data is preserved when the Debian package is
upgraded.
