# Node Types — AI

## AI Response Node

Category: AI
Description: Generates an AI response based on conversation context and a system prompt. The most important node for conversational agents.

Fields:
- Label — internal node name
- System Prompt — instructions for the AI (who the agent is, how it behaves, what it can/cannot do)
- Model — AI model to use (deepseek-chat, gpt-4.1-mini, claude-haiku-4-5, etc.)
- Max Tokens — maximum number of tokens in the response (default: 500)
- Output Variable — name of the variable where the response is stored (e.g. ai_response)

Example System Prompt:
```
You are a customer support assistant for [Company Name].
Answer based on the provided knowledge base context.
Be concise, professional, and respond in the same language the user writes in.
If you don't have enough information, direct the user to support@company.com.
```

Important: The AI Response node automatically uses the entire conversation history and the kb_context variable (if KB Search was executed earlier in the flow).

When to use: At the end of the flow or loop, after a KB Search node, to generate answers to user questions.

Typical connection: KB Search → AI Response → End (or back to Capture for a loop)

---

## KB Search Node

Category: AI / Integrations
Description: Searches the agent's Knowledge Base and returns relevant passages used as context for AI responses.

Fields:
- Label — internal node name
- Query Variable — name of the variable whose value is used as the search query (e.g. user_question or last_message). Enter only the variable name, WITHOUT {{}}.
- Top K Results — number of results to return (default: 5)

Search results are always automatically saved to the kb_context variable, which is used by the AI Response node.

How it works:
1. Takes the value from the specified variable (e.g. the user's question)
2. Converts it to a vector (embedding)
3. Finds the most similar passages in the Knowledge Base
4. Returns the top K results combined as text in kb_context

Example:
```
Query Variable: user_question
Top K Results: 5
```

Note: The last_message variable always contains the user's most recent message and can be used as a Query Variable without a Capture node.

When to use: Always before an AI Response node when you want the AI to answer based on your knowledge base.

Typical connection: Capture → KB Search → AI Response

---

## AI Classify Node

Category: AI
Description: Classifies user input into one of several predefined categories. Used for routing the flow.

Fields:
- Input Variable — name of the variable whose value is classified (e.g. last_message). Without {{}}.
- Categories — list of categories (added one by one, type the text and press Enter or click +)
- Model — AI model for classification (default: deepseek-chat)

The classification result is saved to a variable that can be used in a Condition node.

Example:
```
Input Variable: last_message
Categories: complaint, inquiry, order
```

When to use: For intelligent conversation routing — e.g. complaints go to one flow, orders to another.

Typical connection: AI Classify → Condition (check variable) → different branches

---

## AI Extract Node

Category: AI
Description: Extracts structured data from free-form text. Useful for parsing user inputs.

Fields:
- Fields to Extract — list of fields to extract. For each field, enter: Name, Type (string, number, or boolean), and Description
- Model — AI model for extraction (default: deepseek-chat)

Example:
```
Field 1: name (string) — "Person's full name"
Field 2: email (string) — "Email address"
Field 3: city (string) — "City of residence"
```

The result is saved as a JSON object and accessible through variables like {{name}}, {{email}}, {{city}}.

When to use: When the user provides data in free text that you need to save in a structured format.

---

## AI Summarize Node

Category: AI
Description: Summarizes long text into a short overview.

Fields:
- Output Variable — name of the variable where the summary is stored (default: summary)
- Max Length (chars) — maximum summary length in characters (default: 200)
- Model — AI model for summarization (default: deepseek-chat)

When to use: When you have a long KB context or conversation history that needs to be condensed for further processing.
