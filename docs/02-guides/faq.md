# FAQ and Troubleshooting

## Frequently Asked Questions (FAQ)

### How do I add a Knowledge Base?

1. On the dashboard, click "Edit Flow" on the agent card
2. In the Builder, click the "Knowledge Base" button (top right, next to "Test Chat")
3. Click "Add Source" and enter a web page URL
4. Wait for scraping to finish (status becomes READY)
5. Now the KB Search node can use this knowledge base

Tip: Add multiple URLs for better coverage. For example, for a company add: home page, /about, /products, /contact, /faq.

---

### Why doesn't the bot answer correctly?

Most common reasons:
1. KB doesn't have relevant information — add more URLs or check if pages were successfully ingested
2. KB Search Query Variable is wrong — in the Query Variable field, enter user_question if you have a Capture node, or last_message for directly using the latest message
3. System Prompt is unclear — precisely describe what the agent should do
4. Model isn't suitable — for more complex queries use gpt-4.1 or claude-sonnet-4-6

---

### How do I make the bot speak a specific language?

In the System Prompt, write:
```
Always respond in English, regardless of the user's language.
```
Or for automatic detection:
```
Always respond in the same language the user writes in.
```

---

### Can I use variables in the Message node?

Yes! The syntax is {{variable_name}}. Example:
```
Thank you {{user_name}}! Your order {{order_id}} has been confirmed.
```
The variable must have been previously set through a Capture, Set Variable, or API Call node.

---

### How many URLs can I add to the Knowledge Base?

There is no technical limit, but for optimal performance we recommend up to 20-30 URLs per agent. For larger knowledge bases, consider splitting the agent by topics.

---

### How do I test the flow without publishing the agent?

Use the "Test Chat" button in the top right corner of the Builder. Each Test Chat click opens a new conversation, so you can test clean scenarios.

---

### Why does the flow stop and not continue?

Possible reasons:
1. Capture node is waiting for input — the flow is waiting for the user's message, this is normal behavior
2. No connection between nodes — check that all nodes are connected
3. AI Response error — check that the API key is valid and the model is available
4. Infinite loop — the engine stops the flow after 50 iterations or 5 visits to the same node

---

### How do I embed the chat widget on my website?

Add this script tag to your website:
```html
<script
  src="http://localhost:3000/embed.js"
  data-agent-id="YOUR_AGENT_ID"
  data-color="#6366f1"
  data-title="Chat with us"
  data-welcome-message="Hello! How can I help?"
  data-proactive-message="Need help? Click here to chat!"
></script>
```

Replace `YOUR_AGENT_ID` with the actual agent ID from the URL. In production, replace `localhost:3000` with your deployment URL. All `data-*` attributes are optional.

---

### Does the embed widget remember conversations?

Yes. The widget uses `sessionStorage` to persist the conversation ID. If the user closes the widget and reopens it within the same browser tab/session, the conversation continues where it left off. Opening a new tab starts a fresh conversation.

---

### How does the proactive message work?

If you set `data-proactive-message` on the embed script, a tooltip appears next to the chat bubble after 30 seconds — but only once per session. It nudges the user to start a conversation. Once they open the widget or dismiss it, it won't show again until a new session.

---

### The widget looks broken on mobile

The widget is designed for both desktop and mobile:
- On mobile, it opens full-screen (`100dvh`) instead of a floating panel
- The chat bubble hides when the widget is open to save screen space
- A close button appears on mobile (hidden on desktop where the bubble toggles)

If you see layout issues, make sure your page's viewport meta tag is set correctly:
```html
<meta name="viewport" content="width=device-width, initial-scale=1">
```

---

### How do I show an unread badge on the chat bubble?

The badge appears automatically. When the agent sends a new message while the widget is closed, a red counter badge shows on the chat bubble. It clears when the user opens the widget. This works through `postMessage` communication between the iframe and the parent page.

---

### How do I add an MCP server?

1. On the dashboard, click "MCP Servers"
2. Click "Add Server" and enter a name, URL, and transport type
3. Click "Create", then use the wifi icon to test the connection
4. If successful, the server's tools will appear — they are now available to your agents

To enable the server for a specific agent: open the agent's flow builder, click the "MCP" button in the toolbar, and check the server in the list.

---

### Which MCP transports are supported?

Agent Studio supports two transports:
- **Streamable HTTP** (recommended) — the modern standard, works with most MCP servers
- **SSE** (Server-Sent Events) — backward compatible with older MCP servers

Select the transport when adding a server. If unsure, try Streamable HTTP first.

---

### What happens if an MCP server is unavailable?

Agent Studio uses graceful degradation:
- **MCP Tool node**: returns an error message to the user but the flow continues
- **AI Response node with MCP tools**: the AI generates a response without tools (logged as a warning)

The agent never crashes due to MCP failures.

---

## Troubleshooting

### Problem: Bot only repeats the Capture prompt, doesn't generate a response

Cause: The flow is not executing KB Search and AI Response after the Capture input.

Solution:
1. Check that nodes are properly connected: Capture → KB Search → AI Response
2. Check that the Query Variable field in the KB Search node contains user_question or last_message (without curly braces)
3. Open a new Test Chat (the old one may have incorrect state)

---

### Problem: KB Search returns no results

Cause: Knowledge Base is not ingested or the query variable is empty.

Solution:
1. Go to the Knowledge Base tab and check the source status (should be READY)
2. Check that the Query Variable field in the KB Search node is not empty (enter last_message or the variable name from the Capture node)
3. Try using last_message as the Query Variable — this always has a value

---

### Problem: AI Response returns an error or empty response

Cause: Issue with the API key or model.

Solution:
1. Check .env.local to make sure API keys are correct
2. Change the model to gpt-4.1-mini or deepseek-chat and try again
3. Check Max Tokens — increase to 1000 if responses are being cut off

---

### Problem: "This flow is empty" message

Cause: The agent doesn't have a created flow or the flow has no nodes.

Solution:
1. Go to the agent's Builder tab
2. Add at least a Message node and click Save
3. If nodes exist but you still get this error, check if the flow is saved (Save button)

---

### Problem: Variable is empty in the message (displays {{user_name}} as text)

Cause: The variable was not set in the flow before being used.

Solution:
1. Check that a Capture node with Variable Name: user_name comes BEFORE the Message node that uses that variable
2. Check the variable name — it must be identical (case-sensitive)
3. Use a Set Variable node for testing: set user_name to "Test User"
