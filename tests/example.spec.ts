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
