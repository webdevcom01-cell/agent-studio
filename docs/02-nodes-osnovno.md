# Node Types — Basic

## Message Node

Category: Basic
Description: Sends a static text message to the user. Use it for greeting messages, instructions, confirmations, and similar.

Fields:
- Label — internal node name (not visible to the user)
- Message — text sent to the user. Can contain variables in the format {{variable_name}}

Example usage:
```
Hello! I'm your assistant. I can help you with information about 
our products, shipping, and pricing.
```

When to use: At the beginning of the flow as a greeting, or in the middle of the flow for informational messages between steps.

Typical connection: Message → Capture (to ask the user something) or Message → End

---

## Button Node

Category: Basic
Description: Displays a set of buttons for the user to choose from. The user clicks a button and the selected value is saved as a variable.

Fields:
- Label — internal node name
- Message — text above the buttons (e.g. "What interests you?")
- Buttons — list of buttons, each with a label and a value
- Variable Name — name of the variable where the selection is stored

Example usage:
```
Message: "Choose a topic:"
Buttons:
  - "Products" → value: "products"
  - "Shipping" → value: "shipping"
  - "Pricing" → value: "pricing"
  - "Contact" → value: "contact"
Variable Name: user_choice
```

When to use: When you want to limit user options to a predefined set of choices.

---

## Capture Node

Category: Basic
Description: Pauses the flow and waits for the user to enter text. The input is saved to a variable.

Fields:
- Label — internal node name
- Variable Name — name of the variable where the input is stored (e.g. user_question)
- Prompt — message displayed to the user (e.g. "What would you like to know?")

Example usage:
```
Variable Name: user_question
Prompt: What would you like to know?
```

When to use:
- To capture free-form text from the user (questions, name, email)
- As an alternative to the Button node when you don't have predefined options
- For multi-step forms

The variable is used: In the KB Search node as the query variable (e.g. user_question), or in a Message node for personalization.

Typical connection: Message → Capture → KB Search → AI Response
