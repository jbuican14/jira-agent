import Anthropic from "@anthropic-ai/sdk";
import { getHeaders, getJiraBaseUrl } from "./const";

function prepareForClaude(
  tools: Anthropic.Tool[],
  messages: Anthropic.MessageParam[],
) {
  return {
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    tools: tools,
    messages: messages,
  };
}

function getClient() {
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
}

export async function triageJiraRequirement(userPrompt: string) {
  const client = getClient();
  // Define JIRA MCP tools that Claude can use
  const tools: Anthropic.Tool[] = [
    {
      name: "search_jira_issues",
      description:
        "Search JIRA issues using JQL (Jira Query Language). Use this to find existing issues related to the user's requirement.",
      input_schema: {
        type: "object",
        properties: {
          jql: {
            type: "string",
            description:
              'JQL query string, e.g. "project = POR AND status != Done"',
          },
        },
        required: ["jql"],
      },
    },
    {
      name: "get_jira_issue",
      description:
        "Get details of a specific JIRA issue by its key (e.g., POR-1, KAN-69)",
      input_schema: {
        type: "object",
        properties: {
          issueKey: {
            type: "string",
            description: "The JIRA issue to key (e.g., POR-1).",
          },
        },
        required: ["issueKey"],
      },
    },
    {
      name: "create_jira_issue",
      description:
        "Create a new Jira issue with a summary, description, and type.",
      input_schema: {
        type: "object",
        properties: {
          project: {
            type: "string",
            description: "Project key (e.g., POR, KAN)",
          },
          summary: {
            type: "string",
            description: "Issue summary/title",
          },
          description: {
            type: "string",
            description: "Issue description",
          },
          issueType: {
            type: "string",
            enum: ["Task", "Story", "Bug", "Epic"],
            description: "Type of the issue (Task, Story, Bug, Epic)",
          },
        },
        required: ["project", "summary", "issueType"],
      },
    },
    {
      name: "update_jira_issue",
      description:
        "Update the status or add a comment to an existing Jira issue.",
      input_schema: {
        type: "object",
        properties: {
          issueKey: {
            type: "string",
            description: "The Jira issue key (e.g., POR-1, AI-2)",
          },
          comment: {
            type: "string",
            description: "Comment to add to the issue",
          },
          status: {
            type: "string",
            description:
              "New status to transition to (e.g., 'In Progress', 'Done')",
          },
        },
        required: ["issueKey"],
      },
    },
  ];

  // Start the agentic loop
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: userPrompt,
    },
  ];

  let response = await client.messages.create({
    ...prepareForClaude(tools, messages),
  });

  console.log("\n=== Agent Starting ===");

  //Loop until Claude stops using tools (stop_reason === "end_turn")
  while (response.stop_reason === "tool_use") {
    const toolUseBlocks = response.content.filter(
      (block) => block.type === "tool_use",
    );

    if (toolUseBlocks.length === 0) break;

    // Add Claude's response to messages
    messages.push({
      role: "assistant",
      content: response.content,
    });

    // Execute all tools and collect results
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const toolUseBlock of toolUseBlocks) {
      if (toolUseBlock.type === "tool_use") {
        console.log(` 🔧 Claude is using tool: ${toolUseBlock.name} `);
        console.log(
          ` Input: ${JSON.stringify(toolUseBlock.input, null, 2)}\n `,
        );

        const toolResult = await callJiraTool(
          toolUseBlock.name,
          toolUseBlock.input,
        );
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUseBlock.id,
          content: JSON.stringify(toolResult),
        });
      }
    }

    // Add all tool results in a single user message
    messages.push({
      role: "user",
      content: toolResults,
    });

    // Get next response
    response = await client.messages.create({
      ...prepareForClaude(tools, messages),
    });
  }

  // Extract final text response
  const finalResponse = response.content.find((block) => block.type === "text");

  if (finalResponse && finalResponse.type === "text") {
    console.log("\n=== Agent Result ===\n");
    console.log(`Final Response: ${finalResponse.text}`);
    return finalResponse.text;
  }

  return "No response generated";
}

async function callJiraTool(toolName: string, input: any) {
  if (toolName === "search_jira_issues") {
    const url = `${getJiraBaseUrl()}/rest/api/3/issue/search?jql=${encodeURIComponent(input.jql)}&fields=summary,status,assignee,priority`;
    const res = await fetch(url, { headers: getHeaders() });
    const data = (await res.json()) as any;
    return {
      issues: (data.issues ?? []).map((i: any) => ({
        key: i.key,
        summary: i.fields.summary,
        status: i.fields.status?.name,
        assignee: i.fields.assignee?.displayName ?? "Unassigned",
        priority: i.fields.priority?.name,
      })),
    };
  }

  if (toolName === "get_jira_issue") {
    const url = `${getJiraBaseUrl()}/rest/api/3/issue/${input.issueKey}`;
    const res = await fetch(url, { headers: getHeaders() });
    const i = (await res.json()) as any;
    return {
      key: i.key,
      summary: i.fields.summary,
      status: i.fields.status?.name,
      assignee: i.fields.assignee?.displayName ?? "Unassigned",
      description: i.fields.description?.content?.[0]?.content?.[0]?.text ?? "",
    };
  }

  if (toolName === "create_jira_issue") {
    const body = {
      fields: {
        project: { key: input.project },
        summary: input.summary,
        issuetype: { name: input.issueType },
        ...(input.description && {
          description: {
            type: "doc",
            version: 1,
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: input.description }],
              },
            ],
          },
        }),
      },
    };
    const res = await fetch(`${getJiraBaseUrl()}/rest/api/3/issue`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as any;
    return { key: data.key, created: true };
  }

  if (toolName === "update_jira_issue") {
    if (input.comment) {
      const body = {
        body: {
          type: "doc",
          version: 1,
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: input.comment }],
            },
          ],
        },
      };
      await fetch(
        `${getJiraBaseUrl()}/rest/api/3/issue/${input.issueKey}/comment`,
        {
          method: "POST",
          headers: getHeaders(),
          body: JSON.stringify(body),
        },
      );
    }

    if (input.status) {
      const transRes = await fetch(
        `${getJiraBaseUrl()}/rest/api/3/issue/${input.issueKey}/transitions`,
        { headers: getHeaders() },
      );
      const transData = (await transRes.json()) as any;
      const transition = transData.transitions?.find(
        (t: any) => t.name.toLowerCase() === input.status.toLowerCase(),
      );
      if (transition) {
        await fetch(
          `${getJiraBaseUrl()}/rest/api/3/issue/${input.issueKey}/transitions`,
          {
            method: "POST",
            headers: getHeaders(),
            body: JSON.stringify({ transition: { id: transition.id } }),
          },
        );
      }
    }

    return { updated: true, issueKey: input.issueKey };
  }

  return { error: "Unknown tool" };
}
