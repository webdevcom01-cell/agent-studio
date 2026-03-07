# Node Reference — All Fields

This document describes every node type in Agent Studio with all configurable fields in the Properties panel. The Properties panel opens when you click on a node in the Builder.

Every node has a shared Label field used as the node's display name in the flow.

## Message Node

The Message node displays a text message to the user. Use it for greetings, notifications, and informational text.

Fields: Label and Message. Enter the text the user will see in the Message field. You can use variables with double curly braces, for example: Hello {{user_name}}, how can I help you?

## Capture Node

The Capture node waits for the user to type a response and saves it into a variable. Use it to collect questions, names, emails, or any user input.

Fields: Label, Variable Name, and Prompt. In the Variable Name field, enter the name of the variable where the user's response will be stored (e.g. user_question, user_name, user_email). In the Prompt field, enter the text the user will see as a question (e.g. What would you like to know? or Enter your email). The Prompt field is optional — if left empty, the node will wait for input without displaying a message.

The Capture node is required before the KB Search node because it collects the user's question into a variable that KB Search uses for retrieval.

## KB Search Node

The KB Search node searches the Knowledge Base and returns relevant results. Use it for RAG (Retrieval-Augmented Generation) — finding information from the knowledge base before generating an AI response.

Fields: Label, Query Variable, and Top K Results. In the Query Variable field, enter only the variable name without curly braces (e.g. user_question, NOT {{user_question}}). Top K Results is the number of results to retrieve from the knowledge base (default is 5).

Search results are AUTOMATICALLY saved to the kb_context variable. There is no Output Variable field because the output is always kb_context. The KB Search node should always be connected with a line to an AI Response node, which automatically uses kb_context to generate answers.

## AI Response Node

The AI Response node uses an AI model to generate a response based on context and a system prompt. If a KB Search node was connected before it, the node automatically uses the kb_context variable — no manual configuration needed.

Fields: Label, System Prompt, Model, Max Tokens, and Output Variable. System Prompt is the instruction for the AI model that defines behavior and tone. Model is the AI model to use (e.g. deepseek-chat, claude-haiku-4-5-20251001). Max Tokens is the maximum number of tokens in the response (default 500). Output Variable is an optional field — if you enter a variable name, the AI response will be saved to that variable for later use in the flow.

## Condition Node

The Condition node checks a condition and routes the flow based on the result. It has two outputs: a true branch and a false branch.

Fields: Label. Conditions are configured through edges (connections) between nodes in the Builder, not through the Properties panel.

## Set Variable Node

The Set Variable node assigns a value to a variable without user interaction. Use it to initialize variables, perform calculations, or transform data.

Fields: Label, Variable Name, and Value. Variable Name is the name of the variable you are setting (e.g. user_score). Value is the content — it can be static text, a number, or a reference to another variable with double curly braces (e.g. {{last_message}}).

## End Node

The End node terminates the flow and optionally displays a closing message to the user.

Fields: Label and End Message. End Message is optional text shown to the user when the flow ends (e.g. Thank you for chatting!). If left empty, the flow ends without a message.

## Goto Node

The Goto node redirects the flow to another node, enabling loops and jumps. Use it to loop back to a Capture node after a response or to skip parts of the flow.

Fields: Label and Target Node. Target Node is a dropdown list of all nodes in the flow — select the node you want to redirect to.

## Wait Node

The Wait node pauses the flow for a set duration. Use it to simulate thinking time or add pauses between messages.

Fields: Label and Duration (seconds). Duration is the number of seconds to wait (minimum 1, maximum 5 seconds).

## Button Node

The Button node displays a message with clickable buttons for the user. Use it for menus, category selection, or confirmations.

Fields: Label, Message, Variable Name, and Buttons. Message is the text displayed above the buttons (e.g. Choose an option:). Variable Name is the name of the variable where the user's selection is stored (e.g. user_choice). Buttons are added by clicking the Add button — each button has a Label (button text) and a Value (the value saved to the variable).

## API Call Node

The API Call node sends an HTTP request to an external API. Use it to integrate with CRMs, databases, and external services.

Fields: Label, Method, URL, Body, and Output Variable. Method is the HTTP method (GET, POST, PUT, PATCH, DELETE). URL is the API endpoint address. Body is the JSON request body — you can use variables (e.g. {"name": "{{user_name}}"}). Output Variable is the name of the variable where the API response is stored.

## Webhook Node

The Webhook node sends an HTTP request as a notification to an external service. It has the same fields as the API Call node: Label, Method, URL, Body, and Output Variable.

## Function Node

The Function node executes JavaScript code within the flow. Use it for custom logic, calculations, and data transformations.

Fields: Label, Code, and Output Variable. In the Code field, write JavaScript code that has access to flow variables through the variables object (e.g. return variables.x + variables.y;). Output Variable is the name of the variable where the function result is stored.

## AI Classify Node

The AI Classify node uses an AI model to classify user input into one of several predefined categories. Use it for routing — directing the flow based on user intent.

Fields: Label, Input Variable, Categories, and Model. Input Variable is the name of the variable whose content the AI will classify (e.g. user_question). Categories are added one by one — type a category name and click Add or press Enter (e.g. complaint, inquiry, order). Model is the AI model used for classification (default is deepseek-chat). The classification result (category name) is saved to a variable named after the node.

## AI Extract Node

The AI Extract node uses an AI model to extract structured data from text. Use it to pull out names, emails, numbers, and other information from user input.

Fields: Label, Fields to Extract, and Model. Fields to Extract are added by clicking the Add button — each field has a Name (field name, e.g. email), Type (data type: string, number, or boolean), and Description (what to extract). Model is the AI model used for extraction (default is deepseek-chat).

## AI Summarize Node

The AI Summarize node uses an AI model to summarize text. Use it to create short summaries of conversations or long texts.

Fields: Label, Output Variable, Max Length (chars), and Model. Output Variable is the name of the variable where the summary is stored (default is summary). Max Length is the maximum number of characters in the summary (default 200). Model is the AI model used for summarization (default is deepseek-chat).
