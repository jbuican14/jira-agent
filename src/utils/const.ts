export function getJiraBaseUrl() {
  return process.env.JIRA_BASE_URL!;
}

export function getHeaders() {
  const email = process.env.JIRA_EMAIL!;
  const token = process.env.JIRA_API_TOKEN!;
  return {
    Authorization: "Basic " + Buffer.from(`${email}:${token}`).toString("base64"),
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}
