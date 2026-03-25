# Node Types — Integrations

## API Call Node

Category: Integrations
Description: Sends an HTTP request to an external API and saves the response to a variable.

Fields:
- Label — internal node name
- Method — HTTP method: GET, POST, PUT, PATCH, DELETE
- URL — endpoint URL (can contain variables: https://api.com/user/{{user_id}})
- Body — request body for POST/PUT (JSON format, can contain variables)
- Output Variable — variable where the response is stored

Example:
```
URL: https://api.mycompany.com/orders/{{order_id}}
Method: GET
Output Variable: order_data
```

When to use: For fetching data from your own system (orders, users, inventory), sending notifications, CRM integration.

---

## Webhook Node

Category: Integrations
Description: Sends an HTTP request as a notification to an external service. It has the same fields as the API Call node.

Fields:
- Label — internal node name
- Method — HTTP method (GET, POST, PUT, PATCH, DELETE)
- URL — the webhook endpoint URL
- Body — JSON request body (can contain variables)
- Output Variable — variable where the response is stored

When to use: When an external system needs to be notified — e.g. new order placed, payment received.

---

## Function Node

Category: Integrations
Description: Executes JavaScript code within the flow. The most flexible node for custom logic.

Fields:
- Label — internal node name
- Code — JavaScript code to execute. Access flow variables through the variables object.
- Output Variable — name of the variable where the result is stored

Example:
```javascript
// Format a date
const today = new Date();
const formatted = today.toLocaleDateString('en-US');
return { formatted_date: formatted };
```

Example with variables:
```javascript
// Check if order is large
const amount = parseFloat(variables.order_amount);
const isLarge = amount > 10000;
return { 
  is_large_order: isLarge,
  discount: isLarge ? '5%' : '0%'
};
```

When to use: For calculations, data formatting, custom validation, transforming API responses.

Note: Code runs in a sandboxed environment. No direct access to external services — use the API Call node for that.
