# Beginner's Guide — Your First Agent

## Step 1: Create an Agent

1. Open Agent Studio at `http://localhost:3000`
2. Click the **"New Agent"** button on the dashboard
3. Enter the agent name (e.g. "My Customer Support Bot")
4. Add a short description of what the agent does
5. The agent is automatically created with an empty flow and Knowledge Base

---

## Step 2: Add Knowledge Base (URL Scraping)

The Knowledge Base is your agent's knowledge store. Add URLs of pages whose content you want the agent to use for answers.

1. Click **"Edit Flow"** on the agent card (opens the Builder)
2. In the Builder, click the **"Knowledge Base"** button (top right, next to "Test Chat")
3. Click the **"Add Source"** button
4. Select the **"URL"** tab
5. Enter the page URL (e.g. `https://your-site.com/faq`)
6. Click **"Add"**

Agent Studio will automatically:
   - Scrape the page content
   - Split the text into chunks (400 tokens, 20% overlap)
   - Generate embedding vectors (OpenAI text-embedding-3-small)
   - Save everything to the database for search

You can track source status on the Knowledge page:
- **PENDING** — waiting to be processed
- **PROCESSING** — scraping and indexing in progress
- **READY** — ready for search
- **FAILED** — processing error (check the URL)

---

## Step 3: Build a Basic Flow

Go to the Builder (click **"Edit Flow"** on the agent card) and create this simple flow:

### Simplest Q&A Flow (4 nodes)

```
Message (greeting)
    ↓
Capture (save question to user_question)
    ↓
KB Search (Query Variable: user_question)
    ↓
AI Response (automatically uses kb_context)
```

**IMPORTANT:** The Capture node is REQUIRED before the KB Search node. Capture collects the user's question and saves it to a variable (e.g. user_question). KB Search then uses that variable for retrieval. Without a Capture node, KB Search has nothing to search for.

**How to add nodes:**

1. Click the **"Add Node"** button in the Builder
2. Select the node type from the dropdown menu
3. Click on a node to open the Property Panel (right sidebar)
4. Fill in the fields for each node

**Configuring each node:**

### Message Node
- **Message:** `Hello! I'm your assistant. Ask me a question.`

### Capture Node
- **Prompt:** `What would you like to know?`
- **Variable Name:** `user_question`

### KB Search Node
- **Query Variable:** `user_question` (just the variable name, without `{{}}`)
- Results are automatically saved to `{{kb_context}}`

### AI Response Node
- **System Prompt:**
```
You are a helpdesk assistant. Answer only based on the provided context.
If the answer is not in the context, tell the user you don't have that information.
Always respond in the same language the user writes in.
```
- **Model:** `deepseek-chat` (default, fast and affordable)

**Connecting nodes:**

Drag a line from the output point of one node to the input point of the next. Order matters — the flow runs top to bottom.

---

## Step 4: Test Your Agent

1. In the Builder, click the **"Test Chat"** button (top right)
2. Ask a question related to the content in your Knowledge Base
3. The agent should:
   - Display the greeting message
   - Ask for a question (Capture node)
   - Search the KB and generate an answer

**What if the agent doesn't give good answers?**

- Check that the KB Source status is **READY**
- Test the search on the Knowledge page (Search tab)
- Add more URLs for better coverage
- Improve the System Prompt with more specific instructions

---

## Step 5: Share the Chat Link

Every agent has a public chat link that is immediately ready for sharing — no publishing step required:

```
http://localhost:3000/chat/[agentId]
```

You can send this link to anyone who needs access to the agent. No login is required — just open the link and start chatting.

Quick access: On the dashboard, click the **"Chat"** button on the agent card to open the chat link directly.

---

## Step 6: Export and Import Agents

### Export
1. On the dashboard, click the three dots (menu) on the agent card
2. Select **"Export"**
3. A JSON file with the agent configuration and flow is downloaded

### Import
1. On the dashboard, click the **"Import Agent"** button
2. Select a JSON file from a previously exported agent
3. A new agent is created with the suffix **(imported)**

Export does not include the Knowledge Base or conversations — only the configuration and flow.

---

## Step 7: Embed the Chat Widget

You can embed your agent as a chat widget on any website. Add this script tag:

```html
<script
  src="http://localhost:3000/embed.js"
  data-agent-id="YOUR_AGENT_ID"
  data-color="#6366f1"
  data-title="Chat with us"
></script>
```

The widget supports customizable colors, welcome messages, proactive messages, persistent conversations, and mobile-friendly layout. See [07-faq-troubleshooting.md](./07-faq-troubleshooting.md) for details on all widget options.

---

## Step 8: Monitor with Analytics

Click the **"Analytics"** button on the dashboard to see how your agents are performing:

- **Conversation volume** — daily trends and total counts
- **Response times** — track if your agent is fast enough
- **Top agents** — which agents get the most usage
- **Common questions** — what users ask most frequently
- **KB search hit rate** — how often the knowledge base returns useful results

Use these insights to improve your agent's knowledge base and flow. See [11-analytics.md](./11-analytics.md) for a full guide.

---

## Next Steps

- Add more sources to the Knowledge Base → [09-knowledge-base-guide.md](./09-knowledge-base-guide.md)
- Learn about all node types → [02-nodes-osnovno.md](./02-nodes-osnovno.md), [03-nodes-ai.md](./03-nodes-ai.md)
- Check out advanced flow patterns → [06-flow-patterns.md](./06-flow-patterns.md)
- Monitor agent usage → [11-analytics.md](./11-analytics.md)
- Troubleshooting → [07-faq-troubleshooting.md](./07-faq-troubleshooting.md)
