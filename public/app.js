/* ─── Satellite Communication Agent — Frontend JS ──────────────────────────── */
(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────────────────────────
  const state = {
    sessionId: 'session_' + Math.random().toString(36).slice(2, 10),
    isLoading: false,
    msgCount: 0,
  };

  // ── DOM Refs ───────────────────────────────────────────────────────────────
  const chatContainer   = document.getElementById('chat-container');
  const userInput       = document.getElementById('user-input');
  const sendBtn         = document.getElementById('send-btn');
  const clearBtn        = document.getElementById('clear-btn');
  const exportBtn       = document.getElementById('export-btn');
  const msgCountEl      = document.getElementById('msg-count');
  const sessionLabelEl  = document.getElementById('session-label');
  const suggestionsList = document.getElementById('suggestions-list');
  const statusDot       = document.getElementById('status-dot');
  const menuToggle      = document.getElementById('menu-toggle');
  const sidebar         = document.getElementById('sidebar');
  const welcome         = document.getElementById('welcome');

  // ── Init ───────────────────────────────────────────────────────────────────
  sessionLabelEl.textContent = state.sessionId.slice(-6);

  checkHealth();
  loadSuggestions();
  autoResize();

  // ── Health check ───────────────────────────────────────────────────────────
  async function checkHealth() {
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        statusDot.style.background = 'var(--green)';
      } else {
        statusDot.style.background = 'var(--red)';
      }
    } catch {
      statusDot.style.background = 'var(--orange)';
    }
  }

  // ── Load suggestions ───────────────────────────────────────────────────────
  async function loadSuggestions() {
    try {
      const res  = await fetch('/api/suggestions');
      const data = await res.json();
      data.suggestions.forEach(s => {
        const btn = document.createElement('button');
        btn.className = 'suggestion-chip';
        btn.textContent = s;
        btn.addEventListener('click', () => injectPrompt(s));
        suggestionsList.appendChild(btn);
      });
    } catch (e) {
      console.warn('Could not load suggestions', e);
    }
  }

  // ── Textarea auto-resize ───────────────────────────────────────────────────
  function autoResize() {
    userInput.addEventListener('input', () => {
      userInput.style.height = 'auto';
      userInput.style.height = Math.min(userInput.scrollHeight, 140) + 'px';
      sendBtn.disabled = userInput.value.trim() === '' || state.isLoading;
    });
  }

  // ── Send message on Enter (Shift+Enter = newline) ─────────────────────────
  userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!state.isLoading && userInput.value.trim()) {
        sendMessage();
      }
    }
  });

  sendBtn.addEventListener('click', () => {
    if (!state.isLoading && userInput.value.trim()) {
      sendMessage();
    }
  });

  // ── Inject prompt ──────────────────────────────────────────────────────────
  function injectPrompt(text) {
    userInput.value = text;
    userInput.dispatchEvent(new Event('input'));
    userInput.focus();
    // Close sidebar on mobile
    sidebar.classList.remove('open');
  }

  // ── Welcome card clicks ────────────────────────────────────────────────────
  document.querySelectorAll('.welcome-card').forEach(card => {
    card.addEventListener('click', () => {
      const prompt = card.dataset.prompt;
      if (prompt) injectPrompt(prompt);
    });
  });

  // ── Mobile sidebar toggle ──────────────────────────────────────────────────
  if (menuToggle) {
    menuToggle.addEventListener('click', () => sidebar.classList.toggle('open'));
  }

  document.addEventListener('click', (e) => {
    if (window.innerWidth <= 680 &&
        !sidebar.contains(e.target) &&
        e.target !== menuToggle) {
      sidebar.classList.remove('open');
    }
  });

  // ── Send message ───────────────────────────────────────────────────────────
  async function sendMessage() {
    const text = userInput.value.trim();
    if (!text || state.isLoading) return;

    // Hide welcome screen
    if (welcome) welcome.style.display = 'none';

    state.isLoading = true;
    sendBtn.disabled = true;

    // Append user bubble
    appendMessage('user', text);

    // Clear input
    userInput.value = '';
    userInput.style.height = 'auto';

    // Show typing indicator
    const typingEl = appendTyping();

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, sessionId: state.sessionId }),
      });

      const data = await res.json();
      typingEl.remove();

      if (!res.ok) {
        appendMessage('ai', `⚠️ **Error:** ${data.error || 'Unknown error occurred.'}`);
        showToast(data.error || 'Request failed', 'error');
      } else {
        appendMessage('ai', data.reply || 'No response.');
      }
    } catch (err) {
      typingEl.remove();
      appendMessage('ai', '⚠️ **Network error.** Could not reach the server. Please check your connection.');
      showToast('Network error: ' + err.message, 'error');
    } finally {
      state.isLoading = false;
      sendBtn.disabled = userInput.value.trim() === '';
    }
  }

  // ── Append message bubble ──────────────────────────────────────────────────
  function appendMessage(role, content) {
    state.msgCount++;
    msgCountEl.textContent = state.msgCount;

    const msgEl  = document.createElement('div');
    msgEl.className = `msg ${role}`;

    const avatar = document.createElement('div');
    avatar.className = `avatar ${role === 'ai' ? 'ai-avatar' : 'user-avatar'}`;
    avatar.textContent = role === 'ai' ? '🛰' : 'U';

    const bubble = document.createElement('div');
    bubble.className = 'bubble';

    const meta = document.createElement('div');
    meta.className = 'bubble-meta';

    const nameEl = document.createElement('span');
    nameEl.className = 'bubble-name';
    nameEl.textContent = role === 'ai' ? 'SatCom-AI' : 'You';

    const timeEl = document.createElement('span');
    timeEl.className = 'bubble-time';
    timeEl.textContent = formatTime(new Date());

    meta.appendChild(nameEl);
    meta.appendChild(timeEl);

    const contentEl = document.createElement('div');
    contentEl.className = 'bubble-content';
    contentEl.innerHTML = renderMarkdown(content);

    // Copy button (only on AI messages)
    if (role === 'ai') {
      const copyBtn = document.createElement('button');
      copyBtn.className = 'copy-btn';
      copyBtn.textContent = 'Copy';
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(content).then(() => {
          copyBtn.textContent = 'Copied!';
          setTimeout(() => copyBtn.textContent = 'Copy', 1500);
        });
      });
      bubble.appendChild(copyBtn);
    }

    bubble.appendChild(meta);
    bubble.appendChild(contentEl);
    msgEl.appendChild(avatar);
    msgEl.appendChild(bubble);

    chatContainer.appendChild(msgEl);
    scrollToBottom();
    return msgEl;
  }

  // ── Typing indicator ───────────────────────────────────────────────────────
  function appendTyping() {
    const msgEl = document.createElement('div');
    msgEl.className = 'msg ai';

    const avatar = document.createElement('div');
    avatar.className = 'avatar ai-avatar';
    avatar.textContent = '🛰';

    const bubble = document.createElement('div');
    bubble.className = 'bubble';

    const dots = document.createElement('div');
    dots.className = 'typing-dots';
    dots.innerHTML = '<span></span><span></span><span></span>';

    bubble.appendChild(dots);
    msgEl.appendChild(avatar);
    msgEl.appendChild(bubble);
    chatContainer.appendChild(msgEl);
    scrollToBottom();
    return msgEl;
  }

  // ── Markdown renderer ──────────────────────────────────────────────────────
  function renderMarkdown(text) {
    if (!text) return '';

    let html = escapeHtml(text);

    // Code blocks (``` ... ```)
    html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
      return `<pre><code class="lang-${lang || 'text'}">${code.trim()}</code></pre>`;
    });

    // Inline code
    html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');

    // Bold **text**
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // Italic *text* or _text_
    html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
    html = html.replace(/_([^_\n]+)_/g, '<em>$1</em>');

    // Headers
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm,  '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm,   '<h1>$1</h1>');

    // Blockquote
    html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

    // Horizontal rule
    html = html.replace(/^---$/gm, '<hr style="border-color:var(--border);margin:12px 0">');

    // Unordered lists
    html = html.replace(/((?:^[•\-\*] .+\n?)+)/gm, (match) => {
      const items = match.trim().split('\n')
        .map(l => `<li>${l.replace(/^[•\-\*] /, '')}</li>`)
        .join('');
      return `<ul>${items}</ul>`;
    });

    // Ordered lists
    html = html.replace(/((?:^\d+\. .+\n?)+)/gm, (match) => {
      const items = match.trim().split('\n')
        .map(l => `<li>${l.replace(/^\d+\. /, '')}</li>`)
        .join('');
      return `<ol>${items}</ol>`;
    });

    // Simple table detection (| col | col |)
    html = html.replace(/((?:^\|.+\|\n?)+)/gm, (match) => {
      const rows = match.trim().split('\n').filter(r => !r.match(/^\|[\s\-:]+\|/));
      if (rows.length < 1) return match;
      const [header, ...body] = rows;
      const thCells = header.split('|').filter(c => c.trim()).map(c => `<th>${c.trim()}</th>`).join('');
      const trRows  = body.map(row => {
        const cells = row.split('|').filter(c => c.trim()).map(c => `<td>${c.trim()}</td>`).join('');
        return `<tr>${cells}</tr>`;
      }).join('');
      return `<table><thead><tr>${thCells}</tr></thead><tbody>${trRows}</tbody></table>`;
    });

    // Paragraphs: double newlines → <p>
    html = html.split(/\n{2,}/).map(block => {
      block = block.trim();
      if (!block) return '';
      // Don't wrap block elements
      if (/^<(h[1-6]|ul|ol|pre|blockquote|table|hr)/.test(block)) return block;
      return `<p>${block.replace(/\n/g, '<br>')}</p>`;
    }).join('');

    return html;
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Clear conversation ─────────────────────────────────────────────────────
  clearBtn.addEventListener('click', async () => {
    if (state.msgCount === 0) return;
    if (!confirm('Clear this conversation?')) return;

    try {
      await fetch(`/api/chat/${state.sessionId}`, { method: 'DELETE' });
    } catch (e) { /* ignore */ }

    // Remove all message elements (keep welcome)
    Array.from(chatContainer.children).forEach(el => {
      if (el.id !== 'welcome') el.remove();
    });

    if (welcome) welcome.style.display = '';
    state.msgCount = 0;
    msgCountEl.textContent = '0';
    showToast('Conversation cleared', 'success');
  });

  // ── Export conversation ────────────────────────────────────────────────────
  exportBtn.addEventListener('click', () => {
    const msgs = chatContainer.querySelectorAll('.msg');
    if (!msgs.length) { showToast('No messages to export', 'error'); return; }

    let md = `# SatCom-AI Conversation Export\n`;
    md    += `Session: ${state.sessionId}\n`;
    md    += `Date: ${new Date().toLocaleString()}\n\n---\n\n`;

    msgs.forEach(msg => {
      const role    = msg.classList.contains('user') ? '**You**' : '**SatCom-AI**';
      const content = msg.querySelector('.bubble-content')?.innerText || '';
      const time    = msg.querySelector('.bubble-time')?.textContent || '';
      md += `### ${role} _(${time})_\n${content}\n\n`;
    });

    const blob = new Blob([md], { type: 'text/markdown' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `satcom-ai-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Conversation exported', 'success');
  });

  // ── Toast notification ─────────────────────────────────────────────────────
  function showToast(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast     = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function scrollToBottom() {
    requestAnimationFrame(() => {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    });
  }

  function formatTime(date) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

})();
