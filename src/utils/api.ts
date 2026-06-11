import Anthropic from "@anthropic-ai/sdk";

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
  ];

  // Start the agentic loop
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: userPrompt,
    },
  ];

  let response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    tools: tools,
    messages: messages,
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

        const toolResult = getMockToolResult(
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
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      tools: tools,
      messages: messages,
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

// Mock tool results (replace with real MCP calls later)
function getMockToolResult(toolName: string, input: any) {
  if (toolName === "search_jira_issues") {
    return {
      issues: [
        {
          key: "POR-1",
          summary: "Portfolio - set up from git",
          status: "In Progress",
        },
        {
          key: "POR-3",
          summary: "Leaf component first",
          status: "To Do",
        },
      ],
    };
  }
  if (toolName === "get_jira_issue") {
    return {
      key: input.issueKey,
      summary: "Example issue",
      description: "This is a mock response",
      status: "To Do",
    };
  }

  if (toolName === "create_jira_issue") {
    return {
      key: "POR-99",
      summary: input.summary,
      description: true,
    };
  }
  return { error: "Unknown tool" };
}
