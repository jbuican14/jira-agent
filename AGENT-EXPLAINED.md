# How the Jira Agent Works

## The Big Picture

Normal API call: You ask → Claude answers → done.

Agent loop: You ask → Claude answers OR uses a tool → if tool, you run it and feed result back → Claude answers again → repeat until done.

---

## The Conversation Format

Every call to the Anthropic API is just a list of messages, like a chat history:

```
messages = [
  { role: "user",      content: "what should I work on?" },
  { role: "assistant", content: [{ type: "tool_use", name: "search_jira_issues" }] },
  { role: "user",      content: [{ type: "tool_result", content: "POR-1, POR-3..." }] },
  { role: "assistant", content: [{ type: "text", text: "Here's your plan..." }] },
]
```

`role: "user"` = anything coming FROM you (your prompt, or tool results you send back)
`role: "assistant"` = anything coming FROM Claude (text responses or tool requests)

The API needs the full history every time — it has no memory between calls.

---

## Line by Line

### Line 12 — tools array
```ts
const tools: Anthropic.Tool[] = [ ... ]
```
This tells Claude what tools it's allowed to use. Claude doesn't actually call Jira — it just says "I want to call search_jira_issues with this JQL". YOU are responsible for running the actual call and sending the result back.

---

### Line 82 — first API call
```ts
let response = await client.messages.create({
  model: "claude-sonnet-4-6",
  tools: tools,
  messages: messages,
})
```
First call to Claude. You send the user's prompt + the list of available tools. Claude decides whether to answer directly or use a tool first.

---

### Line 92 — the while loop
```ts
while (response.stop_reason === "tool_use") {
```
`stop_reason` tells you WHY Claude stopped generating:
- `"end_turn"` = Claude is done, has a final answer
- `"tool_use"` = Claude wants to call a tool, waiting for you to run it

The loop keeps going as long as Claude needs tools. In your test run, it looped 7 times (search, get, get, create×5).

---

### Line 93 — filter for tool_use blocks
```ts
const toolUseBlocks = response.content.filter(
  (block) => block.type === "tool_use"
)
```
Claude's response can contain multiple blocks in one turn:
```
content: [
  { type: "text", text: "Let me check your Jira first..." },
  { type: "tool_use", name: "search_jira_issues", input: { jql: "..." } },
  { type: "tool_use", name: "get_jira_issue", input: { issueKey: "POR-1" } },
]
```
You filter to get only the `tool_use` blocks so you know what to actually execute.

---

### Line 97 — safety break
```ts
if (toolUseBlocks.length === 0) break
```
If somehow `stop_reason` is `"tool_use"` but no tool_use blocks exist, break out to avoid an infinite loop. Defensive code.

---

### Line 100 — push Claude's response to messages
```ts
messages.push({
  role: "assistant",
  content: response.content,
})
```
The API has no memory — you must send the full conversation history on every call. You're adding Claude's last response (with the tool_use request) to the history so the next call has context.

**This is the rule:** every `tool_use` block must be immediately followed by a matching `tool_result` block. If you skip this, the API returns a 400 error.

---

### Lines 106-124 — execute tools + collect results
```ts
const toolResults: Anthropic.ToolResultBlockParam[] = []
for (const toolUseBlock of toolUseBlocks) {
  const toolResult = getMockToolResult(toolUseBlock.name, toolUseBlock.input)
  toolResults.push({
    type: "tool_result",
    tool_use_id: toolUseBlock.id,  // must match the tool_use id
    content: JSON.stringify(toolResult),
  })
}
```
For each tool Claude requested, you run it (currently mock, soon real Jira) and collect the results. `tool_use_id` links the result back to the specific request.

---

### Lines 127-130 — send results back as "user"
```ts
messages.push({
  role: "user",
  content: toolResults,
})
```
Tool results are sent back as `role: "user"` because they come FROM your side of the conversation. Claude then reads them and decides: answer now, or use another tool?

---

## The Full Flow Visualised

```
You: "I need to upgrade to React 19"
  ↓
Claude: [tool_use] search_jira_issues { jql: "project = AI" }
  ↓
You: [tool_result] "{ issues: [AI-1, AI-2...] }"
  ↓
Claude: [tool_use] create_jira_issue { summary: "Upgrade Epic" }
  ↓
You: [tool_result] "{ key: 'AI-99', created: true }"
  ↓
Claude: [text] "Here's your plan: AI-99 is the epic, prioritised as..."
  ↓
stop_reason = "end_turn" → loop exits → return final text
```

---

## What Changes When We Wire Real Jira

Only `getMockToolResult()` changes. Everything else stays identical.

Mock:
```ts
function getMockToolResult(toolName, input) {
  if (toolName === "search_jira_issues") {
    return { issues: [{ key: "POR-1", summary: "fake" }] }
  }
}
```

Real:
```ts
async function callJiraTool(toolName, input) {
  if (toolName === "search_jira_issues") {
    const response = await fetch(
      `${JIRA_BASE_URL}/rest/api/3/issue/search?jql=${input.jql}`,
      { headers: { Authorization: `Basic ${btoa(EMAIL:TOKEN)}` } }
    )
    return await response.json()
  }
}
```

Same structure. Real HTTP call instead of hardcoded data.
