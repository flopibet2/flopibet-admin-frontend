const API_BASE = ("https://web-production-b4e4e.up.railway.app").replace(/\/$/, "");

const supportApp = document.getElementById("supportApp");
const logoutBtn = document.getElementById("logoutBtn");
const threadList = document.getElementById("threadList");
const threadListContainer = document.getElementById("threadListContainer");
const threadPlaceholder = document.getElementById("threadPlaceholder");
const threadView = document.getElementById("threadView");
const backToListBtn = document.getElementById("backToListBtn");
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
    threadList.innerHTML = `<div class="p-6 text-rose-400 text-sm text-center font-medium">Failed to load threads: ${err.message}</div>`;
  }
}

function renderThreadList() {
  if (threadsData.length === 0) {
    threadList.innerHTML = `<div class="p-6 text-slate-400 text-sm text-center font-medium">No active support emails found.</div>`;
    return;
  }

  threadList.innerHTML = "";
  threadsData.forEach(thread => {
    const el = document.createElement("div");
    el.className = `p-4 mb-2 rounded-2xl cursor-pointer transition-all border ${thread._id === currentThreadId ? 'bg-slate-700/80 border-slate-600 shadow-md translate-x-1' : 'bg-transparent border-transparent hover:bg-slate-700/40 hover:border-slate-700/50'}`;
    el.onclick = () => selectThread(thread._id);
    
    // get latest message date if possible
    let lastDate = thread.created_at;
    if (thread.messages && thread.messages.length > 0) {
      lastDate = thread.messages[thread.messages.length - 1].created_at;
    }
    const displayDate = new Date(lastDate).toLocaleString();

    el.innerHTML = `
      <div class="font-bold text-sm text-slate-200 truncate mb-1.5">${escapeHtml(thread.user_email)}</div>
      <div class="text-xs text-slate-400 font-medium">${displayDate}</div>
    `;
    threadList.appendChild(el);
  });
}

function selectThread(id) {
  currentThreadId = id;
  renderThreadList();
  
  const thread = threadsData.find(t => t._id === id);
  if (!thread) return;

  // On mobile, hide list and show chat
  if (window.innerWidth < 1024) {
    threadListContainer.classList.add("hidden");
  }
  
  if (threadPlaceholder) {
    threadPlaceholder.classList.remove("lg:flex");
    threadPlaceholder.classList.add("hidden");
  }
  
  threadView.classList.remove("hidden");
  threadView.classList.add("flex");
  
  currentThreadEmail.textContent = thread.user_email;
  
  threadMessages.innerHTML = "";
  if (thread.messages) {
    thread.messages.forEach(msg => {
      const bubble = document.createElement("div");
      const isOutbound = msg.direction === 'outbound';
      bubble.className = `flex flex-col max-w-[90%] md:max-w-[80%] ${isOutbound ? 'self-end' : 'self-start'}`;
      
      const dateStr = new Date(msg.created_at).toLocaleString();
      const meta = isOutbound ? `Admin (${msg.admin || 'System'}) • ${dateStr}` : `User (${msg.sender}) • ${dateStr}`;
      const safeContent = escapeHtml(msg.content).replace(/\n/g, '<br>');
      
      const bubbleBg = isOutbound 
          ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-50' 
          : 'bg-slate-800/80 border-slate-700 text-slate-200';
      const bubbleRadius = isOutbound
          ? 'rounded-2xl rounded-tr-sm'
          : 'rounded-2xl rounded-tl-sm';
      const metaAlign = isOutbound ? 'text-right' : 'text-left';

      bubble.innerHTML = `
        <span class="text-[10px] md:text-xs font-medium text-slate-500 mb-1.5 px-1 ${metaAlign}">${escapeHtml(meta)}</span>
        <div class="px-4 py-3 md:px-5 md:py-4 border backdrop-blur-sm shadow-sm ${bubbleBg} ${bubbleRadius}">
            <div class="font-bold text-sm mb-2 opacity-90 border-b border-current/20 pb-2 ${!msg.subject ? 'hidden' : ''}">${escapeHtml(msg.subject || '')}</div>
            <p class="text-sm md:text-base leading-relaxed">${safeContent}</p>
        </div>
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
    threadView.classList.remove("flex");
    
    if (window.innerWidth < 1024) {
      threadListContainer.classList.remove("hidden");
    } else if (threadPlaceholder) {
      threadPlaceholder.classList.remove("hidden");
      threadPlaceholder.classList.add("lg:flex");
    }
    
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

if (backToListBtn) {
  backToListBtn.addEventListener("click", () => {
    // Hide chat, show list on mobile
    threadView.classList.add("hidden");
    threadView.classList.remove("flex");
    
    if (window.innerWidth < 1024) {
      threadListContainer.classList.remove("hidden");
    } else if (threadPlaceholder) {
      threadPlaceholder.classList.remove("hidden");
      threadPlaceholder.classList.add("lg:flex");
    }
    
    currentThreadId = null;
    renderThreadList();
  });
}

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
  supportApp.classList.remove("hidden");
  supportApp.style.display = "flex";
  loadThreads();
}
