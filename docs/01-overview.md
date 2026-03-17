# Agent Studio — Platform Overview

## What is Agent Studio?

Agent Studio is a visual builder for creating AI agents and chatbots without writing code. Using a drag-and-drop interface, you can create intelligent conversational agents that use your own Knowledge Base and generate responses using AI models.

## Main Components

### 1. Flow Builder
A visual editor where you connect nodes to define the conversation flow. Each agent has one flow that executes when a user sends a message.

### 2. Knowledge Base (KB)
The agent's knowledge store. You can add URLs of web pages that will be automatically scraped, chunked, and indexed for search. The agent uses this knowledge base to give accurate answers.

### 3. Chat Interface
Every agent has a public chat link you can share with users. It is available at `/chat/[agentId]`.

### 4. MCP Servers
Connect external tool servers via the Model Context Protocol (MCP). Agents can call tools on remote servers — search APIs, databases, code interpreters, and more. Manage servers globally from the dashboard, then enable per-agent.

### 5. CLI Generator
Automatically wraps any CLI application as a fully functional MCP server. Enter the application name and description — a 6-phase AI pipeline (Analyze → Design → Implement → Test → Document → Publish) generates production-ready Python files: a FastMCP server (`server.py`), CLI bridge (`bridge.py`), full test suite, and a `README.md`. The generated MCP server can be registered directly in your account with one click. Available at `/cli-generator`.

### 6. Test Chat
A button in the top right corner of the Builder that opens a chat for testing the agent in real time.

---

## Basic Workflow

1. Create an agent — give it a name and description
2. Add Knowledge Base — enter URLs containing relevant information
3. Build a flow — add and connect nodes in the Builder
4. Test — use Test Chat to verify the agent works correctly
5. Share — send the chat link to users

---

## How Flow Execution Works

When a user sends a message:
1. The flow starts from the first node (the one with no incoming connections)
2. Each node executes in order
3. If a node waits for user input (e.g. Capture), the flow pauses and waits
4. After the user responds, the flow continues from that node
5. The flow ends when it reaches an End node or there are no more nodes

---

## Available AI Models

- deepseek-chat — fast and affordable, good for general queries
- gpt-4o — most powerful OpenAI model
- gpt-4o-mini — faster and cheaper OpenAI model
- claude-sonnet-4-5-20250929 — Anthropic model, excellent for complex queries
- claude-haiku-4-5-20251001 — faster Anthropic model

---

## Variables in the Flow

Variables are used to store and pass data between nodes. They are written in the format {{variable_name}}.

Automatically available variables:
- {{last_message}} — the user's last message
- {{kb_context}} — Knowledge Base search results (after a KB Search node)

You create custom variables through the Capture node or Set Variable node.
