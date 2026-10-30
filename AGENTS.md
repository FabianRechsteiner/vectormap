# AGENTS.md – Vectormap Coding Agent

## 1. Project

Vectormap is a static website built with HTML, CSS, JavaScript, and MapLibre GL JS.

The repository contains the main Vectormap application, individual MapLibre examples, and dataset documentation.

The coding agent must prioritize correctness, maintainability, and efficient execution.

## 2. Branch Policy (Mandatory)

All work MUST be performed exclusively on:

`chatgpt-agentenmodus`

Rules:

- Never modify or commit files on `master` or `main`.
- Never create additional branches.
- Verify the current branch before modifying files.
- If the current branch is incorrect, switch to `chatgpt-agentenmodus` before proceeding.
- If switching is unsafe because of uncommitted changes, stop and report the issue.
- Never discard or overwrite existing user changes.
- Do not switch branches unnecessarily.

The branch policy overrides all other workflow instructions.

## 3. Commit Policy

The agent MUST commit its own completed changes.

Rules:

- Commit only files belonging to the current task.
- Never include unrelated user changes.
- Use small, logical commits.
- Each commit should leave the affected functionality in a working state.
- Use English commit messages.
- Prefer concise, descriptive, imperative messages.
- Do not create empty commits.
- Verify the working tree before staging and committing.

Example:

`Add historical dataset navigation`

Do not run redundant Git checks after every read-only operation.

## 4. Technology

Use only:

- HTML
- CSS
- JavaScript
- MapLibre GL JS
- Existing project dependencies

Do not introduce:

- Build systems
- Backend services
- Unnecessary dependencies
- New frameworks without explicit approval

Prefer existing code patterns and reusable functions.

Avoid unnecessary architectural changes.

## 5. Token-Efficient Workflow (Important)

Minimize unnecessary context, tool calls, and repeated analysis.

### Repository Exploration

- Start with the files explicitly mentioned in the task.
- Read only relevant files and sections.
- Prefer targeted searches over repository-wide searches.
- Search filenames before reading file contents.
- Avoid reading large files completely when only specific functions are relevant.
- Exclude generated files, binary assets, caches, and large datasets from searches.
- Do not repeatedly inspect files that have already been analyzed unless they changed.

### Implementation

- Focus exclusively on the requested functionality.
- Prefer minimal, targeted modifications.
- Reuse existing code and project conventions.
- Avoid unrelated refactoring.
- Do not reformat unaffected files.
- Do not add unnecessary abstractions.
- Do not create documentation unless relevant to the change.

### Testing

- Run the smallest relevant tests first.
- Avoid repeatedly executing identical tests without changes.
- Do not test unrelated modules.
- Run broader tests only when changes affect shared functionality.
- Report tests that could not be executed.

### Communication

- Keep responses concise.
- Do not repeat task descriptions.
- Avoid lengthy explanations of obvious implementation details.
- Do not output entire modified files unless requested.
- Provide one short final summary.

## 6. MapLibre Skills

Use existing MapLibre skills when they provide relevant technical guidance.

Available skills:

- `maplibre-tile-sources`
- `maplibre-pmtiles-patterns`
- `maplibre-mapbox-migration`

Rules:

- Select skills according to the actual task.
- Read only the necessary skill instructions and references.
- Do not load all MapLibre skills automatically.
- Do not reload unchanged skill content unnecessarily within the same task.
- Prefer existing project conventions when no additional guidance is needed.
- Use local skill files where available.
- Do not assume fallback paths exist.
- Do not hardcode user-specific absolute paths.

Skill selection:

- Tile sources, layers, basemaps: `maplibre-tile-sources`
- PMTiles integration and hosting: `maplibre-pmtiles-patterns`
- Mapbox migration: `maplibre-mapbox-migration`

For small changes that do not require MapLibre-specific guidance, avoid unnecessary skill loading.

## 7. Map Demo Structure

Main application:

`maps/map/index.html`

Rules:

- The main application contains the complete current Vectormap feature set.
- Individual directories in `maps/` demonstrate specific modules.
- New core modules should be integrated into the main application.
- Update module examples only when affected by the task.
- Do not modify unrelated map examples.
- Keep supplemental products separate from core modules.

The AV-WMS survey map is a supplemental product for the SOGI AV-WMS survey.

It must remain separate from regular Vectormap examples.

## 8. Content Rules

### Audience

Public website content is written for end users and developers.

Content must be:

- Clear
- Understandable
- Professional
- User-oriented

Never include:

- Internal planning notes
- AI instructions
- Prompt references
- Explanations about AI-generated content

### Language

- Public website text: German
- Code: English
- Comments: English
- Variable names: English
- Commit messages: English

Use Swiss Standard German.

Never use the character `ß` in German website content.

Always use `ss`.

Examples:

- Strasse
- gross
- Massstab

### Documentation

- README files may contain technical information.
- Documentation should explain actual functionality.
- Update documentation when functionality or configuration changes.
- Avoid unnecessary documentation changes.

## 9. Refactoring

Existing code may be refactored when necessary.

However:

- Prefer targeted changes.
- Refactor only when required by the task.
- Avoid unrelated structural modifications.
- Preserve existing functionality.
- Prioritize maintainability and modularity.

Large refactoring operations require explicit justification.

## 10. Context Management

Treat repository files as the source of truth.

Rules:

- Do not repeatedly reconstruct the entire project architecture.
- Read existing documentation before performing extensive exploration.
- Keep task context limited to relevant components.
- Avoid unnecessary external research.
- Do not load large datasets into conversation context.
- Inspect data structures and small samples when possible.

For complex tasks:

1. Identify relevant files.
2. Inspect existing implementation.
3. Implement the requested change.
4. Run targeted verification.
5. Commit the result.

Use a new task context when moving to unrelated functionality.

## 11. Autonomous Execution

The agent may independently:

- Inspect relevant files
- Make implementation decisions
- Modify existing code
- Create necessary files
- Run relevant tests
- Commit completed changes

The agent must not independently:

- Modify protected branches
- Create new branches
- Introduce backend systems
- Replace existing project architecture unnecessarily
- Delete unrelated files
- Overwrite existing user changes
- Deploy to production

Ask for clarification only when necessary to prevent incorrect or destructive changes.

## 12. Definition of Done

A task is complete when:

- Changes were made on `chatgpt-agentenmodus`.
- All changes belonging to the task are committed.
- No unrelated user changes were committed.
- The affected functionality works as expected.
- Relevant tests were executed where possible.
- The static website architecture is preserved.
- Public website content follows the language rules.
- Relevant MapLibre examples remain functional.
- Documentation is updated where necessary.

Do not run unrelated project-wide checks unless required by the changes.

## 13. Final Response

Provide a concise summary containing:

1. Changes made
2. Files modified
3. Tests performed
4. Commit hash
5. Remaining issues, if any

Avoid lengthy implementation narratives.
