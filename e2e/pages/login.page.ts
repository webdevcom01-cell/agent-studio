import { type Page, type Locator } from "@playwright/test";

/**
 * Login page POM — `/login`
 * Handles OAuth provider button clicks and redirect verification.
 */
export class LoginPage {
  readonly githubButton: Locator;
  readonly googleButton: Locator;
  readonly heading: Locator;

  constructor(private page: Page) {
    this.heading = page.getByRole("heading", { name: /sign in/i });
    this.githubButton = page.getByRole("button", { name: /github/i });
    this.googleButton = page.getByRole("button", { name: /google/i });
  }

  async goto() {
    await this.page.goto("/login");
  }

  async isVisible(): Promise<boolean> {
    return this.heading.isVisible();
  }
}
