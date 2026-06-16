# AGENT.md – Working Instructions for the Codex Agent

This repository is maintained using an autonomous coding agent.

## Branch Policy

- All work MUST be done exclusively in the branch: `chatgpt-agentenmodus`
- Never modify files on `master`
- Never commit to `master`, `main`, or any other branch
- Do not create additional branches
- Before making any file change, staging files, or creating a commit, the agent MUST verify the current branch
- If the current branch is not `chatgpt-agentenmodus`, the agent MUST stop and switch to `chatgpt-agentenmodus` first
- Working on `master` is forbidden without exception
- This branch rule overrides any default agent workflow or convenience behavior

## Commit Policy

- The agent MUST commit its own changes
- Do NOT leave uncommitted work behind
- Commits should be logically grouped

### Commit Message Rules

- Language: English only
- Use clear, concise, descriptive messages
- Prefer imperative mood

Examples:
- `Refactor site structure and navigation`
- `Add dataset page rendering av.json documentation`
- `Add modular MapLibre base map example`
- `Integrate logo and update header layout`
- `Add AGENT.md with autonomous commit rules`

## Working Style

- Prefer small, incremental commits
- Each commit should leave the repository in a working state
- Do not introduce build systems or backend code
- Use plain HTML, CSS, and JavaScript only

## MapLibre Skills

- For any MapLibre-related task, load and read relevant skill files before implementation.
- Prefer skills that are already available in the local agent environment.
- Use skill selection by task type:
  - `maplibre-tile-sources`: source/layer setup, blank map debugging, basemap and labels
  - `maplibre-pmtiles-patterns`: PMTiles workflows, static/serverless hosting, MBTiles conversion patterns
  - `maplibre-mapbox-migration`: migration from Mapbox GL JS to MapLibre
- Apply skill guidance as the primary implementation baseline and only add extra research when required by gaps in the skill content.
- Make assumptions explicit when skill guidance does not fully cover edge cases.
- Skills are used from local files, not directly from browser URLs.
- If project-local fallback skill files exist, they may be used as a fallback.
- Do not assume that a project-local fallback path exists unless it is present in the repository.
- Do not hardcode user-specific absolute paths in repository guidance.

## Map Demo Structure

- `maps/map/index.html` is the main Vectormap map and MUST contain the complete current Vectormap feature set.
- Individual map directories in `maps/` should stay focused on one module or one clearly scoped function.
- When adding a new Vectormap module, update the module-specific map and also integrate the function into `maps/map/index.html` when it belongs in the complete example.
- Supplemental or survey-specific maps that are not core Vectormap examples must be kept visibly separate from the regular module examples.
- The AV-WMS survey map is a supplemental product for the SOGI AV-WMS survey and should not be treated as a regular Vectormap module example.

## Content Rules (VERY IMPORTANT)

### Target Audience

- All visible website text (HTML content) is written for **end users and developers visiting the website**
- Text must be **clear, understandable, and user-oriented**
- Do NOT include:
  - internal planning notes
  - references to prompts
  - instructions given to the AI
  - meta explanations about how or why the content was generated

The website must read as if it was written directly for human visitors, not for an AI or internal documentation.

---

### Language Rules

- All website text content MUST be written in **German**
- Code, comments, variable names, and commit messages remain in English
- **The German letter "ß" MUST NOT be used**
  - Always use `ss` instead (e.g. `gross`, `Strasse`, `Massstab`)

---

## Refactoring Rules

- A previous draft exists and may be heavily refactored or removed if needed
- Prioritize clarity, modularity, and extensibility over preserving existing code

## Documentation

- Update or add README files where helpful
- Documentation is developer-focused and may be more technical
- README files may reference configuration, modules, and parameters
- Public website pages must remain end-user-oriented

## Definition of Done

Work is considered complete when:

- All changes are committed to `chatgpt-agentenmodus`
- No file modifications were made on `master`
- The site runs as a static website without a build step
- Public website text is end-user-friendly and contains no internal AI context
- No German "ß" characters appear in HTML content
- MapLibre examples work with placeholder or real data
- Dataset documentation from `av.json` is correctly rendered
- Code structure is clean, modular, and understandable

---

The agent is expected to act autonomously, including making decisions about structure, implementation details, and commit timing, as long as all rules above are respected.
