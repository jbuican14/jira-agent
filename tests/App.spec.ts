import { test, expect } from "@playwright/test";

test("has title", async ({ page }) => {
  await page.goto("/");

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/Jira Agent/);
});

test("has button and textarea", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("textbox")).toBeVisible();
  await expect(page.getByRole("button")).toHaveText("Get Plan");
});

// cost $0.09 to test this file
test("can submit a prompt and see button change to 'Planning...'", async ({
  page,
}) => {
  await page.goto("/");

  const prompt =
    "I need to create an epic for ticket starts with AI to work on UI agent a11y. What work should I prioritize?";
  await page.getByRole("textbox").fill(prompt);
  await page.getByRole("button").click();

  await expect(page.getByRole("button")).toHaveText("Planning...");
});

test("see error message when error occurs", async ({ page }) => {
  await page.route("/api/triage", (route) => {
    route.fulfill({
      status: 500,
      body: JSON.stringify({ type: "error", error: "Internal Server Error" }),
    });
  });

  await page.goto("/");
  const prompt =
    "I need to create an epic for ticket starts with AI to work on UI agent a11y. What work should I prioritize?";
  await page.getByRole("textbox").fill(prompt);
  await page.getByRole("button").click();

  await expect(page.getByText(/Error: Internal Server Error/)).toBeVisible();
});
