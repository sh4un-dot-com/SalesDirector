export const normalizeEmail = (email = '') => email.trim().toLowerCase();

export const isValidEmail = (email = '') => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

export const splitCsvRows = (csvText = '') => {
  const rows = [];
  let current = '';
  let insideQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const next = csvText[i + 1];

    if (char === '"') {
      current += char;
      if (next === '"') {
        current += next;
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (char === '\r') continue;

    if (char === '\n' && !insideQuotes) {
      if (current.trim()) rows.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  if (current.trim()) rows.push(current);
  return rows;
};

export const parseCsvLine = (line = '') => {
  const values = [];
  let current = '';
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (insideQuotes && next === '"') {
        current += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values;
};

export const toContactFromRow = (headers, rowValues) => {
  const row = {};
  headers.forEach((header, index) => {
    row[header] = (rowValues[index] || '').trim();
  });

  const email = normalizeEmail(row.email || row['e-mail']);
  if (!isValidEmail(email)) return null;

  const name =
    row.name ||
    `${row.firstname || row['first_name'] || ''} ${row.lastname || row['last_name'] || ''}`.trim() ||
    'Unknown';

  return {
    name,
    company: row.company || row.organization || '',
    jobTitle: row.jobtitle || row.title || '',
    email,
    phone: row.phone || '',
    stage: row.stage || row.lifecyclestage || 'Lead',
    linkedin: row.linkedin || '',
    notes: row.notes || '',
    status: row.status || 'New'
  };
};

export const applyTaskPrioritization = (lines, tasks) => {
  const updatedTasks = [...tasks];

  lines.forEach((line) => {
    const parts = line.split('||').map(part => part.trim());
    const taskId = parseInt((parts[0] || '').replace(/[^\d]/g, ''), 10);
    const taskIndex = updatedTasks.findIndex(task => task.id === taskId);
    if (taskIndex === -1) return;

    const parsedScore = parseInt((parts[1] || '').replace(/[^\d]/g, ''), 10);
    updatedTasks[taskIndex] = {
      ...updatedTasks[taskIndex],
      priority: Number.isNaN(parsedScore) ? 50 : Math.max(1, Math.min(parsedScore, 100)),
      time: parts[2] || '',
      rationale: parts[3] || ''
    };
  });

  updatedTasks.sort((a, b) => {
    if (a.status === 'completed' && b.status !== 'completed') return 1;
    if (a.status !== 'completed' && b.status === 'completed') return -1;
    return (b.priority || 0) - (a.priority || 0);
  });

  return updatedTasks;
};

export const parseInboxScoreSummary = (text = '') => {
  const normalized = String(text || '').trim();
  if (!normalized) return null;

  const scoreMatch = normalized.match(/score\s*[:=-]\s*(\d{1,3})(?:\s*\/\s*100)?/i);
  const summaryMatch = normalized.match(/summary\s*[:=-]\s*([\s\S]+)/i);
  if (!scoreMatch || !summaryMatch) return null;

  return {
    score: Math.max(1, Math.min(parseInt(scoreMatch[1], 10), 100)),
    summary: summaryMatch[1].trim().replace(/^[-*•\s]+/, '')
  };
};
