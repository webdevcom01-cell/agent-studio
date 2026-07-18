# n8n ↔ Agent Studio Workflow Templates

Ready-to-import n8n workflow templates that connect external triggers to Agent Studio agents.

## Quick Setup

### 1. Deploy n8n on Railway (5 minutes)
Click → https://railway.com/deploy/n8n

Required env vars for n8n on Railway:
```
N8N_BASIC_AUTH_ACTIVE=true
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=your-strong-password
N8N_HOST=your-n8n.railway.app
WEBHOOK_URL=https://your-n8n.railway.app/
```

### 2. Create Agent Studio API Key credential in n8n
n8n → Credentials → Add → HTTP Header Auth:
- Name: `Authorization`
- Value: `Bearer as_YOUR_API_KEY`

### 3. Set these n8n Environment Variables
```
AGENT_STUDIO_URL=https://your-agent-studio.railway.app
SLACK_AGENT_ID=<agent UUID from Agent Studio>
SECURITY_AGENT_ID=<agent UUID from Agent Studio>
REPORT_AGENT_ID=<agent UUID from Agent Studio>
```

---

## Available Workflows

### 01 - Slack Bot
**File:** `01-slack-bot.json`

Slack mention → n8n → Agent Studio → Slack reply in thread.

How it works:
1. User mentions bot in Slack: `@AgentBot what's our brand voice policy?`
2. n8n webhook receives the event
3. Message sent to Brand Guardian agent via `/api/agents/{id}/chat`
4. Agent response posted back to the same Slack thread

**Additional credentials needed:**
- Slack Bot Token (Bearer xoxb-...)
- Slack App with events: `app_mention`, `message.channels`

---

### 02 - GitHub PR Security Review  
**File:** `02-github-pr-security-review.json`

New GitHub PR → fetch diff → Security Scanner agent → post review comment.

How it works:
1. PR opened in GitHub repo
2. n8n fetches changed files and patches
3. DevSecOps Security Scanner agent analyzes the diff
4. Automated review comment posted on the PR with risk level + findings

**Additional credentials needed:**
- GitHub Token (Bearer ghp_...) with `repo` scope
- GitHub Webhook on target repo: Events → Pull requests

---

### 03 - Weekly Analytics Report
**File:** `03-weekly-report.json`

Every Monday 8am → fetch analytics → Report Generator agent → email + Slack.

How it works:
1. Cron triggers every Monday at 8:00 AM (Europe/Belgrade timezone)
2. Fetches analytics from Agent Studio `/api/analytics?period=7d`
3. Report Generator agent writes a formatted executive report
4. Report emailed as HTML + Slack notification sent

**Additional credentials needed:**
- SMTP credentials for email
- Slack Incoming Webhook URL

---

## Agent Studio API Reference

All workflows use the same pattern:
```http
POST {AGENT_STUDIO_URL}/api/agents/{agentId}/chat
Authorization: Bearer as_YOUR_KEY
Content-Type: application/json

{
  "message": "your prompt here",
  "stream": false
}
```

Response:
```json
{
  "success": true,
  "data": {
    "conversationId": "conv_...",
    "messages": [
      { "role": "user", "content": "your prompt" },
      { "role": "assistant", "content": "agent response here" }
    ]
  }
}
```

## How to Import a Workflow

1. In n8n: Workflows → Import from File
2. Select the `.json` file
3. Configure credentials (they are referenced but not stored in the JSON)
4. Set environment variables
5. Activate the workflow
