# AGENT.md – Working Instructions for the Codex Agent

This repository is maintained using an autonomous coding agent.

## Branch Policy

- All work MUST be done exclusively in the branch: `chatgpt-agentenmodus`
- Never commit to `main` or any other branch
- Do not create additional branches

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
- The site runs as a static website without a build step
- Public website text is end-user-friendly and contains no internal AI context
- No German "ß" characters appear in HTML content
- MapLibre examples work with placeholder or real data
- Dataset documentation from `av.json` is correctly rendered
- Code structure is clean, modular, and understandable

---

The agent is expected to act autonomously, including making decisions about structure, implementation details, and commit timing, as long as all rules above are respected.
