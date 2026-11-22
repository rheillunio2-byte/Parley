<div align="center">

<img src="images/parley-logo.svg" alt="Parley logo" width="88">

# Contributing to Parley

**Help make agent hand-offs visible.**

<img src="images/parley-typing.svg" alt="One task, delegated to three specialist agents. Agent Cards discovered. Tasks sent. Artifacts returned. Pure Python standard library, nothing to install. Local-first, zero API keys, no cloud." width="80%">

<br>

<a href="#ways-to-help">Ways to help</a> &nbsp;·&nbsp;
<a href="#set-up-in-two-minutes">Set up</a> &nbsp;·&nbsp;
<a href="#recipe-add-a-new-agent">Add an agent</a> &nbsp;·&nbsp;
<a href="#front-end-rules">Front end</a> &nbsp;·&nbsp;
<a href="#the-rules-that-never-bend">Rules</a> &nbsp;·&nbsp;
<a href="#pull-request-checklist">PR checklist</a>

</div>

<img src="images/parley-divider.svg" alt="" width="100%">

Thank you for considering a contribution. Parley is a small project on purpose: a reader should be able to understand the whole thing in an afternoon. Every change is judged by one question: **does this make the agent exchange easier to see and understand, without making the project harder to read or run?**

New here? Fixing a typo, sharpening a sentence in the README, or adding a test are all genuinely valuable first contributions.

## Ways to help

| You want to… | Good starting points |
|---|---|
| **Report a bug** | Something broke, looked wrong, or the animation lied about what the server did. See [Reporting bugs](#reporting-bugs). |
| **Improve the docs** | Unclear wording, a missing step, a diagram that could be better. |
| **Add tests** | Edge cases for `client.py`, `app.py` or the agent server. The suite is small and friendly. |
| **Add an agent** | Follow the [recipe](#recipe-add-a-new-agent). It touches five places and is a great way to learn the codebase. |
| **Polish the UI** | New states, better mobile layout, accessibility fixes, calmer or livelier motion. |
| **Pick from the roadmap** | The README roadmap lists ideas nobody has built yet. Open an issue first to claim one. |

> [!TIP]
> For anything bigger than a small fix, open an issue first and describe what you want to change and why. It saves you from building something that does not fit.

## Set up in two minutes

You need **Python 3.10 or newer** and a browser. There is nothing to install: no `pip`, no npm, no build step.

```bash
# 1. Fork and clone, then enter the project folder
cd a2a_demo

# 2. Start the four services (coordinator on 18100, agents on 18101-18103)
python run.py

# 3. Open the dashboard
#    http://127.0.0.1:18100
```

Edit a file in `web/` and refresh the page; assets are served with `Cache-Control: no-store`, so you always get the latest. Python changes need a restart of `python run.py`.

**Run the tests before you start and before you push:**

```bash
python -m unittest discover -s tests -v
```

The tests start their own services on ports `18200` to `18203`, so they run fine next to a live demo.

**Run a single agent on its own** (handy when debugging):

```bash
python agents/server.py research 18101     # or: analysis, writer
curl http://127.0.0.1:18101/.well-known/agent-card.json
```

## Project map

```text
client.py          discovery + delegation: the "client agent" logic
agents/server.py   a tiny JSON-RPC agent, configured by the AGENTS table
app.py             coordinator web server (UI, static files, /api/run, /api/run-stream)
run.py             starts the coordinator and the three agents
web/index.html     dashboard markup
web/styles.css     theme, panels, status marks
web/grid.js        SignalGrid: canvas background, rails and packets
web/fx.js          text and UI effects
web/app.js         workflow choreography, trace, artifact tabs
tests/             unittest suite
images/            README artwork (SVG)
```

Keep the layers separate. `agents/server.py` must not know about the UI, `client.py` must not know about HTTP serving, and `web/` must not know about Python. If a change needs to break that, say why in the PR.

<img src="images/parley-divider.svg" alt="" width="100%">

## Recipe: add a new agent

Adding a fourth agent touches five places. Here is the order that works.

<details>
<summary><b>Show the step-by-step recipe</b></summary>

<br>

**1. Define it: `agents/server.py`**

Add an entry to the `AGENTS` table (`name`, `description`, and one `skill` with `id`, `name`, `description`), then add a branch for its key in `execute(kind, text)`. Keep it deterministic and dependency-free. The artifact will be named `<key>-result.txt` automatically.

**2. Start it: `run.py`**

Add `("yourkey", 18104)` to `SERVICES` and update the two printed lines that list the services and ports. Pick the next free port in the `18100` range.

**3. Delegate to it: `client.py`**

Add the key and URL to `AGENT_URLS`, and add the key to the tuple in `run_workflow`'s `for key in (...)` loop. **The order of that tuple is the order of the chain**: each agent receives the previous agent's artifact.

**4. Show it: `web/`**

- `index.html`: copy one of the agent `<article class="node spot">` blocks. Use the ids `node-<key>` and `chips-<key>`.
- `app.js`: add the key to `KEYS`, to the `nodes` map, and give it a colour in `HUES`.
- `styles.css`: the agent row is `grid-template-columns: repeat(3, 1fr)`; change the count (and check the mobile breakpoint).

Rails and packets need no extra code: `grid.connect` runs over `KEYS`.

**5. Prove it: `tests/test_workflow.py`**

Start one more test server in `setUpClass`, extend the expected event list in the streaming test, and extend the key set in the workflow test.

Finally update the agent tables in `README.md` and the architecture artwork in `images/` if the diagram no longer matches.

</details>

## Front-end rules

The dashboard is plain HTML, CSS and JavaScript with **no dependencies and no build step**. That is a feature.

- **No libraries, no CDNs, no external fonts.** The page must work offline.
- **Respect `prefers-reduced-motion`.** Every new animation needs a calm fallback. `grid.js` and `fx.js` already show the pattern.
- **Animations should mean something.** If a packet moves, it is because a real event arrived. Please do not add motion that implies activity that is not happening.
- **Keep it accessible.** Semantic elements, labels on controls, visible focus, keyboard-operable widgets, and an ARIA live region for progress. Text must stay readable over the grid.
- **Performance budget.** The canvas should idle at zero cost: no `requestAnimationFrame` loop when nothing is animating. Cap device pixel ratio at 2.
- **Never use `innerHTML` with server or user text.** Use `textContent` and DOM APIs. The trace and report render untrusted strings.
- **Check three widths.** About 1280px, about 800px, and about 390px.

## Back-end rules

- **Python standard library only.** A new third-party dependency needs an issue and a very good reason.
- **Python 3.10 compatible.** No syntax or APIs that need a newer version.
- **Bind to `127.0.0.1`.** Never `0.0.0.0` in code that ships.
- **Keep handlers small and boring.** Validate input, return JSON errors with the right status code, never leak tracebacks to the client.
- **Static serving stays confined.** `serve_static` only serves allow-listed extensions from inside `web/`. If you touch it, extend the traversal test.

## The rules that never bend

<table>
<tr>
<td width="50%" valign="top">

### Originality

All code here is written for this project. You may take **inspiration** from other projects and sites, but do not copy their code, shaders, or assets.

If you must include third-party material, you need an issue, a compatible license, and attribution in the PR **before** it is merged.

</td>
<td width="50%" valign="top">

### Honesty

Parley never pretends. The agents are deterministic text rules, not AI, and the docs say so. Do not add copy that implies intelligence, accuracy, or protocol conformance the code does not have.

</td>
</tr>
<tr>
<td width="50%" valign="top">

### Local only

No network calls to anything outside the machine. No telemetry, no analytics, no remote fonts or scripts, no API keys required for the default mode.

</td>
<td width="50%" valign="top">

### Safe by default

No `eval`, no shell calls built from input, no writing outside the project, no widening of CORS or bind addresses. These services have no authentication and must never be exposed to a network.

</td>
</tr>
</table>

## Code style

- **Python:** readable over clever. Descriptive names, short functions, docstrings where intent is not obvious. Match the surrounding style.
- **JavaScript:** `'use strict'`, no globals beyond the documented ones (`SignalGrid`, `FX`, `grid`), small functions, comments that explain *why*.
- **CSS:** tokens live on `:root`. Reuse them instead of hard-coding new colours.
- **SVG artwork:** self-contained, valid XML, no external references, animations via SMIL or CSS only (they must run when the file is embedded with `<img>`), and a meaningful `aria-label` or `role="presentation"`.
- **Docs:** plain, specific, honest. Prefer a table or a short list over a wall of text.

## Commits and branches

**Branches:** `feat/short-name`, `fix/short-name`, `docs/short-name`, `test/short-name`.

**Commits** follow [Conventional Commits](https://www.conventionalcommits.org/):

```text
feat(grid): add keyboard-triggered ripple
fix(app): reject topics longer than the limit with a 400
docs(readme): clarify how the chain order is set
test(stream): cover the error event
```

Keep each commit focused. A reviewer should be able to read the diff and the message and understand both.

## Pull request checklist

Copy this into your PR description:

```markdown
## What and why
<!-- One or two sentences. Link the issue. -->

## Checklist
- [ ] `python -m unittest discover -s tests -v` passes
- [ ] New behaviour has a test (or I explained why it does not)
- [ ] No new dependencies, no external network requests
- [ ] No code copied from other projects; any inspiration is described below
- [ ] UI changes checked at ~1280px, ~800px and ~390px
- [ ] Animations have a `prefers-reduced-motion` fallback
- [ ] Docs and README tables updated if behaviour or ports changed
- [ ] Screenshots or a short screen recording attached for visual changes
```

## Reporting bugs

Please include:

1. **What you did** (the exact task text if it matters).
2. **What you expected** and **what happened**.
3. **Environment:** OS, Python version (`python --version`), browser and version.
4. **Evidence:** terminal output, browser console errors, and for visual bugs a screenshot or recording.
5. Whether `python -m unittest discover -s tests` passes on your machine.

## Suggesting features

Describe the problem first, then your idea. Say how it keeps the project small, local and honest. Mockups and sketches are welcome.

## Community standards

Be kind, be specific, assume good faith. Critique code and ideas, never people. Welcome beginners; Parley is a learning project and "I do not understand this part" is a useful review comment. Harassment, personal attacks and discrimination are not tolerated, and maintainers may remove comments or contributors that cross the line.

## Reviews and licensing

A maintainer will review your PR, usually asking for small changes before merging. Please be patient and keep the conversation in the PR so others can learn from it.

This repository does not have a license file yet. Until one is chosen, please open an issue before contributing anything substantial. Once a license is added, contributions will be accepted under it.

<img src="images/parley-divider.svg" alt="" width="100%">

<div align="center">

<img src="images/parley-footer.svg" alt="Parley: agents that talk, tasks that travel." width="100%">

<sub>Thanks for helping make the conversation between agents visible.</sub>

</div>
