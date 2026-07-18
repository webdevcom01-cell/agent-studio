# Analytics Dashboard

## Overview

The Analytics dashboard gives you insight into how your agents are being used — conversation volume, response times, popular questions, and knowledge base search performance. Access it by clicking the **"Analytics"** button on the dashboard.

---

## Period Selector

At the top right you can choose the time window: **7d**, **30d**, or **90d**. All metrics, charts, and tables update to reflect the selected period.

---

## Summary Cards

Four cards at the top show key metrics at a glance:

| Card | What it Means |
|------|---------------|
| **Total Conversations** | Number of unique conversations started in the period |
| **Total Messages** | Total user + assistant messages exchanged |
| **Avg Response Time** | Average time from user message to complete agent response |
| **KB Search Hit Rate** | Percentage of knowledge base searches that returned at least one result |

### How to interpret

- **High response time (>3s):** Consider switching to a faster model (deepseek-chat) or reducing Max Tokens in AI Response nodes.
- **Low KB hit rate (<50%):** Your knowledge base may not cover the questions users are asking. Check the "Common Questions" table and add sources that address those topics.

---

## Daily Conversations Chart

An area chart showing the number of new conversations per day. Use this to:

- Spot usage trends (growing, declining, or seasonal)
- Identify spikes after sharing the agent link or embedding the widget
- Correlate with changes you made to the agent's flow or knowledge base

---

## Top Agents

A ranked list of your agents ordered by conversation count. Each entry shows:

- **Agent name**
- **Conversation count** — how many unique conversations
- **Message count** — total messages (user + assistant)

Agents with zero conversations are hidden from the list.

---

## Common Questions

The most frequently asked first messages across all conversations. This helps you understand what users typically ask about.

- Messages with 4+ consecutive digits are filtered out (privacy protection)
- Long messages are truncated to 60 characters
- The count shows how many times that exact first message appeared

### How to use this

If you see a question that your agent handles poorly:
1. Add relevant content to the knowledge base
2. Adjust the system prompt to handle that topic
3. Add a specific flow branch for common intents

---

## Average Response Time Chart

A line chart showing daily average response time in milliseconds. This tracks end-to-end time from when the user sends a message to when the full response is delivered.

Factors that affect response time:
- **Model choice** — GPT-4o is slower than deepseek-chat
- **Max Tokens** — higher limits mean longer generation time
- **KB Search** — re-ranking adds latency but improves quality
- **API calls / webhooks** — external calls in the flow add latency

---

## How Analytics Data is Collected

Analytics are collected automatically — no configuration needed:

- **Conversation and message counts** are derived from existing database records
- **Response time** is tracked via `AnalyticsEvent` records created on each chat API call
- **KB search stats** are tracked each time a KB Search node executes

Analytics tracking is fire-and-forget — it never blocks or slows down the chat response.
