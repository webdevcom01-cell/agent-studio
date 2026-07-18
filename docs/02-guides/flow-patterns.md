# Common Flow Patterns (Recipes)

## Required Rule: Capture Before KB Search

Every flow that uses the Knowledge Base MUST have a Capture node BEFORE the KB Search node. The Capture node collects the user's question and saves it into a variable (e.g. user_question). The KB Search node then uses that variable (Query Variable field) to search the knowledge base. Search results are automatically saved to the kb_context variable. The AI Response node automatically uses kb_context — no manual setup needed.

The minimum KB flow always has three nodes in this order: Capture (collects question) → KB Search (searches the knowledge base) → AI Response (generates answer). Without a Capture node, KB Search has no variable to search with and will return no results.

## Pattern 1: Basic Customer Support Bot

Description: The user asks a question, the agent searches the KB and generates a response, then asks if there are more questions.

Flow:
```
Message (greeting)
    ↓
Capture (save question to user_question)
    ↓
KB Search (Query Variable: user_question)
    ↓
AI Response (system prompt: customer support instructions)
    ↓
Goto → Capture (loop: waits for next question)
```

System Prompt for AI Response:
```
You are a customer support assistant for [Company].
Respond professionally and concisely based on the provided context.
If the information is not in the context, say you don't know and direct the user to support@company.com.
Always respond in the same language the user writes in.
```

---

## Pattern 2: FAQ Bot with Categories

Description: The user chooses a category, then asks a question within that category.

Flow:
```
Message (greeting)
    ↓
Button (choose category: Products / Shipping / Pricing / Contact)
    → saves to: user_category
    ↓
Capture (what specifically interests you?)
    → saves to: user_question
    ↓
KB Search (Query Variable: user_question)
    ↓
AI Response
    ↓
End
```

Note: Combining the category and question in the KB Search query improves result relevance.

---

## Pattern 3: Lead Capture Bot

Description: The agent collects contact information from a potential client.

Flow:
```
Message (introduce yourself and explain why you're collecting data)
    ↓
Capture (full name → save to: user_name)
    ↓
Capture (email → save to: user_email)
    ↓
Capture (company name → save to: company_name)
    ↓
Capture (what are you interested in? → save to: interest)
    ↓
API Call (send data to CRM)
    ↓
Message (Thank you {{user_name}}! We'll contact you at {{user_email}}.)
    ↓
End
```

---

## Pattern 4: Intelligent Routing

Description: AI classifies the user's intent and routes to the right team/response.

Flow:
```
Message (greeting)
    ↓
Capture (what interests you? → user_question)
    ↓
AI Classify (Input Variable: user_question, categories: complaint / inquiry / order / other)
    → saves to: intent
    ↓
Condition (check: intent)
    ├── equals "complaint" → Complaint Handler branch
    ├── equals "order" → Order Handler branch
    ├── equals "inquiry" → KB Search → AI Response
    └── default → General Response
```

---

## Pattern 5: Escalation to Human Agent

Description: The bot tries to answer, but if it can't, it escalates to a human.

Flow:
```
Capture (question → user_question)
    ↓
KB Search
    ↓
Condition (kb_context is_empty)
    ├── YES (no context) → Message "Redirecting you..." → API Call (notify team) → End
    └── NO (has context) → AI Response → Capture (did the answer help?)
                                               ├── "yes" → End
                                               └── "no" → API Call → End
```

---

## Mistakes to Avoid

1. Forgotten Start node — the flow must have one node without incoming connections (start). Check that the Message or first Capture node has no edges coming into it.

2. KB Search without Query Variable — always set the Query Variable field to user_question or last_message (just the variable name, without {{}}). An empty field will return no results.

3. AI Response without System Prompt — without a system prompt, the AI won't know who it is or what to do. Always add a system prompt.

4. Infinite loop — if you use Goto for looping, always ensure there is an exit (a Condition that can lead to End).

5. Uninitialized variables — if you use a variable in a Message node (e.g. {{user_name}}), it must have been previously set through a Capture or Set Variable node.
