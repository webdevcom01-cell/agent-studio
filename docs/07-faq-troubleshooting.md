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
4. Model isn't suitable — for more complex queries use gpt-4o or claude-sonnet-4-5-20250929

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
2. Change the model to gpt-4o-mini or deepseek-chat and try again
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
