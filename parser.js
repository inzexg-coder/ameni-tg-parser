(function() {

const CONFIG = {
  EMOJI_PATTERN: /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}\u{231A}-\u{231B}\u{23E9}-\u{23F3}\u{23F8}-\u{23FA}\u{25AA}-\u{25AB}\u{25B6}\u{25C0}\u{25FB}-\u{25FE}\u{2934}\u{2935}\u{2B05}-\u{2B07}\u{2B1B}-\u{2B1C}\u{3030}\u{303D}\u{3297}\u{3299}]/gu,
  URL_PATTERN: /https?:\/\/[^\s<>"']+/gi,
  WORD_PATTERN: /\b[a-zA-Zа-яА-Я]{2,}\b/g,
  STOP_WORDS: new Set(['the','a','an','and','or','but','in','on','at','to','for','of','with','by','from','is','are','was','were','be','been','being','have','has','had','do','does','did','will','would','can','could','shall','should','may','might','i','you','he','she','it','we','they','my','your','his','her','its','our','their','me','him','us','them','this','that','these','those','not','no','nor','so','if','as','up','down','out','off','over','under','again','further','then','once','here','there','all','each','every','both','few','more','most','other','some','such','only','own','same','too','very','just','because','about','than','into','also','what','which','who','whom','when','where','why','how']),
  URL_PATTERN_STRICT: /https?:\/\/[^\s<>"']+|www\.[^\s<>"']+/gi
};

const DOM = {};
function cacheDOM() {
  DOM.fileInput = document.getElementById('fileInput');
  DOM.uploadZone = document.getElementById('uploadZone');
  DOM.fileBadge = document.getElementById('fileBadge');
  DOM.fileNameText = document.getElementById('fileNameText');
  DOM.fileIndicator = document.querySelector('.file-indicator');
  DOM.loading = document.querySelector('.loader-overlay');
  DOM.loaderDetail = document.getElementById('loaderDetail');
  DOM.results = document.getElementById('results');
  DOM.error = document.querySelector('.error-bar');
  DOM.chatTitle = document.getElementById('chatTitle');
  DOM.chatType = document.getElementById('chatType');
  DOM.msgCount = document.getElementById('msgCount');
  DOM.statsGrid = document.getElementById('statsGrid');
  DOM.chartsContainer = document.getElementById('chartsContainer');
  
}

function showError(msg) {
  DOM.error.textContent = msg;
  DOM.error.classList.remove('hidden');
}

function formatNumber(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toLocaleString();
}

function formatTime(seconds) {
  if (seconds < 1) return '<1s';
  if (seconds < 60) return Math.round(seconds) + 's';
  if (seconds < 3600) return Math.round(seconds / 60) + 'm';
  if (seconds < 86400) return Math.round(seconds / 3600) + 'h';
  return (seconds / 86400).toFixed(1) + 'd';
}

function animateValue(el, start, end, duration, suffix) {
  if (!el) return;
  const startTime = performance.now();
  const isFloat = end % 1 !== 0;
  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = start + (end - start) * eased;
    if (isFloat) {
      el.textContent = current.toFixed(1) + (suffix || '');
    } else {
      el.textContent = Math.round(current).toLocaleString() + (suffix || '');
    }
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

function normalizeMessages(data) {
  let messages = [], chatTitle = 'Unknown Chat', chatType = 'personal';
  if (data.chats && Array.isArray(data.chats.list)) {
    const c = data.chats.list[0];
    chatTitle = c.label || c.title || 'Unknown Chat';
    chatType = c.type === 'public_supergroup' || c.type === 'private_supergroup' ? 'group' : c.type || 'personal';
    messages = c.messages || [];
  } else if (Array.isArray(data.messages)) {
    messages = data.messages;
    chatTitle = data.name || data.title || 'Unknown Chat';
    chatType = data.type === 'public_supergroup' || data.type === 'private_supergroup' || data.type === 'group' || data.type === 'supergroup' ? 'group' : data.type || 'personal';
  } else if (data.chat && Array.isArray(data.chat.messages)) {
    messages = data.chat.messages;
    chatTitle = data.chat.label || data.chat.title || 'Unknown Chat';
    chatType = data.chat.type || 'personal';
  } else {
    const find = (obj) => {
      if (Array.isArray(obj) && obj.length > 0 && typeof obj[0] === 'object') {
        if (obj[0].text || obj[0].message || obj[0].content) return obj;
      }
      if (obj && typeof obj === 'object') for (const k in obj) { const f = find(obj[k]); if (f) return f; }
      return null;
    };
    const f = find(data);
    if (f) { messages = f; chatTitle = 'Detected Chat'; }
  }
  messages = messages.filter(m => m.type !== 'service' && (m.text !== undefined || m.message !== undefined || m.content !== undefined || m.photo || m.video || m.sticker || m.animation));
  return { messages, chatTitle, chatType };
}

function unify(messages) {
  return messages.map(m => {
    const ts = m.date || m.timestamp || m.time;
    const d = ts ? (typeof ts === 'number' ? new Date(ts * 1000) : new Date(ts)) : new Date();
    const rawText = m.text || m.message || m.content || '';
    const text = typeof rawText === 'string' ? rawText :
      Array.isArray(rawText) ? rawText.map(t => typeof t === 'string' ? t : t.text || '').join('') : '';
    const sender = typeof m.from === 'string' ? m.from : m.from && m.from.first_name ? m.from.first_name + (m.from.last_name ? ' ' + m.from.last_name : '') :
      m.from && m.from.username ? '@' + m.from.username : m.from || m.sender || m.author || 'Unknown';
    return {
      id: m.id || 0, timestamp: d,
      dateStr: d.toISOString().split('T')[0],
      timeStr: d.toTimeString().split(' ')[0],
      hour: d.getHours(), minute: d.getMinutes(),
      day: d.getDate(), month: d.getMonth() + 1, year: d.getFullYear(),
      monthStr: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'),
      dayOfWeek: d.getDay(), weekday: d.toLocaleDateString('en', { weekday: 'short' }),
      sender, text, textLength: text.length,
      words: text.match(/\b\w+\b/g) || [],
      wordCount: (text.match(/\b\w+\b/g) || []).length,
      emojis: text.match(CONFIG.EMOJI_PATTERN) || [],
      links: text.match(CONFIG.URL_PATTERN) || [],
      hasLink: (text.match(CONFIG.URL_PATTERN) || []).length > 0,
      isForwarded: !!m.forwarded_from || m.forwarded === true,
      isEdited: !!m.edited,
      hasMedia: !!(m.photo || m.video || m.sticker || m.animation || m.document || m.voice || m.audio),
      mediaType: m.photo ? 'photo' : m.video ? 'video' : m.sticker ? 'sticker' : m.animation ? 'gif' : m.document ? 'document' : m.voice || m.audio ? 'voice' : null,
      replyTo: m.reply_to_message_id || m.reply_to_msg_id || null,
      reactions: Array.isArray(m.reactions) ? m.reactions : [],
    };
  });
}

function analyze(messages, chatTitle, chatType) {
  const total = messages.length;
  if (total === 0) return null;
  const setSenders = new Set(); messages.forEach(m => setSenders.add(m.sender));
  const participants = Array.from(setSenders).sort();
  const totalWords = messages.reduce((s, m) => s + m.wordCount, 0);
  const totalChars = messages.reduce((s, m) => s + m.textLength, 0);
  const totalEmojis = messages.reduce((s, m) => s + m.emojis.length, 0);
  const allEmojis = []; messages.forEach(m => allEmojis.push(...m.emojis));
  const totalLinks = messages.reduce((s, m) => s + m.links.length, 0);
  const totalForwards = messages.filter(m => m.isForwarded).length;
  const totalEdits = messages.filter(m => m.isEdited).length;
  const mediaMsgs = messages.filter(m => m.hasMedia);
  const textMsgs = messages.filter(m => m.textLength > 0 && !m.hasMedia);
  const mediaTypes = messages.reduce((a, m) => { if (m.mediaType) a[m.mediaType] = (a[m.mediaType] || 0) + 1; return a; }, { photo: 0, video: 0, sticker: 0, gif: 0, document: 0, voice: 0 });
  const uniqueWords = new Set(); messages.forEach(m => m.words.forEach(w => uniqueWords.add(w.toLowerCase())));
  const bySender = {};
  messages.forEach(m => {
    if (!bySender[m.sender]) bySender[m.sender] = { sender: m.sender, count: 0, chars: 0, words: 0, emojis: 0, media: 0, links: 0 };
    bySender[m.sender].count++;
    bySender[m.sender].chars += m.textLength;
    bySender[m.sender].words += m.wordCount;
    bySender[m.sender].emojis += m.emojis.length;
    if (m.hasMedia) bySender[m.sender].media++;
    if (m.hasLink) bySender[m.sender].links++;
  });
  const topSenders = Object.values(bySender).sort((a, b) => b.count - a.count);
  const getMax = (o) => { let mk = '', mv = 0; for (const k in o) if (o[k] > mv) { mv = o[k]; mk = k; } return { k: mk, v: mv }; };
  const perDay = {}; messages.forEach(m => { perDay[m.dateStr] = (perDay[m.dateStr] || 0) + 1; });
  const perHour = {}; for (let i = 0; i < 24; i++) perHour[i] = 0; messages.forEach(m => perHour[m.hour]++);
  const perWeekday = {}; for (let i = 0; i < 7; i++) perWeekday[i] = 0; messages.forEach(m => perWeekday[m.dayOfWeek]++);
  const perMonth = {}; messages.forEach(m => { perMonth[m.monthStr] = (perMonth[m.monthStr] || 0) + 1; });
  const sortedByTime = [...messages].sort((a, b) => a.timestamp - b.timestamp);
  const dateRange = { start: sortedByTime[0].timestamp, end: sortedByTime[sortedByTime.length - 1].timestamp };
  const daysSpan = Math.max(1, Math.round((dateRange.end - dateRange.start) / 86400000) + 1);
  const avgPerDay = (total / daysSpan).toFixed(1);
  const bestDay = getMax(perDay);
  const bestMonth = getMax(perMonth);
  const bestHour = (() => { let maxV = 0, maxK = 0; for (let i = 0; i < 24; i++) if (perHour[i] > maxV) { maxV = perHour[i]; maxK = i; } return { k: maxK, v: maxV }; })();
  const wordFreq = {};
  messages.forEach(m => {
    m.words.forEach(w => { const lw = w.toLowerCase(); if (!CONFIG.STOP_WORDS.has(lw) && lw.length > 1) wordFreq[lw] = (wordFreq[lw] || 0) + 1; });
  });
  const topWords = Object.entries(wordFreq).sort((a, b) => b[1] - a[1]).slice(0, 50).map(([w, c]) => ({ word: w, count: c }));
  const emojiFreq = {};
  allEmojis.forEach(e => { emojiFreq[e] = (emojiFreq[e] || 0) + 1; });
  const topEmojis = Object.entries(emojiFreq).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([e, c]) => ({ emoji: e, count: c }));
  const msgLengths = messages.map(m => m.textLength).filter(l => l > 0).sort((a, b) => a - b);
  const avgLength = msgLengths.length > 0 ? msgLengths.reduce((s, v) => s + v, 0) / msgLengths.length : 0;
  const longest = msgLengths.length > 0 ? msgLengths[msgLengths.length - 1] : 0;
  const respTimes = [];
  for (let i = 1; i < sortedByTime.length; i++) {
    if (sortedByTime[i].sender !== sortedByTime[i - 1].sender) {
      const diff = sortedByTime[i].timestamp - sortedByTime[i - 1].timestamp;
      if (diff > 0 && diff < 86400000) respTimes.push(diff / 1000);
    }
  }
  const avgResp = respTimes.length > 0 ? respTimes.reduce((s, v) => s + v, 0) / respTimes.length : 0;
  let longestPause = 0, pauseStart = null, pauseEnd = null;
  for (let i = 1; i < sortedByTime.length; i++) {
    const diff = sortedByTime[i].timestamp - sortedByTime[i - 1].timestamp;
    if (diff > longestPause) { longestPause = diff; pauseStart = sortedByTime[i - 1].timestamp; pauseEnd = sortedByTime[i].timestamp; }
  }
  const dayMsgs = messages.filter(m => m.hour >= 6 && m.hour < 18).length;
  const nightMsgs = messages.filter(m => m.hour < 6 || m.hour >= 18).length;
  const weekendMsgs = messages.filter(m => m.dayOfWeek === 0 || m.dayOfWeek === 6).length;
  const weekdayMsgs = messages.filter(m => m.dayOfWeek >= 1 && m.dayOfWeek <= 5).length;
  const replies = messages.filter(m => m.replyTo !== null).length;
  const replyTargets = {};
  messages.forEach(m => {
    if (m.replyTo !== null) {
      const target = sortedByTime.find(t => t.id === m.replyTo);
      if (target) replyTargets[target.sender] = (replyTargets[target.sender] || 0) + 1;
    }
  });
  const topRepliedTo = Object.entries(replyTargets).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([s, c]) => ({ sender: s, count: c }));
  const allReactions = [];
  messages.forEach(m => {
    m.reactions.forEach(r => { const em = r.emoji || r.reaction || ''; if (em) allReactions.push(em); });
  });
  const reactionFreq = {};
  allReactions.forEach(r => { reactionFreq[r] = (reactionFreq[r] || 0) + 1; });
  const topReactions = Object.entries(reactionFreq).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([r, c]) => ({ emoji: r, count: c }));
  const countedReactions = allReactions.length;
  const messagesWithReactions = messages.filter(m => m.reactions.length > 0).length;
  const mediaCount = total - textMsgs.length;
  const mediaPct = total > 0 ? (mediaCount / total * 100).toFixed(1) : 0;
  const textPct = total > 0 ? (textMsgs.length / total * 100).toFixed(1) : 0;
  const nightPct = total > 0 ? (nightMsgs / total * 100).toFixed(1) : 0;
  const dayPct = total > 0 ? (dayMsgs / total * 100).toFixed(1) : 0;
  const weekendPct = total > 0 ? (weekendMsgs / total * 100).toFixed(1) : 0;
  const replyPct = total > 0 ? (replies / total * 100).toFixed(1) : 0;
  const forwardPct = total > 0 ? (totalForwards / total * 100).toFixed(1) : 0;
  const topPct = topSenders.length > 0 && total > 0 ? (topSenders[0].count / total * 100).toFixed(1) : 0;
  const lenDist = { '1-10': 0, '11-50': 0, '51-100': 0, '101-500': 0, '501+': 0 };
  messages.forEach(m => {
    const l = m.textLength;
    if (l === 0) return;
    if (l <= 10) lenDist['1-10']++;
    else if (l <= 50) lenDist['11-50']++;
    else if (l <= 100) lenDist['51-100']++;
    else if (l <= 500) lenDist['101-500']++;
    else lenDist['501+']++;
  });

  return {
    chatTitle, chatType, total, participants, participantsCount: participants.length,
    totalWords, totalChars, totalEmojis, allEmojis, totalLinks, totalForwards, totalEdits,
    mediaTypes, uniqueWordsCount: uniqueWords.size,
    dateRange, daysSpan, avgPerDay: parseFloat(avgPerDay), bestDay, bestMonth, bestHour,
    perDay, perHour, perWeekday, perMonth, topSenders, topSender: topSenders[0],
    topPct: parseFloat(topPct),
    avgLength: Math.round(avgLength * 10) / 10, longest,
    topWords, topEmojis, msgLengths, lenDist,
    avgResp: Math.round(avgResp), respTimes,
    longestPause: { seconds: longestPause / 1000, start: pauseStart, end: pauseEnd },
    dayMsgs, nightMsgs, dayPct: parseFloat(dayPct), nightPct: parseFloat(nightPct),
    weekendMsgs, weekdayMsgs, weekendPct: parseFloat(weekendPct), weekdayPct: (100 - parseFloat(weekendPct)).toFixed(1),
    replies, replyPct: parseFloat(replyPct), replyTargets, topRepliedTo,
    forwardPct: parseFloat(forwardPct), mediaPct: parseFloat(mediaPct),
    countedReactions, messagesWithReactions, topReactions,
    sortedByTime, messages,
  };
}

function render(stats) {
  initSearch(stats.sortedByTime);addPremiumStar();
  DOM.loading.classList.add('hidden');
  DOM.error.classList.add('hidden');
  DOM.results.classList.remove('hidden');
  DOM.chatTitle.textContent = stats.chatTitle;
  DOM.chatType.textContent = stats.chatType === 'group' ? 'Group' : 'Personal';
  DOM.msgCount.textContent = formatNumber(stats.total) + ' msgs';
  DOM.fileIndicator.textContent = formatNumber(stats.total) + ' messages';
  renderStatsGrid(stats);
  renderCharts(stats);
}

function renderStatsGrid(stats) {
  const cards = [
    { label: 'Total Messages', value: formatNumber(stats.total), sub: stats.daysSpan + ' days of chat', cls: '' },
    { label: 'Participants', value: stats.participantsCount, sub: stats.chatType === 'group' ? topSendersNote(stats) : '1-on-1 conversation', cls: 'accent-green' },
    { label: 'Messages per Day', value: stats.avgPerDay, sub: 'avg · peak: ' + formatNumber(stats.bestDay.v) + ' on ' + stats.bestDay.k, cls: 'accent-purple' },
    { label: 'Total Characters', value: formatNumber(stats.totalChars), sub: stats.totalWords + ' words · ' + stats.uniqueWordsCount + ' unique', cls: 'accent-orange' },
    { label: 'Avg. Message Length', value: Math.round(stats.avgLength), sub: 'Longest: ' + stats.longest + ' chars', cls: '' },
    { label: 'Media Messages', value: stats.mediaPct + '%', sub: Object.values(stats.mediaTypes).reduce((a, b) => a + b, 0) + ' files total', cls: 'accent-green' },
    { label: 'Avg. Response Time', value: formatTime(stats.avgResp), sub: 'between participants', cls: 'accent-purple' },
    { label: 'Emojis Used', value: formatNumber(stats.totalEmojis), sub: stats.topEmojis[0] ? 'Top: ' + stats.topEmojis[0].emoji + ' ×' + stats.topEmojis[0].count : 'none', cls: 'accent-orange' },
    { label: 'Replies', value: stats.replyPct + '%', sub: stats.replies + ' replied messages', cls: '' },
    { label: 'Forwarded', value: stats.forwardPct + '%', sub: formatNumber(stats.totalForwards) + ' forwarded', cls: 'accent-green' },
    { label: 'Active Sender', value: stats.topSender ? stats.topSender.sender.replace(/[^a-zA-Z0-9_ ]/g, '') : 'N/A', sub: stats.topPct + '% of all messages', cls: 'accent-purple' },
    { label: 'Night Activity', value: stats.nightPct + '%', sub: formatNumber(stats.nightMsgs) + ' messages after 18:00', cls: 'accent-orange' },
  ];
  DOM.statsGrid.innerHTML = cards.map(c =>
    '<div class="stat-card ' + c.cls + '"><div class="stat-label">' + c.label + '</div><div class="stat-value">' + c.value + '</div><div class="stat-sublabel">' + c.sub + '</div></div>'
  ).join('');
  Array.from(DOM.statsGrid.children).forEach((card, i) => {
    card.style.setProperty('--i', i);
    setTimeout(() => card.classList.add('visible'), 50 + i * 40);
  });
  function topSendersNote(s) {
    if (s.topSenders.length < 2) return '';
    const u1 = s.topSenders[0].sender, u2 = s.topSenders[1].sender;
    const p1 = (s.topSenders[0].count / s.total * 100).toFixed(0);
    const p2 = (s.topSenders[1].count / s.total * 100).toFixed(0);
    return u1 + ' ' + p1 + '% · ' + u2 + ' ' + p2 + '%';
  }
}

function observeChartPanel(panel) {
  if ('IntersectionObserver' in window) {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          panel.classList.add('visible');
          obs.unobserve(panel);
        }
      });
    }, { threshold: 0.05 });
    obs.observe(panel);
  } else {
    setTimeout(() => panel.classList.add('visible'), 100);
  }
}

function renderCharts(stats) {  const cc = DOM.chartsContainer;  cc.innerHTML = "";  var _prem = typeof isPremium === "function" && isPremium();  addChart(cc, "Messages Over Time", buildLine(stats.perDay, stats), "line");  addChart(cc, "Activity by Hour", buildHour(stats.perHour), "bar");  addChart(cc, "Activity by Day of Week", buildWeekday(stats.perWeekday), "bar");  if (_prem) {    addChart(cc, "Monthly Activity", buildMonthly(stats.perMonth), "bar");  } else {    addPremiumLock(cc, "Monthly Activity", "trend");  }  addChart(cc, "Participants Activity", buildTopSenders(stats.topSenders, stats.total), "bar");  addChart(cc, "Message Length Distribution", buildLenDist(stats.lenDist), "bar");  addChart(cc, "Response Time Distribution", buildRespDist(stats.respTimes), "bar");  addChart(cc, "Top Emojis", buildEmojiChart(stats.topEmojis), "bar");  if (_prem) {    addHeatmap(cc, "Activity Heatmap", stats.sortedByTime);  } else {    addPremiumLock(cc, "Activity Heatmap", "heatmap");  }  addWordCloud(cc, "Top Words", stats.topWords);  addChart(cc, "Media Type Breakdown", buildMediaPie(stats.mediaTypes), "doughnut");  addChart(cc, "Most Replied To", buildReplied(stats.topRepliedTo), "bar");  addChart(cc, "Cumulative Messages", buildCumulative(stats.sortedByTime), "line");  addChart(cc, "Messages per Sender", buildSenderPie(stats.topSenders), "doughnut");  if (_prem) {    addUserHeatmap(cc, "User Activity by Hour", stats.sortedByTime, stats.topSenders);  } else {    addPremiumLock(cc, "User Activity by Hour", "user-heatmap");  }  var pdfBtn = document.getElementById("pdfExportBtn");  if (pdfBtn) pdfBtn.style.display = "inline-flex";}
  addChart(cc, 'Cumulative Messages', buildCumulative(stats.sortedByTime), 'line');
  addChart(cc, 'Messages per Sender', buildSenderPie(stats.topSenders), 'doughnut');
  addUserHeatmap(cc, 'User Activity by Hour', stats.sortedByTime, stats.topSenders);
  var pdfBtn = document.getElementById('pdfExportBtn');
  if (pdfBtn) pdfBtn.style.display = 'inline-flex';
}

function addChart(cc, title, data, type) {
  if (!data) return;
  const panel = document.createElement('div');
  panel.className = 'chart-panel';
  const h3 = document.createElement('h3');
  h3.textContent = title;
  panel.appendChild(h3);
  const canvas = document.createElement('canvas');
  canvas.className = 'chart-canvas';
  panel.appendChild(canvas);
  cc.appendChild(panel);
  observeChartPanel(panel);
  const chart = new Chart(canvas, { type, data, options: chartOptions(type, data) });
  panel._chart = chart;
}

let chartInstances = [];

function chartOptions(type, data) {
  const base = {
    responsive: true, maintainAspectRatio: true,
    animation: { duration: 1200, easing: 'easeOutQuart', delay: (ctx) => ctx.dataIndex * 40 },
    plugins: {
      legend: { labels: { color: '#a09080', font: { family: "'DM Sans', sans-serif", size: 11 }, boxWidth: 12, padding: 12 } }
    }
  };
  if (type === 'line' || type === 'bar') {
    base.scales = {
      x: { ticks: { color: '#6b7280', maxTicksLimit: 20, font: { size: 10 } }, grid: { color: 'rgba(26,26,46,0.6)' } },
      y: { ticks: { color: '#6b7280', font: { size: 10 }, precision: 0 }, grid: { color: 'rgba(26,26,46,0.6)' }, beginAtZero: true }
    };
  }
  if (type === 'doughnut') {
    base.plugins.legend.position = 'right';
  }
  if (data && data.datasets) {
    data.datasets.forEach((ds, i) => {
      if (!ds.borderColor && !ds.backgroundColor) {
        ds.backgroundColor = i === 0 ? '#a78bfa' : '#c4a8ff';
      }
    });
  }
  base.plugins.tooltip = {
    backgroundColor: '#0f0f1a',
    titleColor: '#f1f5f9',
    bodyColor: '#94a3b8',
    borderColor: '#1a1a2e',
    borderWidth: 1,
    padding: 10,
    cornerRadius: 8
  };
  return base;
}

function buildLine(perDay) {
  const labels = Object.keys(perDay).sort();
  return { labels, datasets: [{ label: 'Messages', data: labels.map(l => perDay[l]), borderColor: '#a78bfa', backgroundColor: 'rgba(167,139,250,0.1)', fill: true, tension: 0.3, pointRadius: 2, pointHoverRadius: 6 }] };
}

function buildHour(perHour) {
  const labels = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0') + ':00');
  const data = Array.from({ length: 24 }, (_, i) => perHour[i] || 0);
  const gradient = data.map(v => {
    const max = Math.max(...data, 1);
    const ratio = v / max;
    if (ratio > 0.7) return '#f472b6';
    if (ratio > 0.4) return '#a78bfa';
    if (ratio > 0.15) return '#a78bfa';
    return '#1a1a2e';
  });
  return { labels, datasets: [{ label: 'Messages', data, backgroundColor: gradient, borderRadius: 2 }] };
}

function buildWeekday(perWeekday) {
  const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const data = Array.from({ length: 7 }, (_, i) => perWeekday[i] || 0);
  return { labels, datasets: [{ label: 'Messages', data, backgroundColor: '#c4a8ff', borderRadius: 2 }] };
}

function buildMonthly(perMonth) {
  const labels = Object.keys(perMonth).sort();
  return { labels, datasets: [{ label: 'Messages', data: labels.map(l => perMonth[l]), backgroundColor: '#a78bfa', borderRadius: 2 }] };
}

function buildTopSenders(senders, total) {
  const top = senders.slice(0, 10);
  const colors = ['#a78bfa', '#c4a8ff', '#a78bfa', '#a78bfa', '#f472b6', '#c4a8ff', '#a78bfa', '#c4a8ff', '#a78bfa', '#f472b6'];
  return { labels: top.map(s => s.sender.replace(/[^a-zA-Z0-9_ ]/g, '')), datasets: [{ label: 'Messages', data: top.map(s => s.count), backgroundColor: top.map((_, i) => colors[i % colors.length]), borderRadius: 2 }] };
}

function buildLenDist(lenDist) {
  const labels = Object.keys(lenDist);
  return { labels, datasets: [{ label: 'Messages', data: labels.map(l => lenDist[l]), backgroundColor: '#a78bfa', borderRadius: 2 }] };
}

function buildRespDist(respTimes) {
  if (!respTimes || respTimes.length === 0) return null;
  const bins = [0, 0, 0, 0, 0, 0];
  const binLabels = ['<1m', '1-5m', '5-15m', '15-1h', '1-6h', '6h+'];
  respTimes.forEach(s => {
    if (s < 60) bins[0]++; else if (s < 300) bins[1]++; else if (s < 900) bins[2]++; else if (s < 3600) bins[3]++; else if (s < 21600) bins[4]++; else bins[5]++;
  });
  return { labels: binLabels, datasets: [{ label: 'Responses', data: bins, backgroundColor: '#a78bfa', borderRadius: 2 }] };
}

function buildEmojiChart(topEmojis) {
  const top = topEmojis.slice(0, 10);
  if (top.length === 0) return null;
  const colors = ['#a78bfa', '#c4a8ff', '#a78bfa', '#a78bfa', '#f472b6', '#c4a8ff', '#a78bfa', '#c4a8ff', '#a78bfa', '#f472b6'];
  return { labels: top.map(e => e.emoji), datasets: [{ label: 'Uses', data: top.map(e => e.count), backgroundColor: top.map((_, i) => colors[i % colors.length]), borderRadius: 2 }] };
}

function buildMediaPie(mediaTypes) {
  const labels = Object.keys(mediaTypes).filter(k => mediaTypes[k] > 0);
  if (labels.length === 0) return null;
  const colors = ['#a78bfa', '#a78bfa', '#a78bfa', '#f472b6', '#c4a8ff', '#c4a8ff'];
  return { labels, datasets: [{ label: 'Media', data: labels.map(l => mediaTypes[l]), backgroundColor: colors.slice(0, labels.length), borderWidth: 0 }] };
}

function buildReplied(replied) {
  if (!replied || replied.length === 0) return null;
  const top = replied.slice(0, 10);
  return { labels: top.map(s => s.sender.replace(/[^a-zA-Z0-9_ ]/g, '')), datasets: [{ label: 'Replies received', data: top.map(s => s.count), backgroundColor: '#c4a8ff', borderRadius: 2 }] };
}

function buildCumulative(sorted) {
  if (!sorted || sorted.length === 0) return null;
  const days = {};
  sorted.forEach(m => { const d = m.dateStr; if (!days[d]) days[d] = 0; days[d]++; });
  const labels = Object.keys(days).sort();
  let cum = 0;
  const data = labels.map(l => { cum += days[l]; return cum; });
  return { labels, datasets: [{ label: 'Total Messages', data, borderColor: '#c4a8ff', backgroundColor: 'rgba(167,139,250,0.1)', fill: true, tension: 0.3, pointRadius: 0 }] };
}

function buildSenderPie(senders) {
  const top = senders.slice(0, 8);
  if (top.length < 2) return null;
  const colors = ['#a78bfa', '#c4a8ff', '#a78bfa', '#a78bfa', '#f472b6', '#c4a8ff', '#a78bfa', '#c4a8ff'];
  return { labels: top.map(s => s.sender.replace(/[^a-zA-Z0-9_ ]/g, '')), datasets: [{ label: 'Messages', data: top.map(s => s.count), backgroundColor: colors.slice(0, top.length), borderWidth: 0 }] };
}

function addHeatmap(cc, title, messages) {
  if (!messages || messages.length === 0) return;
  const panel = document.createElement('div');
  panel.className = 'chart-panel';
  observeChartPanel(panel);
  const h3 = document.createElement('h3');
  h3.textContent = title;
  panel.appendChild(h3);
  const heatmap = document.createElement('div');
  heatmap.className = 'heatmap-grid';
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const matrix = {};
  days.forEach((_, dy) => { hours.forEach(h => { if (!matrix[dy]) matrix[dy] = {}; matrix[dy][h] = 0; }); });
  messages.forEach(m => { if (matrix[m.dayOfWeek] !== undefined) matrix[m.dayOfWeek][m.hour]++; });
  const maxVal = Math.max(...Object.values(matrix).flatMap(d => Object.values(d)), 1);
  const allCells = [];
  allCells.push('<div class="heatmap-header"></div>' + hours.map(h => `<div class="heatmap-header">${h}</div>`).join(''));
  days.forEach((dy, dIndex) => {
    allCells.push(`<div class="heatmap-label">${dy}</div>`);
    hours.forEach(h => {
      const v = matrix[dIndex][h];
      const ratio = v / maxVal;
      let color;
      if (v === 0) color = '#0a0a12';
      else if (ratio < 0.1) color = '#1a1a3e';
      else if (ratio < 0.25) color = '#3a2a6e';
      else if (ratio < 0.5) color = '#7a5abe';
      else if (ratio < 0.75) color = '#a78bfa';
      else color = '#f472b6';
      allCells.push(`<div class="heatmap-cell" style="background:${color}" title="${days[dIndex]} ${h}:00 — ${v} msgs"></div>`);
    });
  });
  heatmap.innerHTML = allCells.join('');
  panel.appendChild(heatmap);
  cc.appendChild(panel);
}

function addWordCloud(cc, title, words) {
  if (!words || words.length === 0) return;
  const panel = document.createElement('div');
  panel.className = 'chart-panel';
  observeChartPanel(panel);
  const h3 = document.createElement('h3');
  h3.textContent = title;
  panel.appendChild(h3);
  
  const wrap = document.createElement('div');
  wrap.className = 'wordcloud-wrap';
  
  const canvas = document.createElement('canvas');
  canvas.className = 'wordcloud-canvas';
  canvas.width = 600;
  canvas.height = 600;
  wrap.appendChild(canvas);
  panel.appendChild(wrap);
  cc.appendChild(panel);
  
  function drawCloud() {
    const rect = wrap.getBoundingClientRect();
    const displaySize = Math.min(rect.width - 8, 600);
    const dpr = 2;
    canvas.width = displaySize * dpr;
    canvas.height = displaySize * dpr;
    canvas.style.width = displaySize + 'px';
    canvas.style.height = displaySize + 'px';
    
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    const cx = displaySize / 2;
    const cy = displaySize / 2;
    const maxR = Math.min(cx, cy) - 16;
    
    const palette = ['#a78bfa', '#c4a8ff', '#f472b6', '#e0e0e0', '#d4bfff', '#f9a8d4', '#7a5abe', '#c084fc', '#e879f9', '#b794f4'];
    
    const maxCount = words[0].count;
    const display = words.slice(0, 40);
    
    ctx.clearRect(0, 0, displaySize, displaySize);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    
    const centerWord = display[0];
    const centerRatio = centerWord.count / maxCount;
    const centerSize = Math.max(20, Math.min(40, displaySize / 15 + centerRatio * 30));
    ctx.font = 'bold ' + Math.round(centerSize) + 'px "DM Sans", sans-serif';
    ctx.fillStyle = '#a78bfa';
    ctx.shadowColor = 'rgba(167,139,250,0.35)';
    ctx.shadowBlur = 14;
    ctx.fillText(centerWord.word, cx, cy);
    ctx.shadowBlur = 0;
    
    
    const remaining = display.slice(1);
    const total = remaining.length;
    
    
    const rScale = displaySize / 600;
    const layers = [
      { start: 0, end: Math.min(8, total), radius: maxR * 0.36 * Math.min(rScale * 1.2, 1), sizeMin: 11, sizeMax: 16 },
      { start: 8, end: Math.min(20, total), radius: maxR * 0.60 * Math.min(rScale * 1.2, 1), sizeMin: 10, sizeMax: 14 },
      { start: 20, end: Math.min(39, total), radius: maxR * 0.82 * Math.min(rScale * 1.2, 1), sizeMin: 8, sizeMax: 12 }
    ];
    
    remaining.forEach(function(w, idx) {
      var layer = layers[0];
      for (var li = 0; li < layers.length; li++) {
        if (idx >= layers[li].start && idx < layers[li].end) { layer = layers[li]; break; }
      }
      if (idx >= layers[layers.length - 1].start) layer = layers[layers.length - 1];
      
      var layerIdx = idx - layer.start;
      var layerCount = layer.end - layer.start;
      var angle = (layerIdx / layerCount) * Math.PI * 2 - Math.PI / 2;
      var x = cx + Math.cos(angle) * layer.radius;
      var y = cy + Math.sin(angle) * layer.radius;
      
      var ratio = w.count / maxCount;
      var size = layer.sizeMin + ratio * (layer.sizeMax - layer.sizeMin);
      var opacity = 0.5 + ratio * 0.5;
      var colorIdx = idx % palette.length;
      
      ctx.font = Math.round(size) + 'px "DM Sans", sans-serif';
      ctx.fillStyle = palette[colorIdx];
      ctx.globalAlpha = opacity;
      ctx.fillText(w.word, x, y);
      ctx.globalAlpha = 1;
    });
  }
  
  drawCloud();
  var resizeTimer;
  window.addEventListener('resize', function() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(drawCloud, 100);
  });
}

function init() {
  cacheDOM();
  DOM.uploadZone.addEventListener('click', () => DOM.fileInput.click());
  DOM.uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); DOM.uploadZone.classList.add('dragover'); });
  DOM.uploadZone.addEventListener('dragleave', () => DOM.uploadZone.classList.remove('dragover'));
  DOM.uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    DOM.uploadZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.json')) processFile(file);
  });
  DOM.fileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) processFile(e.target.files[0]);
  });
}

function processFile(file) {
  DOM.fileBadge.classList.remove('hidden');
  DOM.fileNameText.textContent = file.name + ' (' + formatNumber(file.size) + ' B)';
  DOM.results.classList.add('hidden');
  DOM.error.classList.add('hidden');
  DOM.loading.classList.remove('hidden');
  DOM.loaderDetail.textContent = 'Reading file...';
  const reader = new FileReader();
  reader.onprogress = (e) => {
    if (e.lengthComputable) DOM.loaderDetail.textContent = 'Loading... ' + Math.round(e.loaded / e.total * 100) + '%';
  };
  reader.onload = (e) => {
    try {
      DOM.loaderDetail.textContent = 'Parsing JSON...';
      const data = JSON.parse(e.target.result);
      DOM.loaderDetail.textContent = 'Normalizing messages...';
      const { messages: raw, chatTitle, chatType } = normalizeMessages(data);
      DOM.loaderDetail.textContent = 'Unifying ' + formatNumber(raw.length) + ' messages...';
      const unified = unify(raw);
      DOM.loaderDetail.textContent = 'Computing statistics...';
      const stats = analyze(unified, chatTitle, chatType);
      if (!stats) { showError('No messages found in the export.'); return; }
      DOM.loaderDetail.textContent = 'Rendering results...';
      setTimeout(() => render(stats), 50);
    } catch (err) {
      showError('Error: ' + err.message);
      DOM.loading.classList.add('hidden');
    }
  };
  reader.onerror = () => { showError('Error reading file'); DOM.loading.classList.add('hidden'); };
  reader.readAsText(file);
}

document.addEventListener('DOMContentLoaded', init);


var allMessages = [];
var searchTimeout = null;

function addPremiumLock(cc, title, type) {  var panel = document.createElement("div");  panel.className = "chart-panel";  var h3 = document.createElement("h3");  h3.textContent = title;  panel.appendChild(h3);  var lock = document.createElement("div");  lock.className = "premium-chart-lock";  var icon = type === "trend" ? "fa-chart-line" : type === "heatmap" ? "fa-clock" : "fa-clock";  lock.innerHTML = "<div class="pcl-icon"><i class="fas " + icon + ""></i></div><div class="pcl-text"><i class="fas fa-crown" style="color:#c084fc;font-size:10px"></i> Premium feature</div><div class="pcl-sub">Sign in with Premium to unlock " + title.toLowerCase() + "</div>";  panel.appendChild(lock);  cc.appendChild(panel);  observeChartPanel(panel);}
function addPremiumStar(){
  var b=document.getElementById('pdfExportBtn');
  if(!b||b.querySelector('.ps'))return;
  b.classList.add('premium-btn');
  var s=document.createElement('i');
  s.className='ps fas fa-star';
  b.appendChild(s);
}

function initSearch(messages) {
    allMessages = messages;
    document.getElementById('toolbar').style.display = 'flex';
}

function handleSearch(query) {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(function() { executeSearch(query); }, 200);
}

function executeSearch(query) {
    var container = document.getElementById('searchResults');
    var countEl = document.getElementById('searchCount');
    query = query.trim();
    if (!query) {
        container.style.display = 'none';
        countEl.textContent = '';
        return;
    }
    var q = query.toLowerCase();
    var results = [];
    for (var i = 0; i < allMessages.length; i++) {
        var m = allMessages[i];
        var text = (m.text || '').toLowerCase();
        if (text.indexOf(q) !== -1) {
            var ctxBefore = i > 0 ? allMessages[i - 1] : null;
            var ctxAfter = i < allMessages.length - 1 ? allMessages[i + 1] : null;
            results.push({ msg: m, ctxBefore: ctxBefore, ctxAfter: ctxAfter });
        }
    }
    countEl.textContent = results.length + ' found';
    if (results.length === 0) {
        container.innerHTML = '<div class="search-results-empty">No messages found for "' + query + '"</div>';
        container.style.display = 'block';
        return;
    }
    var html = '';
    var maxResults = 200;
    var shown = Math.min(results.length, maxResults);
    for (var j = 0; j < shown; j++) {
        var r = results[j];
        var date = new Date(r.msg.timestamp);
        var dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        var text = (r.msg.text || '').substring(0, 500);
        var highlighted = highlightText(text, query);
        var ctxHtml = '';
        if (r.ctxBefore) {
            ctxHtml += '<span>' + escapeHtml((r.ctxBefore.text || '').substring(0, 80)) + '</span>';
        }
        if (r.ctxBefore && r.ctxAfter) ctxHtml += ' <span style="color:var(--border-light)">→</span> ';
        if (r.ctxAfter) {
            ctxHtml += '<span>' + escapeHtml((r.ctxAfter.text || '').substring(0, 80)) + '</span>';
        }
        html += '<div class="search-result-item">' +
            '<div class="sr-header"><span class="sr-author">' + escapeHtml(r.msg.sender) + '</span><span class="sr-date">' + dateStr + '</span></div>' +
            '<div class="sr-text">' + highlighted + '</div>';
        if (ctxHtml) {
            html += '<div class="sr-context">' + ctxHtml + '</div>';
        }
        html += '</div>';
    }
    if (results.length > maxResults) {
        html += '<div class="search-results-empty">... and ' + (results.length - maxResults) + ' more results</div>';
    }
    container.innerHTML = html;
    container.style.display = 'block';
}

function highlightText(text, query) {
    var escaped = escapeHtml(text);
    var idx = escaped.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return escaped;
    return escaped.substring(0, idx) + '<mark>' + escaped.substring(idx, idx + query.length) + '</mark>' + escaped.substring(idx + query.length);
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}


function addUserHeatmap(cc, title, messages, topSenders) {
    if (!messages || messages.length === 0 || !topSenders || topSenders.length < 2) return;
    var panel = document.createElement('div');
    panel.className = 'chart-panel';
    observeChartPanel(panel);
    var h3 = document.createElement('h3');
    h3.textContent = title;
    panel.appendChild(h3);

    var users = topSenders.slice(0, 10).map(function(s) { return s.sender; });
    var matrix = {};
    for (var u = 0; u < users.length; u++) {
        matrix[users[u]] = {};
        for (var hh = 0; hh < 24; hh++) matrix[users[u]][hh] = 0;
    }
    messages.forEach(function(m) {
        if (matrix[m.sender] !== undefined) matrix[m.sender][m.hour]++;
    });
    var maxVal = 0;
    for (var u = 0; u < users.length; u++)
        for (var hh = 0; hh < 24; hh++)
            if (matrix[users[u]][hh] > maxVal) maxVal = matrix[users[u]][hh];
    if (maxVal === 0) maxVal = 1;

    var wrap = document.createElement('div');
    wrap.className = 'user-heatmap-wrap';
    var grid = document.createElement('div');
    grid.className = 'user-heatmap';
    grid.style.gridTemplateColumns = '80px repeat(24, 1fr)';

    var cells = [];
    
    cells.push('<div class="uh-header"></div>');
    for (var hh = 0; hh < 24; hh++) {
        cells.push('<div class="uh-header">' + hh + '</div>');
    }
    grid.innerHTML = cells.join('');

    for (var u = 0; u < users.length; u++) {
        var row = document.createElement('div');
        row.className = 'uh-row';
        var rowHtml = '<div class="uh-label" title="' + escapeHtml(users[u]) + '">' + escapeHtml(users[u]).substring(0, 10) + '</div>';
        for (var hh = 0; hh < 24; hh++) {
            var v = matrix[users[u]][hh];
            var ratio = v / maxVal;
            var color;
            if (v === 0) color = '#0a0a12';
            else if (ratio < 0.1) color = '#1a1a3e';
            else if (ratio < 0.25) color = '#3a2a6e';
            else if (ratio < 0.5) color = '#7a5abe';
            else if (ratio < 0.75) color = '#a78bfa';
            else color = '#f472b6';
            rowHtml += '<div class="uh-cell" style="background:' + color + '" title="' + escapeHtml(users[u]) + ' @ ' + hh + ':00 — ' + v + ' msgs"></div>';
        }
        row.innerHTML = rowHtml;
        grid.appendChild(row);
    }
    wrap.appendChild(grid);
    panel.appendChild(wrap);
    cc.appendChild(panel);
}


function exportPDF() {
    var btn = document.getElementById('pdfExportBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Checking...'; }
    var t = (typeof getToken === 'function' ? getToken() : localStorage.getItem('amenoke_token'));
    if (!t) { if(typeof showLoginModal==='function')showLoginModal(); if(btn){btn.disabled=false;btn.textContent='Export PDF';} return; }
    fetch('/amenodes/api/premium_check.php',{headers:{'Authorization':'Bearer '+t}})
    .then(function(r){return r.json()})
    .then(function(d){
        if(d.success&&d.premium){
            if(btn)btn.textContent='Generating PDF...';
            generatePDF();
        }else{
            if(typeof showLoginModal==='function')showLoginModal();
            if(btn){btn.disabled=false;btn.textContent='Export PDF';}
        }
    })
    .catch(function(){
        if(typeof showLoginModal==='function')showLoginModal();
        if(btn){btn.disabled=false;btn.textContent='Export PDF';}
    });
}

function showPremiumPDFLock() {
    var existing = document.querySelector('.premium-pdf-lock');
    if (existing) return;
    var div = document.createElement('div');
    div.className = 'premium-pdf-lock';
    div.innerHTML = '<span class="lock-icon">&#128274;</span> PDF export is a Premium feature. <a onclick="showLoginModal()">Sign in</a> or <a onclick="showLoginModal()">register</a> to unlock.';
    var container = document.getElementById('searchResults');
    if (container && container.style.display !== 'none') {
        container.parentNode.insertBefore(div, container.nextSibling);
    } else {
        document.getElementById('chartsContainer').parentNode.insertBefore(div, document.getElementById('chartsContainer'));
    }
}

function loadPDFDependencies(callback) {
    var loaded = 0, failed = false;
    function check() { if (!failed) { loaded++; if (loaded >= 2) callback(); } }
    function onError() {
        failed = true;
        var btn = document.getElementById('pdfExportBtn');
        if (btn) { btn.disabled = false; btn.textContent = 'Export PDF'; }
        alert('Failed to load PDF libraries. Check your internet connection and try again.');
    }

    var script1 = document.createElement('script');
    script1.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    script1.onload = check;
    script1.onerror = onError;
    document.head.appendChild(script1);

    var script2 = document.createElement('script');
    script2.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
    script2.onload = check;
    script2.onerror = onError;
    document.head.appendChild(script2);
}

function generatePDF() {
    var pdfBtn = document.getElementById('pdfExportBtn');
    pdfBtn.disabled = true;
    pdfBtn.textContent = 'Building PDF...';
    document.querySelectorAll('.chart-panel').forEach(function(p) { p.classList.add('visible'); });

    var el = document.querySelector('.results');
    if (!el) { pdfBtn.disabled = false; pdfBtn.textContent = 'Export PDF'; return; }

    var { jsPDF } = window.jspdf;
    var pdf = new jsPDF('p', 'mm', 'a4');
    var pw = pdf.internal.pageSize.getWidth();
    var ph = pdf.internal.pageSize.getHeight();
    var margin = 14;
    var contentW = pw - margin * 2;
    var pageIdx = 1;

    
    function addBg() {
        pdf.setFillColor(7, 7, 10);
        pdf.rect(0, 0, pw, ph, 'F');
    }

    function drawCard(y, h) {
        pdf.setFillColor(31, 26, 22);
        pdf.roundedRect(margin, y, contentW, h, 3, 3, 'F');
        pdf.setDrawColor(44, 36, 30);
        pdf.roundedRect(margin, y, contentW, h, 3, 3, 'S');
    }

    
    function getStat(label) {
        var cards = document.querySelectorAll('.stat-card');
        for (var i = 0; i < cards.length; i++) {
            var l = cards[i].querySelector('.stat-label');
            if (l && l.textContent === label) {
                var v = cards[i].querySelector('.stat-value');
                return v ? v.textContent : '';
            }
        }
        return '';
    }

    var accent = [167, 139, 250];
    var textMain = [224, 224, 224];
    var textDim = [136, 136, 136];
    var textMuted = [107, 114, 128];

    
    addBg();
    pdf.setFontSize(32);
    pdf.setTextColor(accent[0], accent[1], accent[2]);
    pdf.text('Chat Analysis Report', pw / 2, 45, { align: 'center' });

    var chatTitle = document.querySelector('.summary-text h2');
    if (chatTitle) {
        pdf.setFontSize(20);
        pdf.setTextColor(textDim[0], textDim[1], textDim[2]);
        pdf.text(chatTitle.textContent, pw / 2, 60, { align: 'center' });
    }

    var msgCount = document.getElementById('msgCount');
    if (msgCount) {
        pdf.setFontSize(14);
        pdf.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
        pdf.text(msgCount.textContent, pw / 2, 73, { align: 'center' });
    }

    pdf.setFontSize(10);
    pdf.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
    pdf.text('Generated on ' + new Date().toLocaleDateString(), pw / 2, 86, { align: 'center' });

    pdf.setDrawColor(accent[0], accent[1], accent[2]);
    pdf.setLineWidth(0.5);
    pdf.line(pw / 2 - 35, 98, pw / 2 + 35, 98);

    
    var chartPanels = document.querySelectorAll('.chart-panel');
    chartPanels.forEach(function(p) { p.classList.add('visible'); });

    
    if (typeof Chart !== 'undefined') {
        Chart.defaults.animation = false;
    }
    chartPanels.forEach(function(p) {
        if (p._chart) {
            p._chart.options.animation = false;
            p._chart.update();
        }
    });

    
    
    var chartData = [];
    var statValues = {};
    document.querySelectorAll('.stat-card').forEach(function(c) {
        var l = c.querySelector('.stat-label');
        var v = c.querySelector('.stat-value');
        if (l && v) statValues[l.textContent] = v.textContent;
    });
    chartPanels.forEach(function(panel) {
        var titleEl = panel.querySelector('h3');
        var title = titleEl ? titleEl.textContent : 'Chart';
        var canvas = panel.querySelector('canvas');
        if (canvas) {
            try {
                var dataUrl = canvas.toDataURL('image/png');
                chartData.push({ dataUrl: dataUrl, title: title, width: canvas.width, height: canvas.height });
            } catch(e) {
                
            }
        }
    });

    
    
    var hasHtmlPanels = false;
    chartPanels.forEach(function(panel) {
        if (!panel.querySelector('canvas') && (panel.querySelector('.heatmap-grid') || panel.querySelector('.wordcloud') || panel.querySelector('.user-heatmap'))) {
            hasHtmlPanels = true;
        }
    });

    function buildPDFAndSave() {
        try {
            
            
            pdf.addPage();
            addBg();
            pdf.setFontSize(22);
            pdf.setTextColor(accent[0], accent[1], accent[2]);
            pdf.text('Statistics Overview', margin, 24);

            var statCards = document.querySelectorAll('.stat-card');
            var cardH = 24;
            var yPos = 36;
            statCards.forEach(function(card, i) {
                if (yPos + cardH > ph - margin) {
                    pdf.addPage();
                    addBg();
                    yPos = 22;
                }
                drawCard(yPos, cardH);
                var label = card.querySelector('.stat-label');
                var value = card.querySelector('.stat-value');
                var sub = card.querySelector('.stat-sublabel');
                pdf.setFontSize(9);
                pdf.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
                pdf.text(label ? label.textContent : '', margin + 6, yPos + 7);
                pdf.setFontSize(16);
                pdf.setTextColor(textMain[0], textMain[1], textMain[2]);
                pdf.text(value ? value.textContent : '', margin + 6, yPos + 19);
                if (sub) {
                    pdf.setFontSize(8);
                    pdf.setTextColor(textDim[0], textDim[1], textDim[2]);
                    var subText = sub.textContent;
                    if (subText.length > 55) subText = subText.substring(0, 55) + '...';
                    pdf.text(subText, margin + contentW - 6, yPos + 19, { align: 'right' });
                }
                yPos += cardH + 3;
            });

            pdf.setFontSize(9);
            pdf.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
            pdf.text('Page ' + pageIdx++, pw / 2, ph - 10, { align: 'center' });

            
            chartData.forEach(function(chart, idx) {
                pdf.addPage();
                addBg();

                var imgData = chart.dataUrl;
                var imgW = contentW;
                var imgH = (chart.height / chart.width) * imgW;
                if (imgH > 150) imgH = 150;
                if (imgH < 60) imgH = 60;

                
                pdf.setFontSize(18);
                pdf.setTextColor(accent[0], accent[1], accent[2]);
                pdf.text(chart.title, margin, 20);

                
                var chartY = 28;
                pdf.addImage(imgData, 'PNG', margin, chartY, imgW, imgH);

                
                var explanation = getChartExplanation(chart.title);
                var expY = chartY + imgH + 12;
                if (explanation) {
                    pdf.setFontSize(14);
                    pdf.setTextColor(textDim[0], textDim[1], textDim[2]);
                    var expLines = pdf.splitTextToSize(explanation, contentW - 8);
                    if (expLines.length > 8) expLines = expLines.slice(0, 8);
                    var textH = expLines.length * 7;
                    if (expY + textH < ph - 20) {
                        pdf.text(expLines, margin + 4, expY + 7);
                        expY += textH + 10;
                    } else {
                        pdf.addPage(); addBg(); pageIdx++;
                        expY = 16;
                        pdf.text(expLines, margin + 4, expY + 7);
                        expY += textH + 10;
                    }
                }

                
                var insight = getChartInsight(chart.title);
                if (insight && expY < ph - 50) {
                    var iLines = pdf.splitTextToSize(insight, contentW - 8);
                    if (iLines.length > 6) iLines = iLines.slice(0, 6);
                    var textH = iLines.length * 6 + 6;
                    if (expY + textH < ph - 15) {
                        pdf.setFontSize(12);
                        pdf.setTextColor(accent[0], accent[1], accent[2]);
                        pdf.text('Data Insight', margin + 4, expY + 5);
                        pdf.setFontSize(12);
                        pdf.setTextColor(textDim[0], textDim[1], textDim[2]);
                        pdf.text(iLines, margin + 4, expY + 17);
                        expY += textH + 8;
                    }
                }

                
                if (expY < ph - 35) {
                    var ds = getChartDataSummary(chart.title, statValues);
                    if (ds) {
                        var sl = pdf.splitTextToSize(ds, contentW - 8);
                        if (expY + sl.length * 6 < ph - 12) {
                            pdf.setFontSize(11);
                            pdf.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
                            pdf.text(sl, margin + 4, expY + 6);
                        }
                    }
                }

                
                pdf.setFontSize(9);
                pdf.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
                pdf.text('Page ' + pageIdx, pw / 2, ph - 10, { align: 'center' });
            });

            pdf.save('chat-analysis-report.pdf');
            pdfBtn.disabled = false;
            pdfBtn.textContent = 'Export PDF';
        } catch(e) {
            console.error('PDF error:', e);
            pdfBtn.disabled = false;
            pdfBtn.textContent = 'Export PDF';
        }
    }

    buildPDFAndSave();

}


function getChartExplanation(title) {
    var e = {};
    e['Messages Over Time'] = 'Line chart showing daily message count throughout the analyzed period.';
    e['Activity by Hour'] = 'Bar chart showing messages per hour (24h format). Reveals peak activity hours.';
    e['Activity by Day of Week'] = 'Message volume by day of the week. Shows which days have most conversation activity.';
    e['Monthly Activity'] = 'Total messages per month. High-level view of chat growth trajectory.';
    e['Participants Activity'] = 'Most active participants ranked by total messages. Distribution of contribution among members.';
    e['Message Length Distribution'] = 'Distribution of message lengths. Short = quick exchanges, long = detailed discussions.';
    e['Response Time Distribution'] = 'How quickly participants respond. Fast = real-time, slow = async discussion.';
    e['Top Emojis'] = 'Most frequently used emojis. Reflects emotional tone and cultural style of conversation.';
    e['Activity Heatmap'] = 'Activity across hours and days. Darker = higher volume, reveals community active patterns.';
    e['Top Words'] = 'Most frequently used words. Larger = more often, reveals main topics and themes.';
    e['Media Type Breakdown'] = 'Shared media by type (photos, videos, stickers, etc). Shows media-sharing preferences.';
    e['Most Replied To'] = 'Participants who receive the most replies. Indicates community leaders and discussion starters.';
    e['Cumulative Messages'] = 'Cumulative message growth over time. Steady line = consistent engagement.';
    e['Messages per Sender'] = 'Each participant share of total messages. Visualizes contribution balance.';
    e['User Activity by Hour'] = 'Per-user heatmap showing when each participant sends messages. Reveals chronotypes.';
    return e[title] || 'Chart visualizing chat statistics from Telegram export data.';
}


function getChartDataSummary(title, s) {
    var t = s['Total Messages'] || '--';
    var p = s['Messages per Day'] || '--';
    var u = s['Participants'] || '--';
    var ds = {};
    ds['Messages Over Time'] = 'Total: ' + t + ' - ' + p + ' per day';
    ds['Activity by Hour'] = 'Night activity: ' + (s['Night Activity'] || '--');
    ds['Activity by Day of Week'] = 'Based on ' + t + ' messages';
    ds['Monthly Activity'] = 'Tracking ' + t + ' messages';
    ds['Participants Activity'] = u + ' participants';
    ds['Message Length Distribution'] = 'Avg length: ' + (s['Avg. Message Length'] || '--');
    ds['Response Time Distribution'] = 'Across ' + t + ' messages';
    ds['Top Emojis'] = 'Emojis: ' + (s['Emojis Used'] || '--');
    ds['Activity Heatmap'] = t + ' msgs 7d x 24h';
    ds['Top Words'] = 'From ' + t + ' messages';
    ds['Media Type Breakdown'] = 'Media: ' + (s['Media Messages'] || '--');
    ds['Most Replied To'] = 'Replies: ' + (s['Replies'] || '--');
    ds['Cumulative Messages'] = 'Growth: ' + t + ' at ' + p + '/day';
    ds['Messages per Sender'] = 'Among ' + u + ' participants';
    ds['User Activity by Hour'] = u + ' participant patterns';
    return ds[title] || null;
}

function getChartInsight(title) {
    function getVal(label) {
        var cards = document.querySelectorAll('.stat-card');
        for (var i = 0; i < cards.length; i++) {
            var l = cards[i].querySelector('.stat-label');
            if (l && l.textContent === label) {
                var v = cards[i].querySelector('.stat-value');
                return v ? v.textContent : '';
            }
        }
        return '';
    }

    var total = getVal('Total Messages');
    var perDay = parseFloat(getVal('Messages per Day'));
    var respTime = getVal('Avg. Response Time');
    var nightPct = parseFloat(getVal('Night Activity'));
    var mediaPct = parseFloat(getVal('Media Messages'));
    var avgLen = parseFloat(getVal('Avg. Message Length'));
    var emojis = getVal('Emojis Used');
    var participants = getVal('Participants');
    var replies = getVal('Replies');

    var insights = {
        'Messages Over Time': (function() {
            if (perDay > 100) return 'High activity: ' + perDay + ' msgs/day — ' + (perDay > 200 ? 'extremely active chat, likely a large community or support group.' : 'very active chat with frequent discussions.');
            if (perDay > 30) return 'Moderate activity: ' + perDay + ' msgs/day — typical for a medium-sized interest group or friend circle.';
            return 'Low activity: ' + perDay + ' msgs/day — a quiet chat with occasional messages, typical for small or topic-specific groups.';
        })(),
        'Activity by Hour': (function() {
            return 'Chat activity peaks during certain hours. Most group chats see 40-60% of messages during daytime (8:00-18:00). Your night activity (' + (nightPct || 'N/A') + '%) ' + (nightPct > 50 ? 'is above average, suggesting a night-owl audience.' : 'is within normal range for a mixed-audience chat.');
        })(),
        'Activity by Day of Week': (function() {
            return 'Weekend activity typically makes up 28-35% of total messages in social chats. Compare your weekend vs weekday ratio to understand the chat\'s primary use case — work-related chats are mostly Mon-Fri.';
        })(),
        'Monthly Activity': (function() {
            return 'Tracking monthly trends helps identify the chat\'s growth trajectory. A growing chat shows increasing monthly volume; decline may indicate reduced engagement or migration to other platforms.';
        })(),
        'Participants Activity': (function() {
            return 'In most group chats, the top 2 participants account for 40-60% of all messages. A more balanced distribution (>60% outside top 2) indicates an inclusive chat, while heavy dominance (>80%) suggests a broadcast-style channel.';
        })(),
        'Message Length Distribution': (function() {
            if (avgLen > 200) return 'Long messages dominate (avg ' + avgLen + ' chars) — this is typical for technical or discussion-heavy chats where detailed responses are common.';
            if (avgLen > 80) return 'Medium-length messages (avg ' + avgLen + ' chars) — balanced chat with a mix of quick replies and thoughtful posts.';
            return 'Short messages (avg ' + avgLen + ' chars) — fast-paced conversational style, common in social or friend group chats.';
        })(),
        'Response Time Distribution': (function() {
            return 'Average response time: ' + (respTime || 'N/A') + '. Real-time chats average under 5 minutes between responses. Slower response times (>1h) indicate an async-style chat where participants reply at their own pace.';
        })(),
        'Top Emojis': (function() {
            return 'Emoji usage: ' + (emojis || 'N/A') + ' total. High emoji usage (1000+) indicates an expressive, casual chat culture. The most-used emojis reflect the group\'s emotional tone — humor, affection, or celebration.';
        })(),
        'Activity Heatmap': (function() {
            return 'The heatmap shows activity clusters across days and hours. Most chats have 1-2 peak hours where 20-30% of daily messages are concentrated. Multiple peaks suggest a globally distributed audience.';
        })(),
        'Top Words': (function() {
            return 'Word frequency reveals the chat\'s main topics and jargon. Compare with emoji usage to understand whether the chat is information-focused (many nouns/terms) or socially-oriented (many greetings, pronouns, reactions).';
        })(),
        'Media Type Breakdown': (function() {
            if (mediaPct > 30) return 'High media ratio: ' + mediaPct + '% — this chat shares lots of photos, videos, and stickers. Common in design, photography, or entertainment groups.';
            if (mediaPct > 10) return 'Moderate media: ' + mediaPct + '% — a balanced mix of text and media sharing. Typical for general interest groups.';
            return 'Low media: ' + mediaPct + '% — primarily text-based chat. Common in technical or professional discussion groups.';
        })(),
        'Most Replied To': (function() {
            return 'Participants who receive the most replies are often community leaders, support staff, or frequent question-askers. A high reply count (top person > 100) indicates an engaged, responsive community.';
        })(),
        'Cumulative Messages': (function() {
            if (perDay > 100) return 'Rapid growth: ' + perDay + ' msgs/day — the chat is growing quickly. A linear or accelerating curve suggests sustained interest.';
            if (perDay > 30) return 'Steady growth: ' + perDay + ' msgs/day — the chat maintains consistent engagement over time.';
            return 'Slow growth: ' + perDay + ' msgs/day — the chat grows gradually, typical for niche or long-running communities.';
        })(),
        'Messages per Sender': (function() {
            return 'Distribution of messages across ' + (participants || 'N/A') + ' participants. A healthy group chat has at least 30-40% of members actively contributing. If fewer than 20% of participants send 80% of messages, the chat may have a lurkers majority.';
        })(),
        'User Activity by Hour': (function() {
            return 'This per-user heatmap reveals different chronotypes in the chat — early birds vs night owls. Overlapping active hours suggest the best times for real-time group discussions.';
        })()
    };
    return insights[title] || null;
}

window.handleSearch = handleSearch;
window.exportPDF = exportPDF;


if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(function() { cacheDOM(); init(); }, 10);
}

})();