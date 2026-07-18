# Node Types — Flow Control

## Condition Node

Category: Flow Control
Description: Branches the flow based on a condition. Checks a variable value and routes the flow to different branches.

Fields:
- Label — internal node name

Conditions are configured through edges (connections) between nodes in the Builder. The Condition node has two outputs: a true branch and a false branch.

Example:
```
Check variable: intent
  - if equals "complaint" → go to Complaint Handler
  - if equals "order" → go to Order Handler
  - default → go to General Info
```

When to use: When the flow needs to go in different directions depending on the user's choice or AI classification result.

---

## Set Variable Node

Category: Flow Control
Description: Sets or changes a variable value without waiting for user input.

Fields:
- Label — internal node name
- Variable Name — name of the variable
- Value — the value (static text, a number, or an expression with other variables using {{variable_name}})

Example:
```
Variable Name: greeting_shown
Value: true
```

When to use: For setting flags, computing values, initializing variables.

---

## End Node

Category: Flow Control
Description: Terminates the conversation. The flow cannot continue after an End node.

Fields:
- Label — internal node name
- End Message — optional closing message to the user

Example End Message:
```
Thank you for using our support! If you have more questions, feel free 
to reach out. Have a great day!
```

When to use: At the end of the flow or as the terminal point of a branch. Not required — a flow can end without an End node, but it's good practice to add one.

---

## Goto Node

Category: Flow Control
Description: Redirects the flow to another node without a direct connection. Useful for creating loops.

Fields:
- Label — internal node name
- Target Node — dropdown list of all nodes in the flow, select the node to redirect to

Example usage:
```
AI Response → Goto → Capture (loop: bot answers, then asks again)
```

When to use: For creating loops in the flow without drawing backward connections that would clutter the visual layout.

Note: Goto can cause infinite loops if not properly configured. The engine has protection — if a node is visited more than 5 times, the flow will be terminated.

---

## Wait Node

Category: Flow Control
Description: Pauses flow execution for a set duration.

Fields:
- Label — internal node name
- Duration (seconds) — wait time in seconds (minimum 1, maximum 5)

Example:
```
Duration: 2
```

When to use: To simulate a "typing" effect, or when you need to wait for an asynchronous operation result.
