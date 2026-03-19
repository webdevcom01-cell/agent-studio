import { describe, it, expect } from "vitest";
import {
  analyzeTask,
  getRoutingTable,
  getAvailablePipelines,
} from "../meta-orchestrator";

describe("analyzeTask", () => {
  it("routes feature requests to planner + tdd + reviewer", () => {
    const result = analyzeTask("Implement a new user registration feature");
    expect(result.taskType).toBe("new-feature");
    expect(result.pipeline).toContain("ecc-planner");
    expect(result.pipeline).toContain("ecc-tdd-guide");
    expect(result.complexity).toBe("moderate");
  });

  it("routes bug fixes to tdd + reviewer + security", () => {
    const result = analyzeTask("Fix the login error when password is empty");
    expect(result.taskType).toBe("bug-fix");
    expect(result.pipeline).toContain("ecc-tdd-guide");
    expect(result.pipeline).toContain("ecc-security-reviewer");
  });

  it("routes security audits correctly", () => {
    const result = analyzeTask("Run a security audit on the auth module");
    expect(result.taskType).toBe("security-audit");
    expect(result.pipeline).toContain("ecc-security-reviewer");
  });

  it("routes architecture tasks to architect + planner", () => {
    const result = analyzeTask("Design the system architecture for the new microservice");
    expect(result.taskType).toBe("architecture");
    expect(result.pipeline).toContain("ecc-architect");
  });

  it("routes documentation tasks to doc-updater", () => {
    const result = analyzeTask("Update the API documentation");
    expect(result.taskType).toBe("documentation");
    expect(result.pipeline).toContain("ecc-doc-updater");
    expect(result.complexity).toBe("simple");
  });

  it("routes performance tasks correctly", () => {
    const result = analyzeTask("The search endpoint is slow, optimize it");
    expect(result.taskType).toBe("performance");
    expect(result.pipeline).toContain("ecc-performance-benchmarker");
  });

  it("routes refactoring tasks correctly", () => {
    const result = analyzeTask("Refactor and cleanup dead code in the auth module");
    expect(result.taskType).toBe("refactor");
    expect(result.pipeline).toContain("ecc-refactor-cleaner");
  });

  it("routes testing tasks correctly", () => {
    const result = analyzeTask("Write unit tests for the payment service");
    expect(result.taskType).toBe("testing");
    expect(result.pipeline).toContain("ecc-tdd-guide");
  });

  it("routes database tasks correctly", () => {
    const result = analyzeTask("Add an index to the SQL query on the database schema");
    expect(result.taskType).toBe("database");
    expect(result.pipeline).toContain("ecc-database-reviewer");
  });

  it("routes frontend tasks correctly", () => {
    const result = analyzeTask("Build a new React component for the dashboard UI");
    expect(result.taskType).toBe("frontend");
    expect(result.pipeline).toContain("ecc-frontend-developer");
  });

  it("defaults to code-review for ambiguous tasks", () => {
    const result = analyzeTask("Look at this please");
    expect(result.taskType).toBe("code-review");
    expect(result.pipeline).toContain("ecc-code-reviewer");
  });

  it("always returns a rationale string", () => {
    const result = analyzeTask("anything");
    expect(result.rationale).toBeTruthy();
    expect(typeof result.rationale).toBe("string");
  });

  it("classifies complexity based on pipeline length", () => {
    const simple = analyzeTask("Update the docs");
    expect(simple.complexity).toBe("simple");

    const complex = analyzeTask("Implement a new feature with tests");
    expect(complex.complexity).toBe("moderate");
  });
});

describe("getRoutingTable", () => {
  it("returns a copy of the routing table", () => {
    const table = getRoutingTable();
    expect(table["new-feature"]).toBeDefined();
    expect(table["bug-fix"]).toBeDefined();

    table["new-feature"] = [];
    const fresh = getRoutingTable();
    expect(fresh["new-feature"].length).toBeGreaterThan(0);
  });
});

describe("getAvailablePipelines", () => {
  it("returns all pipeline names", () => {
    const pipelines = getAvailablePipelines();
    expect(pipelines).toContain("new-feature");
    expect(pipelines).toContain("security-audit");
    expect(pipelines).toContain("code-review");
    expect(pipelines.length).toBeGreaterThanOrEqual(10);
  });
});
