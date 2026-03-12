import { test as base } from "@playwright/test";
import { DashboardPage } from "../pages/dashboard.page";
import { FlowBuilderPage } from "../pages/flow-builder.page";
import { ChatPage } from "../pages/chat.page";
import { KnowledgePage } from "../pages/knowledge.page";
import { LoginPage } from "../pages/login.page";

/**
 * Custom fixtures extending Playwright's base test.
 * All Page Object Models are injected here — tests never
 * instantiate POM classes directly.
 *
 * @see https://playwright.dev/docs/test-fixtures
 */
type AgentStudioFixtures = {
  loginPage: LoginPage;
  dashboardPage: DashboardPage;
  flowBuilderPage: FlowBuilderPage;
  chatPage: ChatPage;
  knowledgePage: KnowledgePage;
};

export const test = base.extend<AgentStudioFixtures>({
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
  dashboardPage: async ({ page }, use) => {
    await use(new DashboardPage(page));
  },
  flowBuilderPage: async ({ page }, use) => {
    await use(new FlowBuilderPage(page));
  },
  chatPage: async ({ page }, use) => {
    await use(new ChatPage(page));
  },
  knowledgePage: async ({ page }, use) => {
    await use(new KnowledgePage(page));
  },
});

export { expect } from "@playwright/test";
