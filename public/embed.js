(function () {
  "use strict";

  // Find the script tag and read config
  var script =
    document.currentScript ||
    document.querySelector('script[data-agent-id]');
  if (!script) return;

  var agentId = script.getAttribute("data-agent-id");
  if (!agentId) {
    console.error("[AgentStudio] Missing data-agent-id attribute");
    return;
  }

  // Config with defaults
  var baseUrl = script.getAttribute("data-base-url") || script.src.replace(/\/embed\.js.*$/, "");
  var position = script.getAttribute("data-position") || "right";
  var color = script.getAttribute("data-color") || "#6366f1";
  var title = script.getAttribute("data-title") || "Chat";

  var isOpen = false;

  // Create styles
  var style = document.createElement("style");
  style.textContent = [
    ".as-widget-bubble{position:fixed;bottom:20px;" + position + ":20px;width:56px;height:56px;border-radius:50%;background:" + color + ";color:#fff;border:none;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.25);z-index:999998;display:flex;align-items:center;justify-content:center;transition:transform .2s}",
    ".as-widget-bubble:hover{transform:scale(1.08)}",
    ".as-widget-bubble svg{width:24px;height:24px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}",
    ".as-widget-frame{position:fixed;bottom:88px;" + position + ":20px;width:380px;height:560px;max-height:calc(100vh - 110px);border:none;border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,.3);z-index:999999;opacity:0;transform:translateY(16px) scale(0.95);transition:opacity .2s,transform .2s;pointer-events:none;overflow:hidden}",
    ".as-widget-frame.as-open{opacity:1;transform:translateY(0) scale(1);pointer-events:auto}",
    "@media(max-width:480px){.as-widget-frame{width:100vw;height:100vh;max-height:100vh;bottom:0;" + position + ":0;border-radius:0}}",
    ".as-widget-badge{position:absolute;top:-2px;right:-2px;width:12px;height:12px;background:#22c55e;border-radius:50%;border:2px solid #fff}",
    ".as-widget-label{position:fixed;bottom:6px;" + position + ":20px;width:56px;text-align:center;font-size:11px;font-weight:600;font-family:system-ui,sans-serif;color:" + color + ";z-index:999997;pointer-events:none;opacity:.9}"
  ].join("\n");
  document.head.appendChild(style);

  // Chat icon SVG
  var chatIconSvg = '<svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>';
  var closeIconSvg = '<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';

  // Create bubble button
  var bubble = document.createElement("button");
  bubble.className = "as-widget-bubble";
  bubble.setAttribute("aria-label", "Open chat");
  bubble.innerHTML = chatIconSvg + '<span class="as-widget-badge"></span>';
  document.body.appendChild(bubble);

  // Create label
  var label = document.createElement("div");
  label.className = "as-widget-label";
  label.textContent = "Help";
  document.body.appendChild(label);

  // Create iframe
  var iframe = document.createElement("iframe");
  iframe.className = "as-widget-frame";
  iframe.src = baseUrl + "/embed/" + agentId;
  iframe.setAttribute("title", title);
  iframe.setAttribute("allow", "clipboard-write");
  document.body.appendChild(iframe);

  // Toggle chat
  function toggleChat() {
    isOpen = !isOpen;
    iframe.classList.toggle("as-open", isOpen);
    bubble.innerHTML = isOpen ? closeIconSvg : chatIconSvg + '<span class="as-widget-badge"></span>';
    bubble.setAttribute("aria-label", isOpen ? "Close chat" : "Open chat");
    label.style.display = isOpen ? "none" : "";
  }

  bubble.addEventListener("click", toggleChat);

  // Listen for messages from iframe
  window.addEventListener("message", function (e) {
    if (e.data && e.data.type === "agent-studio-close") {
      if (isOpen) toggleChat();
    }
  });
})();
