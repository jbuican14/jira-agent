# Jira Agent

An AI agent that triages and plans engineering work in Jira, built on the
[Anthropic SDK](https://github.com/anthropics/anthropic-sdk-typescript).
You describe what you want to do in plain English — _"I need to upgrade my
portfolio to React 19, what should I prioritize?"_ — and the agent searches your
Jira, reasons about existing issues, and proposes (or creates) a roadmap.

> **Status:** the agentic tool-use loop is fully working against **mocked** Jira
> tools. Wiring the tools to a real Jira instance is the next step (see
> [Roadmap](#roadmap)). For a deep dive on how the loop works, see
> [AGENT-EXPLAINED.md](AGENT-EXPLAINED.md).

## How it works

The agent uses Claude's [tool use](https://docs.claude.com/en/docs/build-with-claude/tool-use)
in a loop:

1. You send a prompt to the agent.
2. Claude decides whether to answer directly or call a Jira tool.
3. If it calls a tool, the server runs it and feeds the result back.
4. The loop repeats until Claude has everything it needs and returns a plan.

```
You ──▶ Claude ──▶ tool_use? ──yes──▶ run tool ──▶ feed result back ──┐
                       │                                              │
                       no                                            (repeat)
                       ▼                                              │
                  final plan ◀───────────────────────────────────────┘
```

The agent exposes four Jira tools to Claude:

| Tool                 | Purpose                                            |
| -------------------- | -------------------------------------------------- |
| `search_jira_issues` | Find issues with a JQL query                       |
| `get_jira_issue`     | Fetch details of a single issue by key             |
| `create_jira_issue`  | Create a new Task / Story / Bug / Epic             |
| `update_jira_issue`  | Add a comment or transition an issue's status      |

The loop logic lives in [`src/utils/api.ts`](src/utils/api.ts) and currently
returns mock data from `getMockToolResult()`. Swapping in real Jira REST calls
is the only change needed to go live.

## Architecture

```
React UI (Vite)  ──/api/triage──▶  Express server  ──▶  triageJiraRequirement()
src/ts/app/                        server.ts             src/utils/api.ts
                                                              │
                                                              ▼
                                                     Anthropic SDK (Claude)
                                                     + Jira tools (mocked)
```

- **Frontend** — React 19 + Vite. A single page ([`App.tsx`](src/ts/app/components/App.tsx))
  with a prompt box that POSTs to `/api/triage`.
- **Backend** — Express ([`server.ts`](server.ts)) exposing `POST /api/triage`,
  which runs the agent loop and returns Claude's final response.
- **Agent** — [`src/utils/api.ts`](src/utils/api.ts) holds the tool definitions
  and the agentic loop.

Vite proxies `/api` to the Express server on port 3000 during development.

## Tech stack

- [@anthropic-ai/sdk](https://www.npmjs.com/package/@anthropic-ai/sdk) — Claude (`claude-sonnet-4-6`)
- React 19, Vite — UI
- Express — API server
- TypeScript, [tsx](https://www.npmjs.com/package/tsx) — runtime
- dotenv, cors

## Getting started

### Prerequisites

- Node.js 18+
- An [Anthropic API key](https://console.anthropic.com/)
- (For real Jira integration) a Jira base URL, account email, and
  [API token](https://id.atlassian.com/manage-profile/security/api-tokens)

### Setup

```bash
npm install
```

Create a `.env` file in the project root:

```bash
ANTHROPIC_API_KEY=sk-ant-...
JIRA_BASE_URL=https://your-domain.atlassian.net
JIRA_EMAIL=you@example.com
JIRA_API_TOKEN=your-jira-api-token
```

> `.env` is gitignored. Only `ANTHROPIC_API_KEY` is required today; the `JIRA_*`
> values are staged for the real-Jira integration described in the roadmap.

### Run the dev server

```bash
npm run dev
```

This starts the Express API and the Vite dev server concurrently. Open the URL
Vite prints (typically <http://localhost:5173>) and enter a prompt.

### Try the agent from the CLI

[`agent.ts`](agent.ts) runs the loop directly without the UI:

```bash
node --import tsx ./agent.ts
```

## Scripts

| Script          | Description                                       |
| --------------- | ------------------------------------------------- |
| `npm run dev`   | Run the Express server and Vite UI concurrently   |
| `npm run build` | Build the frontend for production (Vite)          |

## Roadmap

- [ ] Replace `getMockToolResult()` with real Jira REST API calls using the
      `JIRA_*` credentials.
- [ ] Stream the agent's progress (tool calls + reasoning) to the UI.
- [ ] Optionally expose the Jira tools over the
      [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) so the
      same toolset can be reused by other MCP clients.
