import { type Page, type Locator } from "@playwright/test";

/**
 * Flow Builder page POM — `/builder/[agentId]`
 * Handles ReactFlow canvas interactions, node management,
 * saving, versioning, and deployment.
 */
export class FlowBuilderPage {
  readonly canvas: Locator;
  readonly nodePicker: Locator;
  readonly propertyPanel: Locator;
  readonly saveButton: Locator;
  readonly deployButton: Locator;
  readonly versionButton: Locator;
  readonly mcpButton: Locator;
  readonly flowNodes: Locator;

  constructor(private page: Page) {
    this.canvas = page.getByTestId("flow-canvas");
    this.nodePicker = page.getByTestId("node-picker");
    this.propertyPanel = page.getByTestId("property-panel");
    this.saveButton = page.getByRole("button", { name: /save/i });
    this.deployButton = page.getByRole("button", { name: /deploy/i });
    this.versionButton = page.getByRole("button", { name: /version/i });
    this.mcpButton = page.getByRole("button", { name: /mcp/i });
    this.flowNodes = page.locator(".react-flow__node");
  }

  async goto(agentId: string) {
    await this.page.goto(`/builder/${agentId}`);
    await this.page.waitForLoadState("networkidle");
    // Wait for ReactFlow to initialize
    await this.canvas.waitFor({ state: "visible" });
  }

  async getNodeCount(): Promise<number> {
    return this.flowNodes.count();
  }

  /**
   * Add a node of specified type via the node picker.
   */
  async addNode(nodeType: string) {
    await this.nodePicker.click();
    await this.page
      .getByRole("menuitem", { name: new RegExp(nodeType, "i") })
      .click();
  }

  /**
   * Click a node on the canvas to select it and open property panel.
   */
  async selectNode(nodeLabel: string) {
    const node = this.flowNodes.filter({ hasText: nodeLabel });
    await node.click();
    await this.propertyPanel.waitFor({ state: "visible" });
  }

  /**
   * Save the flow and wait for the API response.
   */
  async saveFlow() {
    await this.saveButton.click();
    await this.page.waitForResponse(
      (res) => res.url().includes("/flow") && res.request().method() === "PUT"
    );
  }

  /**
   * Open deploy dialog, optionally add a note, and confirm.
   */
  async deployFlow(note?: string) {
    await this.deployButton.click();
    if (note) {
      await this.page.getByLabel(/note/i).fill(note);
    }
    await this.page
      .getByRole("dialog")
      .getByRole("button", { name: /deploy|confirm/i })
      .click();
    await this.page.waitForResponse(
      (res) => res.url().includes("/deploy") && res.status() === 200
    );
  }

  /**
   * Open the version history panel.
   */
  async openVersionPanel() {
    await this.versionButton.click();
  }
}
