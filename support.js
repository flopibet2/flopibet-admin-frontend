const API_BASE = ("https://web-production-b4e4e.up.railway.app").replace(/\/$/, "");

const supportApp = document.getElementById("supportApp");
const logoutBtn = document.getElementById("logoutBtn");
const threadList = document.getElementById("threadList");
const threadView = document.getElementById("threadView");
const currentThreadEmail = document.getElementById("currentThreadEmail");
const deleteThreadBtn = document.getElementById("deleteThreadBtn");
const threadMessages = document.getElementById("threadMessages");
const respondForm = document.getElementById("respondForm");
const responseText = document.getElementById("responseText");
const respondError = document.getElementById("respondError");
const sendResponseBtn = document.getElementById("sendResponseBtn");

let authToken = localStorage.getItem("admin_portal_token") || "";
let threadsData = [];
let currentThreadId = null;

function authHeaders(headers = {}) {
  return {
    ...headers,
    Authorization: `Bearer ${authToken}`,
  };
}

async function apiFetch(path, options = {}) {
  if (!authToken) {
    window.location.href = 'index.html';
    return;
  }
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: authHeaders({
      ...(options.headers || {}),
    }),
  });
  if (response.status === 401 || response.status === 403) {
    localStorage.removeItem("admin_portal_token");
    window.location.href = 'index.html';
    throw new Error("Session expired.");
  }
  return response;
}

async function loadThreads() {
  try {
    const res = await apiFetch("/api/support");
    const data = await res.json();
    threadsData = data.threads || [];
    renderThreadList();
  } catch (err) {
    threadList.innerHTML = `<div style="padding:16px; color:var(--warning);">Failed to load threads: ${err.message}</div>`;
  }
}

function renderThreadList() {
  if (threadsData.length === 0) {
    threadList.innerHTML = `<div style="padding: 16px; color: var(--muted);">No support emails found.</div>`;
    return;
  }

  threadList.innerHTML = "";
  threadsData.forEach(thread => {
    const el = document.createElement("div");
    el.className = `thread-item ${thread._id === currentThreadId ? 'active' : ''}`;
    el.onclick = () => selectThread(thread._id);
    
    // get latest message date if possible
    let lastDate = thread.created_at;
    if (thread.messages && thread.messages.length > 0) {
      lastDate = thread.messages[thread.messages.length - 1].created_at;
    }
    const displayDate = new Date(lastDate).toLocaleString();

    el.innerHTML = `
      <div class="thread-item-email">${escapeHtml(thread.user_email)}</div>
      <div class="thread-item-date">${displayDate}</div>
    `;
    threadList.appendChild(el);
  });
}

function selectThread(id) {
  currentThreadId = id;
  renderThreadList();
  
  const thread = threadsData.find(t => t._id === id);
  if (!thread) return;

  threadView.classList.remove("hidden");
  currentThreadEmail.textContent = thread.user_email;
  
  threadMessages.innerHTML = "";
  if (thread.messages) {
    thread.messages.forEach(msg => {
      const bubble = document.createElement("div");
      const isOutbound = msg.direction === 'outbound';
      bubble.className = `chat-bubble ${isOutbound ? 'chat-outbound' : 'chat-inbound'}`;
      
      const dateStr = new Date(msg.created_at).toLocaleString();
      const meta = isOutbound ? `Admin (${msg.admin || 'System'}) - ${dateStr}` : `User (${msg.sender}) - ${dateStr}`;
      const safeContent = escapeHtml(msg.content).replace(/\n/g, '<br>');
      
      bubble.innerHTML = `
        <span class="chat-meta">${escapeHtml(meta)}</span>
        <div style="font-weight:bold; margin-bottom:4px;">${escapeHtml(msg.subject || 'No Subject')}</div>
        <p class="chat-content">${safeContent}</p>
      `;
      threadMessages.appendChild(bubble);
    });
  }
  
  // scroll to bottom
  threadMessages.scrollTop = threadMessages.scrollHeight;
  respondError.textContent = "";
  responseText.value = "";
}

respondForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const content = responseText.value.trim();
  if (!content || !currentThreadId) return;

  const thread = threadsData.find(t => t._id === currentThreadId);
  if (!thread) return;

  sendResponseBtn.disabled = true;
  respondError.textContent = "";

  // find last subject for reply
  let subj = "Re: Support Request";
  if (thread.messages && thread.messages.length > 0) {
    const lastSubj = thread.messages[thread.messages.length - 1].subject;
    if (lastSubj && !lastSubj.toLowerCase().startsWith('re:')) {
      subj = `Re: ${lastSubj}`;
    } else if (lastSubj) {
      subj = lastSubj;
    }
  }

  try {
    const res = await apiFetch("/api/support/respond", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_email: thread.user_email,
        subject: subj,
        response_content: content
      })
    });

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.detail || "Failed to send response");
    }

    responseText.value = "";
    // Reload threads to get new message
    await loadThreads();
    if (currentThreadId) selectThread(currentThreadId);

  } catch (err) {
    respondError.textContent = err.message;
  } finally {
    sendResponseBtn.disabled = false;
  }
});

deleteThreadBtn.addEventListener("click", async () => {
  if (!currentThreadId) return;
  if (!confirm("Are you sure you want to delete this thread?")) return;
  
  deleteThreadBtn.disabled = true;
  try {
    const res = await apiFetch(`/api/support/${currentThreadId}`, {
      method: "DELETE"
    });
    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.detail || "Failed to delete thread");
    }
    
    currentThreadId = null;
    threadView.classList.add("hidden");
    await loadThreads();
  } catch (err) {
    alert(err.message);
  } finally {
    deleteThreadBtn.disabled = false;
  }
});

logoutBtn.addEventListener("click", () => {
  localStorage.removeItem("admin_portal_token");
  window.location.href = "index.html";
});

function escapeHtml(unsafe) {
  if (!unsafe) return "";
  return unsafe
       .toString()
       .replace(/&/g, "&amp;")
       .replace(/</g, "&lt;")
       .replace(/>/g, "&gt;")
       .replace(/"/g, "&quot;")
       .replace(/'/g, "&#039;");
}

// Init
if (!authToken) {
  window.location.href = "index.html";
} else {
  supportApp.style.display = "block";
  loadThreads();
}
