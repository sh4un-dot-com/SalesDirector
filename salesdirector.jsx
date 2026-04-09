import React, { useState, useEffect, useRef } from 'react';
import { 
  Mail, Users, Settings, Activity, Send, 
  RefreshCw, CheckCircle, AlertCircle, Wand2, 
  FileText, MessageSquare, Database, Server, Key,
  ChevronRight, Search, Inbox, Edit3, Globe,
  Lock, User, Shield, SlidersHorizontal, Sparkles, UploadCloud, ListChecks,
  Briefcase, TrendingUp, Save, Calendar, ShieldAlert, Layers,
  Phone, Moon, Sun, Clock, X, PenTool, Type, Plus, Trash2, Linkedin,
  CheckSquare, CalendarDays, MoreVertical, Play, Check
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import {
  normalizeEmail,
  isValidEmail,
  splitCsvRows,
  parseCsvLine,
  toContactFromRow,
  applyTaskPrioritization,
  parseInboxScoreSummary
} from './utils/dataParsers.mjs';

// Firebase Initialization
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const CONFIG_STORAGE_KEY = 'salesdirector.config.v1';
const PERSISTED_CONFIG_KEYS = [
  'apiBaseUrl',
  'companyUrl',
  'senderName',
  'replyTo',
  'autoBcc',
  'signature',
  'smtpHost',
  'smtpPort',
  'smtpSecure',
  'smtpUser',
  'imapHost',
  'imapPort',
  'maxDailyEmails',
  'sendDelay',
  'activeHoursStart',
  'activeHoursEnd',
  'timezone',
  'defaultTone',
  'defaultLength',
  'selectedAI'
];

// Main Application Component
export default function App() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('outreach');
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  
  // CRM Modals
  const [selectedContact, setSelectedContact] = useState(null);
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [contactToDelete, setContactToDelete] = useState(null);

  // App State
  const [contacts, setContacts] = useState([]);
  const [threads, setThreads] = useState({});
  const [tasks, setTasks] = useState([
    { id: 1, contact: 'Sarah Jenkins', company: 'TechFlow Inc', type: 'Follow-up Email', status: 'pending', priority: null, time: '', rationale: '' },
    { id: 2, contact: 'Marcus Chen', company: 'Global Logistics', type: 'Send Pricing Proposal', status: 'pending', priority: null, time: '', rationale: '' }
  ]);
  const [newTaskInput, setNewTaskInput] = useState('');

  const [inboxEmails, setInboxEmails] = useState([
    { id: 101, fromName: 'David Zhang', company: 'Enterprise Corp', fromEmail: 'david.z@enterprise.example.com', subject: 'Re: 14-day trial for TechFlow', body: 'Hi JD,\n\nWe discussed this internally and are interested, but we have concerns about the integration timeline. Can we schedule a quick call to go over the API docs?\n\nThanks,\nDavid', date: '10:30 AM', aiSummary: '', aiScore: null, needsResponse: true },
    { id: 102, fromName: 'Rachel Green', company: 'Startup IO', fromEmail: 'rachel@startup.example.com', subject: 'Not right now', body: 'Please remove me from your list. We just signed with a competitor.', date: 'Yesterday', aiSummary: '', aiScore: null, needsResponse: false },
    { id: 103, fromName: 'Michael Scott', company: 'Paper Co', fromEmail: 'mscott@paperco.example.com', subject: 'Pricing details', body: 'Can you send over the pricing for the enterprise tier? I need to show my CFO.', date: 'Monday', aiSummary: '', aiScore: null, needsResponse: true }
  ]);
  
  const [config, setConfig] = useState({
    apiBaseUrl: '',
    proxySecret: '',
    companyUrl: '',
    hubspotToken: '',
    senderName: '',
    replyTo: '',
    autoBcc: '',
    signature: 'Best regards,\n\nJohn Doe\nSales Director | Akita Engineering\nwww.akitaengineering.com',
    smtpHost: '',
    smtpPort: '587',
    smtpSecure: 'tls',
    smtpUser: '',
    smtpPass: '',
    imapHost: '',
    imapPort: '993',
    maxDailyEmails: '100',
    sendDelay: '30',
    activeHoursStart: '09:00',
    activeHoursEnd: '17:00',
    timezone: 'EST',
    defaultTone: 'Professional',
    defaultLength: 'Concise',
    selectedAI: 'gemini',
    geminiKey: '',
    openaiKey: '',
    anthropicKey: '',
    xaiKey: '',
    metaKey: ''
  });

  const [composerState, setComposerState] = useState({
    recipientName: '',
    jobTitle: '',
    companyName: '',
    to: '',
    hubspotId: null,
    subject: '',
    body: '',
    aiContext: '',
    threadHistory: '',
    objection: '',
    tone: 'Persuasive',
    length: 'Concise',
    suggestedSubjects: []
  });
  const [configErrors, setConfigErrors] = useState({});
  const [composerErrors, setComposerErrors] = useState({});
  const notificationTimerRef = useRef(null);
  const activeAIRequestRef = useRef(null);
  const hasLoadedLocalConfigRef = useRef(false);

  // Firebase Auth & Data Sync
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth error:", err);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const contactsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'contacts');
    const unsubContacts = onSnapshot(contactsRef, (snapshot) => {
      const loaded = [];
      snapshot.forEach(d => loaded.push({ id: d.id, ...d.data() }));
      setContacts(loaded);
    }, (err) => console.error("Contacts sync error:", err));

    const threadsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'threads');
    const unsubThreads = onSnapshot(threadsRef, (snapshot) => {
      const loaded = {};
      snapshot.forEach(d => {
        loaded[d.id] = d.data();
      });
      setThreads(loaded);
    }, (err) => console.error("Threads sync error:", err));

    return () => {
      unsubContacts();
      unsubThreads();
    };
  }, [user]);

  useEffect(() => {
    setComposerState(prev => ({ 
      ...prev, 
      tone: config.defaultTone, 
      length: config.defaultLength 
    }));
  }, [config.defaultTone, config.defaultLength]);

  useEffect(() => {
    if (hasLoadedLocalConfigRef.current) return;
    hasLoadedLocalConfigRef.current = true;

    if (typeof window === 'undefined') return;

    try {
      const raw = window.localStorage.getItem(CONFIG_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        const safeConfig = {};
        PERSISTED_CONFIG_KEYS.forEach((key) => {
          if (Object.prototype.hasOwnProperty.call(parsed, key)) {
            safeConfig[key] = parsed[key];
          }
        });
        setConfig(prev => ({ ...prev, ...safeConfig }));
      }
    } catch {
      // Ignore malformed local storage data and continue with defaults.
    }
  }, []);

  useEffect(() => {
    if (!hasLoadedLocalConfigRef.current || typeof window === 'undefined') return;
    try {
      const safeConfig = {};
      PERSISTED_CONFIG_KEYS.forEach((key) => {
        safeConfig[key] = config[key];
      });
      window.localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(safeConfig));
    } catch {
      // Ignore local storage write failures (private mode/quota).
    }
  }, [config]);

  useEffect(() => {
    return () => {
      if (notificationTimerRef.current) {
        clearTimeout(notificationTimerRef.current);
      }
      if (activeAIRequestRef.current) {
        activeAIRequestRef.current.abort();
      }
    };
  }, []);

  const showNotification = (message, type = 'success') => {
    if (notificationTimerRef.current) {
      clearTimeout(notificationTimerRef.current);
    }
    setNotification({ message, type });
    notificationTimerRef.current = setTimeout(() => {
      setNotification(null);
      notificationTimerRef.current = null;
    }, 3000);
  };

  const getApiBaseUrl = () => (config.apiBaseUrl || '').trim().replace(/\/+$/, '');

  const getComposerFieldError = (name, value) => {
    const trimmed = (value || '').trim();
    if (name === 'to' && trimmed && !isValidEmail(normalizeEmail(trimmed))) {
      return 'Enter a valid recipient email address.';
    }
    return '';
  };

  const getConfigFieldError = (name, value, nextConfig) => {
    const trimmed = String(value || '').trim();

    if (name === 'apiBaseUrl' && trimmed && !/^https?:\/\/.+/i.test(trimmed)) {
      return 'Use a full URL starting with http:// or https://';
    }

    if (name === 'companyUrl' && trimmed && !/^https?:\/\/.+/i.test(trimmed)) {
      return 'Use a full URL starting with http:// or https://';
    }

    if ((name === 'replyTo' || name === 'autoBcc' || name === 'smtpUser') && trimmed && !isValidEmail(trimmed)) {
      return 'Enter a valid email address.';
    }

    if (name === 'maxDailyEmails') {
      const parsed = Number(trimmed);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5000) {
        return 'Enter a whole number between 1 and 5000.';
      }
    }

    if (name === 'sendDelay') {
      const parsed = Number(trimmed);
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 3600) {
        return 'Enter a whole number between 0 and 3600 seconds.';
      }
    }

    const start = nextConfig.activeHoursStart;
    const end = nextConfig.activeHoursEnd;
    if ((name === 'activeHoursStart' || name === 'activeHoursEnd') && start && end && start >= end) {
      return 'Start time must be earlier than end time.';
    }

    return '';
  };

  const handleConfigChange = (e) => {
    const { name, value } = e.target;
    setConfig(prev => {
      const nextConfig = { ...prev, [name]: value };
      setConfigErrors(prevErrors => {
        const nextErrors = { ...prevErrors, [name]: getConfigFieldError(name, value, nextConfig) };

        if (name === 'activeHoursStart' || name === 'activeHoursEnd') {
          const rangeError = (nextConfig.activeHoursStart && nextConfig.activeHoursEnd && nextConfig.activeHoursStart >= nextConfig.activeHoursEnd)
            ? 'Start time must be earlier than end time.'
            : '';
          nextErrors.activeHoursStart = rangeError;
          nextErrors.activeHoursEnd = rangeError;
        }

        return nextErrors;
      });

      return nextConfig;
    });
  };

  const handleComposerChange = (e) => {
    const { name, value } = e.target;
    setComposerErrors(prev => ({ ...prev, [name]: getComposerFieldError(name, value) }));
    setComposerState(prev => ({ ...prev, [name]: value }));
  };

  const insertMergeTag = (tag) => {
    const textArea = document.querySelector('textarea[name="body"]');
    if (textArea) {
      const startPos = textArea.selectionStart;
      const endPos = textArea.selectionEnd;
      setComposerState(prev => {
        const newBody = prev.body.substring(0, startPos) + tag + prev.body.substring(endPos);
        return { ...prev, body: newBody };
      });
    } else {
      setComposerState(prev => ({ ...prev, body: prev.body + tag }));
    }
  };

  const clearSavedPreferences = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(CONFIG_STORAGE_KEY);
    }
    showNotification('Saved local settings cleared.', 'success');
  };

  const callHubSpotAPI = async ({ resource, method = 'GET', query = '', body }) => {
    const proxyBaseUrl = getApiBaseUrl();

    if (proxyBaseUrl) {
      const headers = { 'Content-Type': 'application/json' };
      if (config.proxySecret) {
        headers['x-proxy-secret'] = config.proxySecret;
      }

      const proxyPath = resource === 'contacts' ? '/api/hubspot/contacts' : '/api/hubspot/emails';
      const proxyQuery = query ? `?${query}` : '';

      const response = await fetch(`${proxyBaseUrl}${proxyPath}${proxyQuery}`, {
        method,
        headers,
        ...(body ? { body: JSON.stringify(body) } : {})
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || `HubSpot proxy request failed: ${response.status}`);
      }
      return data;
    }

    if (!config.hubspotToken) {
      throw new Error('Please configure your HubSpot Access Token in Settings first.');
    }

    const directPath = resource === 'contacts'
      ? `/crm/v3/objects/contacts${query ? `?${query}` : ''}`
      : '/crm/v3/objects/emails';

    const response = await fetch(`https://api.hubapi.com${directPath}`, {
      method,
      headers: {
        Authorization: `Bearer ${config.hubspotToken}`,
        'Content-Type': 'application/json'
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message || `HubSpot API error: ${response.status}`);
    }
    return data;
  };

  // --- Task Management Logic ---
  const addTask = (e) => {
    e.preventDefault();
    if (!newTaskInput.trim()) return;
    const newTask = {
      id: Date.now(),
      contact: 'General Task',
      company: 'Internal',
      type: newTaskInput,
      status: 'pending',
      priority: null,
      time: '',
      rationale: ''
    };
    setTasks(prev => [newTask, ...prev]);
    setNewTaskInput('');
    showNotification("Task added.");
  };

  const toggleTaskStatus = (taskId) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: t.status === 'pending' ? 'completed' : 'pending' } : t));
  };
  
  const deleteTask = (taskId) => {
    setTasks(prev => prev.filter(t => t.id !== taskId));
    showNotification("Task removed.");
  };

  // --- CRM Logic ---

  const openAddContact = () => {
    setEditingContact({ name: '', email: '', company: '', jobTitle: '', phone: '', stage: 'Lead', linkedin: '', notes: '', _isNew: true });
    setIsContactModalOpen(true);
  };

  const openEditContact = (contact, e) => {
    e.stopPropagation();
    setEditingContact({ ...contact, _isNew: false });
    setIsContactModalOpen(true);
  };

  const handleContactFormChange = (e) => {
    setEditingContact(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const saveContact = async () => {
    const normalizedEmail = normalizeEmail(editingContact?.email || '');

    if (!user || !normalizedEmail) {
      showNotification("Email is required to save a contact.", "error");
      return;
    }
    if (!isValidEmail(normalizedEmail)) {
      showNotification("Please provide a valid email address.", "error");
      return;
    }

    setLoading(true);
    try {
      const contactData = { ...editingContact, email: normalizedEmail };
      delete contactData._isNew; 
      
      const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'contacts', normalizedEmail);
      await setDoc(docRef, contactData, { merge: true });
      showNotification(`Contact ${editingContact._isNew ? 'added' : 'updated'} successfully!`);
      setIsContactModalOpen(false);
      setEditingContact(null);
    } catch (err) {
      console.error(err);
      showNotification("Failed to save contact.", "error");
    } finally {
      setLoading(false);
    }
  };

  const deleteContact = async () => {
    if (!user || !contactToDelete) return;
    setLoading(true);
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'contacts', normalizeEmail(contactToDelete.email)));
      showNotification("Contact deleted securely.");
      setContactToDelete(null);
    } catch (err) {
      console.error(err);
      showNotification("Failed to delete contact.", "error");
    } finally {
      setLoading(false);
    }
  };

  const openDossier = (contact) => {
    const contactThreads = threads[normalizeEmail(contact.email)]?.messages || [];
    const historyString = contactThreads.length > 0 
      ? contactThreads.map(m => `[${new Date(m.date).toLocaleDateString()}] ${m.direction === 'outbound' ? 'You' : 'Prospect'} wrote:\nSubject: ${m.subject || 'No Subject'}\n${m.body}`).join('\n\n')
      : '';
      
    setSelectedContact({ ...contact, historyString, messages: contactThreads });
  };

  // --- AI Integration Logic ---
  const callGeminiAPI = async (promptText, options = {}) => {
    const { abortPrevious = true } = options;
    const proxyBaseUrl = getApiBaseUrl();
    const usingProxy = Boolean(proxyBaseUrl);
    const apiKey = (config.geminiKey || '').trim();
    if (!usingProxy && !apiKey) {
      throw new Error("Add your Gemini API key in Settings before using AI features.");
    }

    if (abortPrevious && activeAIRequestRef.current) {
      activeAIRequestRef.current.abort();
    }
    const controller = new AbortController();
    activeAIRequestRef.current = controller;

    const url = usingProxy
      ? `${proxyBaseUrl}/api/gemini`
      : `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    
    const payload = {
      contents: [{ parts: [{ text: promptText }] }],
      systemInstruction: {
        parts: [{ text: "You are an elite Virtual Sales Director. You have unparalleled skills in B2B sales strategy, psychology, negotiation, and high-conversion copywriting. Your advice is cutting-edge. CRITICAL RULE: Absolutely NO emojis under any circumstances." }]
      }
    };

    const proxyPayload = {
      promptText,
      systemInstruction: payload.systemInstruction
    };

    const headers = { 'Content-Type': 'application/json' };
    if (usingProxy && config.proxySecret) {
      headers['x-proxy-secret'] = config.proxySecret;
    }

    let retries = 5;
    let delay = 1000;

    try {
      while (retries > 0) {
        try {
          const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(usingProxy ? proxyPayload : payload),
            signal: controller.signal
          });
          
          if (!response.ok) {
            const failed = await response.json().catch(() => ({}));
            throw new Error(failed.error || 'Network response was not ok');
          }
          
          const data = await response.json();
          return data.candidates?.[0]?.content?.parts?.[0]?.text || "No response generated.";
        } catch (error) {
          if (error?.name === 'AbortError') {
            throw new Error("AI request cancelled.");
          }

          retries--;
          if (retries === 0) {
            throw new Error("Failed to generate AI response after multiple attempts.");
          }
          await new Promise(res => setTimeout(res, delay));
          delay *= 2;
        }
      }
    } finally {
      if (activeAIRequestRef.current === controller) {
        activeAIRequestRef.current = null;
      }
    }
  };

  const handleAIAction = async (actionType) => {
    if (loading) {
      showNotification("Please wait for the current action to finish.", "error");
      return;
    }

    setLoading(true);
    let prompt = "";

    try {
      if (actionType === 'generateTasks') {
        if (contacts.length === 0) {
          showNotification("Sync contacts first to generate tasks.", "error");
          setLoading(false); return;
        }
        const sampleContacts = contacts.slice(0, 8).map(c => `${c.name} at ${c.company}`).join(', ');
        prompt = `Review these contacts: ${sampleContacts}. Generate a smart, prioritized daily to-do list of exactly 3 sales tasks based on these prospects. 
        Format EACH line EXACTLY as follows with no extra characters, bullets, or labels:
        Contact Name || Company Name || Task Description
        CRITICAL: NO EMOJIS. ONLY RETURN THE 3 LINES.`;
        
        const result = await callGeminiAPI(prompt);
        const lines = result.split('\n').filter(l => l.includes('||'));
        if (lines.length > 0) {
          const newTasks = lines.map((l, i) => {
            const parts = l.split('||').map(p => p.trim());
            return { id: Date.now() + i, contact: parts[0] || 'Unknown', company: parts[1] || 'Unknown', type: parts[2] || 'Follow up', status: 'pending', priority: null, time: '', rationale: '' };
          });
          setTasks(prev => [...newTasks, ...prev]);
          showNotification("Smart Action Plan generated!");
        } else {
          throw new Error("Failed to parse task format.");
        }
        setLoading(false); return;
      }

      if (actionType === 'prioritizeTasks') {
        const pendingTasks = tasks.filter(t => t.status === 'pending');
        if (pendingTasks.length === 0) {
          showNotification("No pending tasks to prioritize.", "error"); setLoading(false); return;
        }
        const taskString = pendingTasks.map(t => `ID: ${t.id} | Contact: ${t.contact} | Task: ${t.type}`).join('\n');
        prompt = `Act as an elite Virtual Sales Director. Review these sales tasks and organize my schedule.
        Assign a Priority Score (1-100), a suggested time block (e.g., '09:00 AM' or '02:30 PM'), and a 1-sentence rationale for the priority.
        Format EACH line EXACTLY as follows with no extra characters:
        [ID] || [Score] || [Time] || [Rationale]
        
        Tasks to prioritize:
        ${taskString}
        
        CRITICAL: NO EMOJIS. ONLY RETURN THE FORMATTED LINES.`;
        
        const result = await callGeminiAPI(prompt);
        const lines = result.split('\n').filter(l => l.includes('||'));
        
        if (lines.length > 0) {
          setTasks(prev => applyTaskPrioritization(lines, prev));
          showNotification("Tasks successfully prioritized and scheduled!");
        } else {
          showNotification("Failed to parse AI schedule.", "error");
        }
        setLoading(false); return;
      }

      if (actionType === 'write') {
        const contextParts = [];
        if (config.companyUrl) contextParts.push(`Our Company Profile: ${config.companyUrl}`);
        if (config.senderName) contextParts.push(`Sender Name: ${config.senderName}`);
        if (composerState.recipientName) contextParts.push(`Recipient Name: ${composerState.recipientName}`);
        if (composerState.jobTitle) contextParts.push(`Recipient Job Title: ${composerState.jobTitle}`);
        if (composerState.companyName) contextParts.push(`Recipient Company: ${composerState.companyName}`);
        if (composerState.threadHistory) contextParts.push(`Thread History (Read this carefully to respond appropriately):\n${composerState.threadHistory}`);
        if (composerState.aiContext) contextParts.push(`User Instructions: ${composerState.aiContext}`);

        prompt = `Write a professional B2B cold outreach or follow-up email. Target Recipient Email: ${composerState.to || 'a potential client'}.
        Context & Guidelines: ${contextParts.join('\n\n')}
        Formatting Directives: Tone: ${composerState.tone}, Length: ${composerState.length}
        Instructions: Make it highly relevant. Write clearly, compellingly, and end with a soft call to action. Output the subject line first starting with "Subject: ". Do not include a signature, as one will be appended automatically. Remember: NO EMOJIS.`;
        
        const result = await callGeminiAPI(prompt);
        const subjectMatch = result.match(/Subject:\s*(.*)\n/i);
        let newSubject = composerState.subject;
        let newBody = result;
        
        if (subjectMatch) {
          newSubject = subjectMatch[1].trim();
          newBody = result.replace(subjectMatch[0], '').trim();
        }
        
        // Auto-append signature
        if (config.signature && !newBody.includes(config.signature.substring(0, 10))) {
           newBody = `${newBody}\n\n${config.signature}`;
        }
        
        setComposerState(prev => ({ ...prev, subject: newSubject || prev.subject, body: newBody, suggestedSubjects: [] }));
        showNotification("Draft generated successfully");

      } else if (actionType === 'meeting') {
        const contextParts = [];
        if (config.companyUrl) contextParts.push(`Our Company: ${config.companyUrl}`);
        if (composerState.recipientName) contextParts.push(`Recipient Name: ${composerState.recipientName}`);
        if (composerState.companyName) contextParts.push(`Company: ${composerState.companyName}`);
        
        prompt = `Write a highly-converting, short B2B email to schedule a discovery/demo meeting with ${composerState.recipientName || 'the prospect'} at ${composerState.companyName || 'their company'}.
        Context: ${contextParts.join(' | ')}.
        Include a clear CTA for a 15-minute sync next week. Output the subject line first starting with "Subject: ". Do not include a signature. NO EMOJIS.`;
        
        const result = await callGeminiAPI(prompt);
        const subjectMatch = result.match(/Subject:\s*(.*)\n/i);
        let newSubject = composerState.subject;
        let newBody = result;
        if (subjectMatch) {
          newSubject = subjectMatch[1].trim();
          newBody = result.replace(subjectMatch[0], '').trim();
        }
        if (config.signature) newBody += `\n\n${config.signature}`;
        setComposerState(prev => ({ ...prev, subject: newSubject || prev.subject, body: newBody }));
        showNotification("Meeting invite generated");

      } else if (actionType === 'suggestSubjects') {
        prompt = `Based on the following email body, generate 3 highly clickable, intriguing, and professional subject lines for a B2B sales context. Return ONLY the 3 subject lines, one per line, with no numbers or bullets. No emojis.\n\nBody:\n${composerState.body}`;
        const result = await callGeminiAPI(prompt);
        const subjects = result.split('\n').map(s => s.trim().replace(/^[-*•\d.)\s]+/, '')).filter(s => s.length > 0);
        setComposerState(prev => ({ ...prev, suggestedSubjects: subjects }));
        showNotification("Subject lines generated");

      } else if (actionType === 'polish') {
         if (!composerState.body) {
          showNotification("Please write a draft to polish first.", "error"); setLoading(false); return;
        }
        prompt = `Act as an elite copywriter. Polish and improve the following sales email draft. Make it sound more natural, improve the flow, ensure it aligns with a ${composerState.tone} tone, and keep it ${composerState.length}. NO EMOJIS.\n\nDraft:\n${composerState.body}`;
        const result = await callGeminiAPI(prompt);
        setComposerState(prev => ({ ...prev, body: result }));
        showNotification("Draft polished successfully");

      } else if (actionType === 'summarize') {
        prompt = `Summarize the following email thread history concisely for a salesperson preparing to reply. NO EMOJIS.\n\n${composerState.threadHistory}`;
        const result = await callGeminiAPI(prompt);
        setComposerState(prev => ({ ...prev, aiContext: result }));
        showNotification("Thread summarized");

      } else if (actionType === 'coach') {
        prompt = `Act as my Virtual Sales Director. Review the prospect details and thread history below. Give me a step-by-step strategic playbook on exactly how to close this deal, what psychological levers to pull, and what my next exact move should be. NO EMOJIS.\n\nProspect: ${composerState.recipientName}, ${composerState.jobTitle} at ${composerState.companyName}\nThread History:\n${composerState.threadHistory}`;
        const result = await callGeminiAPI(prompt);
        setComposerState(prev => ({ ...prev, aiContext: result }));
        showNotification("Director's strategy generated");

      } else if (actionType === 'analyze') {
        if (!composerState.body) {
          showNotification("Please write a draft to analyze first.", "error"); setLoading(false); return;
        }
        prompt = `Analyze the following sales email draft. Provide 3 bullet points on how to improve its conversion rate, tone, and clarity. NO EMOJIS.\n\nDraft:\n${composerState.body}`;
        const result = await callGeminiAPI(prompt);
        setComposerState(prev => ({ ...prev, aiContext: result }));
        showNotification("Analysis complete");

      } else if (actionType === 'objection') {
        if (!composerState.objection) {
          showNotification("Please enter the prospect's objection first.", "error"); setLoading(false); return;
        }
        prompt = `Act as an elite Virtual Sales Director. The prospect just gave me this objection: "${composerState.objection}". Based on the thread history, give me a highly persuasive, psychological script to dismantle this objection and pivot to a meeting. CRITICAL: NO EMOJIS.`;
        const result = await callGeminiAPI(prompt);
        setComposerState(prev => ({ ...prev, aiContext: `[Objection Crusher Strategy]\n\n${result}` }));
        showNotification("Objection response generated");

      } else if (actionType === 'sequence') {
        const contextParts = [];
        if (config.companyUrl) contextParts.push(`Our Company Profile: ${config.companyUrl}`);
        if (composerState.recipientName) contextParts.push(`Recipient Name: ${composerState.recipientName}`);
        if (composerState.companyName) contextParts.push(`Recipient Company: ${composerState.companyName}`);
        
        prompt = `Act as an elite Virtual Sales Director. Write a complete 3-step B2B sales email drip sequence for ${composerState.to || 'this prospect'}.
        Context: ${contextParts.join(' | ')} | Tone: ${composerState.tone}
        Requirements: Step 1: Initial Hook. Step 2: Value-Add Follow Up. Step 3: Breakup/Final Attempt. Format clearly with specific Subject Lines. Do not include signatures. CRITICAL: NO EMOJIS.`;
        
        const result = await callGeminiAPI(prompt);
        setComposerState(prev => ({ ...prev, body: result, subject: '3-Step Sequence Generated' }));
        showNotification("3-Step Sequence generated successfully");
      } else if (actionType === 'analyzeInbox') {
        const updatedInbox = [...inboxEmails];
        for (let i = 0; i < updatedInbox.length; i++) {
          if (updatedInbox[i].needsResponse && updatedInbox[i].aiScore === null) {
            prompt = `Analyze this sales email from a prospect:
            From: ${updatedInbox[i].fromName}
            Subject: ${updatedInbox[i].subject}
            Body: ${updatedInbox[i].body}
            
            Provide a score (1-100, 100 being hottest lead) and a 1-sentence summary.
            Return EXACTLY in this format: Score: [number] || Summary: [text]
            CRITICAL: NO EMOJIS.`;
            
            const result = await callGeminiAPI(prompt);
            const parsed = parseInboxScoreSummary(result);
            if (parsed) {
              updatedInbox[i].aiScore = parsed.score;
              updatedInbox[i].aiSummary = parsed.summary;
            }
          }
        }
        setInboxEmails(updatedInbox);
        showNotification("Inbox successfully analyzed and scored.");
      }

    } catch (err) {
      showNotification(err.message || "An error occurred during AI generation", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleHubSpotSync = async () => {
    if (!config.hubspotToken && !getApiBaseUrl()) {
      showNotification("Please configure your HubSpot Access Token in Settings first.", "error");
      return;
    }
    if (!user) {
      showNotification("Storage not initialized yet.", "error");
      return;
    }
    setLoading(true);
    try {
      const properties = 'firstname,lastname,company,email,hs_lead_status,jobtitle,phone,lifecyclestage';
      const data = await callHubSpotAPI({
        resource: 'contacts',
        method: 'GET',
        query: `properties=${encodeURIComponent(properties)}`
      });

      if (data.results && data.results.length > 0) {
        const mappedContacts = data.results.map(c => ({
          hubspotId: c.id,
          name: `${c.properties.firstname || ''} ${c.properties.lastname || ''}`.trim() || 'Unknown',
          company: c.properties.company || 'Unknown',
          jobTitle: c.properties.jobtitle || '',
          email: normalizeEmail(c.properties.email || ''),
          phone: c.properties.phone || '',
          stage: c.properties.lifecyclestage || 'Lead',
          status: c.properties.hs_lead_status || 'New',
          linkedin: '',
          notes: ''
        })).filter(c => c.email);
        
        for (const c of mappedContacts) {
          const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'contacts', c.email);
          await setDoc(docRef, c, { merge: true });
        }
        showNotification(`Successfully synced and saved ${mappedContacts.length} contacts from HubSpot`);
      } else {
        showNotification("No contacts found in HubSpot.", "error");
      }
    } catch (error) {
      console.error("HubSpot Sync Error:", error);
      showNotification(error.message || "Failed to connect to HubSpot. Check CORS / Token.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleCSVImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!user) return;
    setLoading(true);

    (async () => {
      try {
        const csvText = await file.text();
        const lines = splitCsvRows(csvText);

        if (lines.length < 2) {
          showNotification('CSV appears empty or missing data rows.', 'error');
          return;
        }

        const headers = parseCsvLine(lines[0]).map(h => h.toLowerCase().trim());
        if (!headers.includes('email') && !headers.includes('e-mail')) {
          showNotification('CSV is missing an email column.', 'error');
          return;
        }

        const contactsToImport = lines
          .slice(1)
          .map(line => parseCsvLine(line))
          .map(values => toContactFromRow(headers, values))
          .filter(Boolean);

        const uniqueContacts = Array.from(new Map(contactsToImport.map(c => [c.email, c])).values());

        if (uniqueContacts.length === 0) {
          showNotification('No valid contacts found in CSV. Ensure an email column exists.', 'error');
          return;
        }

        for (const c of uniqueContacts) {
          const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'contacts', c.email);
          await setDoc(docRef, c, { merge: true });
        }

        showNotification(`Successfully imported and saved ${uniqueContacts.length} contacts from CSV`);
      } catch (err) {
        showNotification('Failed to parse or save CSV contacts.', 'error');
      } finally {
        setLoading(false);
        e.target.value = '';
      }
    })();
  };

  const handleSendEmail = async () => {
    const recipientEmail = normalizeEmail(composerState.to || '');

    if (composerErrors.to) {
      showNotification(composerErrors.to, 'error');
      return;
    }
    if (!recipientEmail || !composerState.body) {
      showNotification("Please specify a recipient and message body.", "error");
      return;
    }
    if (!isValidEmail(recipientEmail)) {
      showNotification("Please enter a valid recipient email address.", "error");
      return;
    }
    if (!user) return;

    setLoading(true);
    try {
      const threadRef = doc(db, 'artifacts', appId, 'users', user.uid, 'threads', recipientEmail);
      const newMessage = {
        date: new Date().toISOString(),
        subject: composerState.subject,
        body: composerState.body,
        direction: 'outbound'
      };

      const existingThread = threads[recipientEmail]?.messages || [];
      await setDoc(threadRef, {
        contactEmail: recipientEmail,
        messages: [...existingThread, newMessage]
      }, { merge: true });

      if ((config.hubspotToken || getApiBaseUrl()) && composerState.hubspotId) {
        try {
          await callHubSpotAPI({
            resource: 'emails',
            method: 'POST',
            body: {
              properties: {
                hs_timestamp: new Date().toISOString(),
                hs_email_direction: 'EMAIL',
                hs_email_status: 'SENT',
                hs_email_subject: composerState.subject,
                hs_email_text: composerState.body,
              },
              associations: [
                {
                  to: { id: composerState.hubspotId },
                  types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 198 }]
                }
              ]
            }
          });
          showNotification("Email sent, saved, and logged in HubSpot!");
        } catch {
          showNotification("Saved locally, but failed to log to HubSpot", "error");
        }
      } else {
        showNotification(`Email sent successfully and thread saved!`);
      }
      
      const historyString = [...existingThread, newMessage]
        .map(m => `[${new Date(m.date).toLocaleDateString()}] ${m.direction === 'outbound' ? 'You' : 'Prospect'} wrote:\nSubject: ${m.subject}\n${m.body}`)
        .join('\n\n');
        
      setComposerState(prev => ({ 
        ...prev, body: '', subject: '', threadHistory: historyString 
      }));
    } catch (err) {
      showNotification("Error saving thread to database.", "error");
    } finally {
      setLoading(false);
    }
  };

  // --- Views ---

  const renderDashboard = () => (
    <div className="p-8 space-y-6 max-w-6xl mx-auto w-full">
      <h2 className="text-2xl font-bold text-black dark:text-white transition-colors">Sales Command Center</h2>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Emails Sent (Today)', value: '142', icon: Send },
          { label: 'Open Rate', value: '48.5%', icon: Mail },
          { label: 'Active Sequences', value: '12', icon: Activity },
          { label: 'Meetings Booked', value: '4', icon: CheckCircle },
        ].map((stat, idx) => (
          <div key={idx} className="bg-white dark:bg-zinc-900 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col transition-colors">
            <div className="flex items-center text-zinc-500 dark:text-zinc-400 mb-2">
              <stat.icon className="w-4 h-4 mr-2" />
              <span className="text-sm font-medium">{stat.label}</span>
            </div>
            <span className="text-3xl font-bold text-black dark:text-white">{stat.value}</span>
          </div>
        ))}
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-8">
        <div className="md:col-span-2 bg-white dark:bg-zinc-900 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col transition-colors">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-black dark:text-white flex items-center">
              <Calendar className="w-5 h-5 mr-2 text-rose-900 dark:text-rose-700" />
              Smart Action Plan
            </h3>
            <button 
              onClick={() => { setActiveTab('tasks'); }}
              className="flex items-center text-xs font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 px-3 py-1.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 transition"
            >
              Open Smart Calendar <ChevronRight className="w-3 h-3 ml-1" />
            </button>
          </div>
          <div className="flex-1 space-y-3">
            {tasks.filter(t => t.status === 'pending').slice(0, 4).map(task => (
              <div key={task.id} className="flex items-center justify-between p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-black dark:text-white">{task.contact} <span className="text-zinc-500 dark:text-zinc-400 font-normal">({task.company})</span></span>
                  <span className="text-xs text-rose-900 dark:text-rose-500 font-medium mt-1">{task.type}</span>
                </div>
                <button 
                  onClick={() => {
                    const matchedContact = contacts.find(c => c.name === task.contact) || {};
                    setComposerState(prev => ({ 
                      ...prev, 
                      recipientName: task.contact, 
                      companyName: task.company,
                      to: matchedContact.email || '' 
                    }));
                    setActiveTab('outreach');
                  }}
                  className="bg-black dark:bg-white text-white dark:text-black text-xs px-3 py-1.5 rounded hover:bg-zinc-800 dark:hover:bg-zinc-200 transition font-bold"
                >
                  Execute
                </button>
              </div>
            ))}
            {tasks.filter(t => t.status === 'pending').length === 0 && (
              <p className="text-sm text-zinc-500 p-4 text-center">No pending tasks for today.</p>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm transition-colors">
          <h3 className="text-lg font-semibold text-black dark:text-white mb-4">Recent Activity</h3>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between py-3 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-rose-900 dark:bg-rose-700 rounded-full mr-3"></div>
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">Activity logged for <strong className="text-black dark:text-white">Lead #{i}04</strong></span>
                </div>
                <span className="text-xs text-zinc-400 dark:text-zinc-500">2h ago</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  const renderTasks = () => (
    <div className="p-8 max-w-7xl mx-auto w-full h-full flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-black dark:text-white transition-colors">Smart Agenda & Tasks</h2>
        <div className="flex space-x-3">
          <button 
            onClick={() => handleAIAction('generateTasks')}
            disabled={loading}
            className="flex items-center bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-black dark:text-white px-4 py-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition font-bold text-sm shadow-sm"
          >
            <Sparkles className="w-4 h-4 mr-2 text-rose-900 dark:text-rose-500" />
            Generate from CRM
          </button>
          <button 
            onClick={() => handleAIAction('prioritizeTasks')}
            disabled={loading || tasks.filter(t => t.status === 'pending').length === 0}
            className="flex items-center bg-rose-900 text-white px-4 py-2 rounded-lg hover:bg-rose-950 dark:hover:bg-rose-800 transition disabled:opacity-50 font-bold text-sm shadow-sm"
          >
            <CalendarDays className="w-4 h-4 mr-2" />
            AI Auto-Schedule
          </button>
        </div>
      </div>
      
      <div className="flex flex-1 gap-8 min-h-0">
        {/* Left: Task List */}
        <div className="w-full lg:w-2/3 flex flex-col bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden transition-colors">
          <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50 flex">
            <form onSubmit={addTask} className="w-full flex relative">
              <input 
                type="text" 
                value={newTaskInput}
                onChange={(e) => setNewTaskInput(e.target.value)}
                placeholder="Add a quick task..." 
                className="w-full pl-4 pr-12 py-2 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-rose-900 text-black dark:text-white transition-colors"
              />
              <button type="submit" className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1 bg-black dark:bg-white text-white dark:text-black rounded hover:bg-zinc-800 dark:hover:bg-zinc-200 transition">
                <Plus className="w-4 h-4" />
              </button>
            </form>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {tasks.map(task => (
              <div key={task.id} className={`flex items-start p-4 rounded-lg border transition-colors ${task.status === 'completed' ? 'bg-zinc-50 dark:bg-zinc-950/30 border-transparent opacity-60' : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-sm hover:border-zinc-300 dark:hover:border-zinc-700'}`}>
                <button 
                  onClick={() => toggleTaskStatus(task.id)}
                  className={`mt-1 flex-shrink-0 w-5 h-5 rounded flex items-center justify-center border transition-colors ${task.status === 'completed' ? 'bg-rose-900 border-rose-900 text-white' : 'border-zinc-300 dark:border-zinc-600 hover:border-rose-900 dark:hover:border-rose-500 text-transparent'}`}
                >
                  <Check className="w-3 h-3" />
                </button>
                
                <div className="ml-4 flex-1">
                  <div className="flex justify-between items-start">
                    <h4 className={`text-sm font-bold ${task.status === 'completed' ? 'line-through text-zinc-500 dark:text-zinc-500' : 'text-black dark:text-white'}`}>
                      {task.type}
                    </h4>
                    <div className="flex items-center space-x-2">
                      {task.priority && task.status !== 'completed' && (
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                          task.priority >= 80 ? 'bg-rose-100 border-rose-200 text-rose-900 dark:bg-rose-900/30 dark:border-rose-900 dark:text-rose-400' : 
                          task.priority >= 50 ? 'bg-amber-100 border-amber-200 text-amber-900 dark:bg-amber-900/30 dark:border-amber-900 dark:text-amber-400' : 
                          'bg-zinc-100 border-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-400'
                        }`}>
                          Priority: {task.priority}
                        </span>
                      )}
                      <button onClick={() => deleteTask(task.id)} className="text-zinc-400 hover:text-rose-900 dark:hover:text-rose-500 transition">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  
                  <div className="mt-1 flex items-center text-xs">
                    <span className="text-zinc-600 dark:text-zinc-400 font-medium">For: <strong className="text-black dark:text-white">{task.contact}</strong> ({task.company})</span>
                    {task.status !== 'completed' && (
                       <button 
                         onClick={() => {
                           const matchedContact = contacts.find(c => c.name === task.contact) || {};
                           setComposerState(prev => ({ ...prev, recipientName: task.contact, companyName: task.company, to: matchedContact.email || '' }));
                           setActiveTab('outreach');
                         }}
                         className="ml-3 text-rose-900 dark:text-rose-500 hover:underline font-bold flex items-center"
                       >
                         Execute <ChevronRight className="w-3 h-3 ml-0.5" />
                       </button>
                    )}
                  </div>

                  {task.rationale && task.status !== 'completed' && (
                    <div className="mt-3 p-2 bg-zinc-50 dark:bg-zinc-950/50 rounded border border-zinc-100 dark:border-zinc-800 flex items-start">
                       <Sparkles className="w-3 h-3 text-rose-900 dark:text-rose-600 mr-2 mt-0.5 shrink-0" />
                       <span className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed">{task.rationale}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {tasks.length === 0 && (
              <div className="p-8 text-center text-zinc-500 dark:text-zinc-400">No tasks currently. Generate some from the CRM or add manually.</div>
            )}
          </div>
        </div>

        {/* Right: AI Schedule Timeline & Calendar */}
        <div className="hidden lg:flex w-1/3 flex-col gap-6 transition-colors min-h-0">
          
          {/* Mini Calendar */}
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm p-5 flex-shrink-0">
            <div className="flex justify-between items-center mb-4">
               <h3 className="font-bold text-black dark:text-white">
                 {new Date().toLocaleString('default', { month: 'long' })} {new Date().getFullYear()}
               </h3>
               <div className="flex space-x-2">
                 <button className="p-1 text-zinc-400 hover:text-black dark:hover:text-white transition"><ChevronRight className="w-4 h-4 rotate-180" /></button>
                 <button className="p-1 text-zinc-400 hover:text-black dark:hover:text-white transition"><ChevronRight className="w-4 h-4" /></button>
               </div>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center mb-2">
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
                <div key={d} className="text-[10px] font-bold text-zinc-400 uppercase">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: new Date(new Date().getFullYear(), new Date().getMonth(), 1).getDay() }).map((_, i) => (
                <div key={`empty-${i}`} className="h-8"></div>
              ))}
              {Array.from({ length: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate() }).map((_, i) => {
                const day = i + 1;
                const isToday = day === new Date().getDate();
                return (
                  <div key={day} className={`h-8 w-8 mx-auto flex items-center justify-center rounded-full text-xs font-bold transition-colors cursor-pointer ${isToday ? 'bg-rose-900 text-white shadow-md' : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}>
                    {day}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Daily Schedule */}
          <div className="flex-1 flex flex-col bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden min-h-0">
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50 flex justify-between items-center">
              <h3 className="font-bold text-black dark:text-white flex items-center text-sm">
                 <Clock className="w-4 h-4 mr-2 text-rose-900 dark:text-rose-500" /> Daily Schedule
              </h3>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <div className="relative border-l-2 border-zinc-200 dark:border-zinc-800 ml-3 space-y-8">
                {tasks.filter(t => t.time && t.status !== 'completed')
                  .sort((a, b) => a.time.localeCompare(b.time))
                  .map((task, idx) => (
                  <div key={idx} className="relative pl-6">
                    <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-rose-900 dark:bg-rose-600 border-4 border-white dark:border-zinc-900"></div>
                    <h4 className="text-xs font-bold text-rose-900 dark:text-rose-500 mb-1">{task.time}</h4>
                    <div className="bg-zinc-50 dark:bg-zinc-950/50 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 shadow-sm">
                      <p className="text-sm font-bold text-black dark:text-white">{task.type}</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{task.contact}</p>
                    </div>
                  </div>
                ))}
                {tasks.filter(t => t.time && t.status !== 'completed').length === 0 && (
                  <div className="pl-6 text-sm text-zinc-500 dark:text-zinc-400">
                    Click "AI Auto-Schedule" to build your timeline.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderInbox = () => (
    <div className="p-8 space-y-6 max-w-7xl mx-auto w-full">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-black dark:text-white transition-colors">Smart Inbox</h2>
        <button 
          onClick={() => handleAIAction('analyzeInbox')}
          disabled={loading}
          className="flex items-center bg-rose-900 text-white px-4 py-2 rounded-lg hover:bg-rose-950 dark:hover:bg-rose-800 transition disabled:opacity-50 font-bold text-sm shadow-sm"
        >
          <Sparkles className="w-4 h-4 mr-2" />
          Analyze & Score Inbox
        </button>
      </div>
      
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden transition-colors">
        <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {inboxEmails.map(email => (
            <div key={email.id} className={`p-6 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors ${!email.needsResponse ? 'opacity-60' : ''}`}>
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h4 className="text-sm font-bold text-black dark:text-white">{email.fromName} <span className="text-zinc-500 font-normal">({email.company})</span></h4>
                  <h5 className="text-md font-bold text-rose-900 dark:text-rose-500 mt-1">{email.subject}</h5>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-xs text-zinc-500 dark:text-zinc-400 mb-2">{email.date}</span>
                  {email.aiScore !== null && (
                    <div className={`px-3 py-1 rounded-full text-xs font-bold border ${
                      email.aiScore >= 80 ? 'bg-rose-100 border-rose-200 text-rose-900 dark:bg-rose-900/30 dark:border-rose-900 dark:text-rose-400' : 
                      email.aiScore >= 40 ? 'bg-amber-100 border-amber-200 text-amber-900 dark:bg-amber-900/30 dark:border-amber-900 dark:text-amber-400' : 
                      'bg-zinc-100 border-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-400'
                    }`}>
                      Score: {email.aiScore}/100
                    </div>
                  )}
                </div>
              </div>
              <p className="text-sm text-zinc-700 dark:text-zinc-300 mb-4 line-clamp-2">{email.body}</p>
              
              {email.aiSummary && (
                <div className="mb-4 p-3 bg-zinc-50 dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800 rounded-lg flex items-start">
                  <Sparkles className="w-4 h-4 mr-2 text-rose-900 dark:text-rose-600 shrink-0 mt-0.5" />
                  <span className="text-sm text-zinc-800 dark:text-zinc-200 font-medium">AI Summary: {email.aiSummary}</span>
                </div>
              )}

              {email.needsResponse && (
                <button 
                  onClick={() => {
                    const historyString = `[${email.date}] ${email.fromName} wrote:\nSubject: ${email.subject}\n${email.body}`;
                    setComposerState(prev => ({ 
                      ...prev, 
                      to: email.fromEmail,
                      recipientName: email.fromName,
                      companyName: email.company,
                      subject: email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`,
                      threadHistory: historyString
                    }));
                    setActiveTab('outreach');
                  }}
                  className="text-xs bg-black dark:bg-white text-white dark:text-black px-4 py-2 rounded font-bold hover:bg-zinc-800 dark:hover:bg-zinc-200 transition"
                >
                  Draft Reply
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderContacts = () => (
    <div className="p-8 space-y-6 max-w-7xl mx-auto w-full">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-black dark:text-white transition-colors">CRM & Contacts</h2>
        <div className="flex space-x-3">
          <button 
            onClick={openAddContact}
            className="flex items-center bg-black dark:bg-white text-white dark:text-black px-4 py-2 rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition font-bold text-sm shadow-sm"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Contact
          </button>
          <label className="flex items-center bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-black dark:text-white px-4 py-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition cursor-pointer font-medium text-sm">
            <UploadCloud className="w-4 h-4 mr-2 text-zinc-600 dark:text-zinc-400" />
            Import CSV
            <input type="file" accept=".csv" className="hidden" onChange={handleCSVImport} disabled={loading} />
          </label>
          <button 
            onClick={handleHubSpotSync}
            disabled={loading}
            className="flex items-center bg-rose-900 text-white px-4 py-2 rounded-lg hover:bg-rose-950 dark:hover:bg-rose-800 transition disabled:opacity-50 font-medium text-sm shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Sync from HubSpot
          </button>
        </div>
      </div>
      
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden transition-colors">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-zinc-100 dark:bg-zinc-950 text-zinc-600 dark:text-zinc-400 text-sm border-b border-zinc-200 dark:border-zinc-800">
              <th className="p-4 font-medium text-black dark:text-white">Name</th>
              <th className="p-4 font-medium text-black dark:text-white">Title & Company</th>
              <th className="p-4 font-medium text-black dark:text-white">Contact Info</th>
              <th className="p-4 font-medium text-black dark:text-white">Stage</th>
              <th className="p-4 font-medium text-right text-black dark:text-white">Actions</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map(contact => (
              <tr key={contact.id || contact.email} className="border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer" onClick={() => openDossier(contact)}>
                <td className="p-4 text-sm font-bold text-black dark:text-white">{contact.name}</td>
                <td className="p-4 text-sm text-zinc-600 dark:text-zinc-300">
                  {contact.jobTitle && <span className="block text-xs font-bold text-zinc-500 dark:text-zinc-400">{contact.jobTitle}</span>}
                  {contact.company}
                </td>
                <td className="p-4 text-sm text-zinc-600 dark:text-zinc-300">
                  <span className="block">{contact.email}</span>
                  {contact.phone && <span className="flex items-center text-xs mt-1 text-zinc-500 dark:text-zinc-400"><Phone className="w-3 h-3 mr-1" /> {contact.phone}</span>}
                </td>
                <td className="p-4 text-sm">
                  <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                    contact.status === 'Warm' || contact.stage === 'Opportunity' ? 'bg-rose-100 dark:bg-rose-900/30 text-rose-900 dark:text-rose-400' :
                    contact.status === 'Cold' ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-300' :
                    'bg-black dark:bg-white text-white dark:text-black'
                  }`}>
                    {contact.stage || contact.status}
                  </span>
                </td>
                <td className="p-4 text-sm text-right">
                  <div className="flex items-center justify-end space-x-2">
                    <button onClick={(e) => openEditContact(contact, e)} className="p-1.5 text-zinc-500 hover:text-black dark:text-zinc-400 dark:hover:text-white bg-zinc-100 dark:bg-zinc-800 rounded transition" title="Edit Contact">
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setContactToDelete(contact); }} className="p-1.5 text-zinc-500 hover:text-rose-900 dark:text-zinc-400 dark:hover:text-rose-500 bg-zinc-100 dark:bg-zinc-800 rounded transition" title="Delete Contact">
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); openDossier(contact); }} className="text-rose-900 dark:text-rose-500 hover:text-black dark:hover:text-white font-bold text-sm flex items-center ml-2 transition-colors">
                      View <ChevronRight className="w-4 h-4 ml-0.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {contacts.length === 0 && (
               <tr><td colSpan="5" className="p-8 text-center text-zinc-500 dark:text-zinc-400">No contacts found. Please sync from HubSpot, import a CSV, or Add a contact manually.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderOutreach = () => (
    <div className="flex h-full max-w-7xl mx-auto w-full">
      {/* Thread/Context Sidebar */}
      <div className="w-1/3 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-col overflow-y-auto transition-colors">
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50 flex justify-between items-center transition-colors">
          <h3 className="font-semibold text-black dark:text-white flex items-center">
            <SlidersHorizontal className="w-4 h-4 mr-2 text-zinc-500 dark:text-zinc-400" />
            AI Strategy Settings
          </h3>
        </div>
        
        <div className="p-4 flex-1 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-2">Tone</label>
              <select 
                name="tone"
                value={composerState.tone}
                onChange={handleComposerChange}
                className="w-full border border-zinc-300 dark:border-zinc-700 rounded-lg p-2 text-sm focus:ring-2 focus:ring-rose-900 focus:border-rose-900 outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
              >
                <option value="Professional">Professional</option>
                <option value="Persuasive">Persuasive</option>
                <option value="Friendly">Friendly</option>
                <option value="Direct">Direct & Urgent</option>
                <option value="Consultative">Consultative</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-2">Length</label>
              <select 
                name="length"
                value={composerState.length}
                onChange={handleComposerChange}
                className="w-full border border-zinc-300 dark:border-zinc-700 rounded-lg p-2 text-sm focus:ring-2 focus:ring-rose-900 focus:border-rose-900 outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
              >
                <option value="Concise">Concise (Short)</option>
                <option value="Standard">Standard</option>
                <option value="Detailed">Detailed</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-2">Thread History Context</label>
            <textarea
              name="threadHistory"
              value={composerState.threadHistory}
              onChange={handleComposerChange}
              rows="4"
              className="w-full border border-zinc-300 dark:border-zinc-700 rounded-lg p-3 text-sm focus:ring-2 focus:ring-rose-900 bg-zinc-50 dark:bg-zinc-950/50 outline-none text-zinc-800 dark:text-zinc-200 transition-colors"
              placeholder="Paste previous emails here to provide context..."
            ></textarea>
          </div>

          <div className="grid grid-cols-1 gap-2">
            <button 
              onClick={() => handleAIAction('coach')}
              disabled={loading || (!composerState.recipientName && !composerState.threadHistory)}
              className="flex items-center justify-center w-full bg-rose-900 border border-rose-950 text-white px-4 py-2 rounded-lg hover:bg-rose-800 transition text-sm font-bold shadow-sm disabled:opacity-50"
            >
              <Briefcase className="w-4 h-4 mr-2" />
              Ask Director For Strategy
            </button>
            
            {/* Objection Crusher */}
            <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800 transition-colors">
              <label className="block text-xs font-bold text-rose-900 dark:text-rose-500 uppercase tracking-wider mb-2 flex items-center">
                <ShieldAlert className="w-3 h-3 mr-1" /> Objection Crusher
              </label>
              <input 
                type="text"
                name="objection"
                value={composerState.objection}
                onChange={handleComposerChange}
                placeholder="E.g., It's too expensive..."
                className="w-full border border-zinc-300 dark:border-zinc-700 rounded-lg p-2 text-sm focus:ring-2 focus:ring-rose-900 outline-none text-black dark:text-white bg-white dark:bg-zinc-800 mb-2 transition-colors"
              />
              <button 
                onClick={() => handleAIAction('objection')}
                disabled={loading || !composerState.objection}
                className="flex items-center justify-center w-full bg-black dark:bg-white text-white dark:text-black px-4 py-2 rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition text-xs font-bold disabled:opacity-50"
              >
                Crush Objection
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800 transition-colors">
              <button 
                onClick={() => handleAIAction('summarize')}
                disabled={loading}
                className="flex items-center justify-center w-full bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-black dark:text-white px-4 py-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-700 transition text-xs font-medium"
              >
                <ListChecks className="w-4 h-4 mr-1 text-zinc-500 dark:text-zinc-400" />
                Summarize Context
              </button>
              <button 
                onClick={() => handleAIAction('analyze')}
                disabled={loading || !composerState.body}
                className="flex items-center justify-center w-full bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-black dark:text-white px-4 py-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-700 transition text-xs font-medium disabled:opacity-50"
              >
                <Activity className="w-4 h-4 mr-1 text-zinc-500 dark:text-zinc-400" />
                Analyze Draft
              </button>
            </div>
          </div>

          {composerState.aiContext && (
            <div className="p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-sm mt-4 transition-colors">
              <h4 className="text-xs font-bold text-black dark:text-white uppercase mb-2 flex items-center">
                <TrendingUp className="w-4 h-4 mr-1 text-rose-900 dark:text-rose-600" /> Director's Insight
              </h4>
              <p className="text-sm text-zinc-800 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">
                {composerState.aiContext}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Main Composer Area */}
      <div className="w-2/3 flex flex-col bg-zinc-50 dark:bg-zinc-950 transition-colors">
        <div className="p-6 flex-1 flex flex-col">
          <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800 flex flex-col h-full overflow-hidden transition-colors">
            
            {/* Headers & Personalization */}
            <div className="border-b border-zinc-200 dark:border-zinc-800">
              <div className="flex px-4 py-2 border-b border-zinc-100 dark:border-zinc-800 items-center bg-zinc-50 dark:bg-zinc-950/50">
                <span className="text-zinc-500 dark:text-zinc-400 w-24 text-xs font-bold uppercase">Personalize:</span>
                <input 
                  type="text" name="recipientName" value={composerState.recipientName} onChange={handleComposerChange}
                  className="w-1/4 bg-transparent outline-none text-xs text-black dark:text-white border-r border-zinc-200 dark:border-zinc-700 mr-3 pr-3 placeholder-zinc-400 dark:placeholder-zinc-600" 
                  placeholder="Name"
                />
                <input 
                  type="text" name="jobTitle" value={composerState.jobTitle} onChange={handleComposerChange}
                  className="w-1/4 bg-transparent outline-none text-xs text-black dark:text-white border-r border-zinc-200 dark:border-zinc-700 mr-3 pr-3 placeholder-zinc-400 dark:placeholder-zinc-600" 
                  placeholder="Job Title"
                />
                <input 
                  type="text" name="companyName" value={composerState.companyName} onChange={handleComposerChange}
                  className="flex-1 bg-transparent outline-none text-xs text-black dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600" 
                  placeholder="Company Name"
                />
              </div>

              <div className="flex px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 items-start">
                <span className="text-zinc-500 dark:text-zinc-400 w-20 text-sm font-bold">To:</span>
                <div className="flex-1">
                  <input 
                    type="text" name="to" value={composerState.to} onChange={handleComposerChange}
                    className="w-full outline-none text-sm text-black dark:text-white bg-transparent" 
                    placeholder="recipient@example.com"
                  />
                  {composerErrors.to && <p className="text-xs text-rose-700 dark:text-rose-400 mt-1">{composerErrors.to}</p>}
                </div>
              </div>

              <div className="flex px-4 py-3 items-center relative">
                <span className="text-zinc-500 dark:text-zinc-400 w-20 text-sm font-bold">Subject:</span>
                <input 
                  type="text" name="subject" value={composerState.subject} onChange={handleComposerChange}
                  className="flex-1 outline-none text-sm font-bold text-black dark:text-white bg-transparent" 
                  placeholder="Your subject line"
                />
                <button 
                  onClick={() => handleAIAction('suggestSubjects')}
                  disabled={loading || !composerState.body}
                  className="text-xs text-white hover:bg-rose-800 font-bold px-3 py-1.5 rounded bg-rose-900 disabled:opacity-50 transition"
                  title="Generate subject lines based on email body"
                >
                  Suggest Subjects
                </button>
              </div>
              
              {/* Suggested Subjects Dropdown */}
              {composerState.suggestedSubjects.length > 0 && (
                <div className="px-4 py-2 bg-zinc-50 dark:bg-zinc-950/50 border-t border-zinc-200 dark:border-zinc-800 flex flex-wrap gap-2">
                  <span className="text-xs font-bold text-black dark:text-white py-1">Suggestions:</span>
                  {composerState.suggestedSubjects.map((sub, idx) => (
                    <button 
                      key={idx}
                      onClick={() => setComposerState(prev => ({ ...prev, subject: sub, suggestedSubjects: [] }))}
                      className="text-xs bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 px-2 py-1 rounded-md hover:border-black dark:hover:border-white transition truncate max-w-xs"
                    >
                      {sub}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Editing Toolbar & AI Prompter Tool */}
            <div className="flex flex-col border-b border-zinc-800 bg-zinc-900 dark:bg-black transition-colors">
              <div className="flex items-center px-4 py-2 border-b border-zinc-800 space-x-2">
                 <span className="text-xs text-zinc-500 uppercase font-bold mr-2">Merge Tags:</span>
                 <button onClick={() => insertMergeTag('[First Name]')} className="text-xs text-zinc-300 bg-zinc-800 hover:bg-zinc-700 px-2 py-1 rounded transition">Name</button>
                 <button onClick={() => insertMergeTag('[Company Name]')} className="text-xs text-zinc-300 bg-zinc-800 hover:bg-zinc-700 px-2 py-1 rounded transition">Company</button>
                 <button onClick={() => insertMergeTag('[Meeting Link]')} className="text-xs text-zinc-300 bg-zinc-800 hover:bg-zinc-700 px-2 py-1 rounded transition">Link</button>
              </div>
              <div className="p-3 flex items-center space-x-2">
                <Wand2 className="w-5 h-5 text-rose-900 dark:text-rose-600" />
                <input 
                  type="text"
                  name="aiContext"
                  value={composerState.aiContext}
                  onChange={handleComposerChange}
                  placeholder="Instruct AI: E.g., Pitch our new CRM integration..."
                  className="flex-1 bg-transparent border-none outline-none text-sm text-white placeholder-zinc-500"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAIAction('write');
                  }}
                />
                <button 
                  onClick={() => handleAIAction('polish')}
                  disabled={loading || !composerState.body}
                  className="bg-zinc-800 text-zinc-100 px-3 py-1.5 rounded-md text-xs font-medium hover:bg-zinc-700 transition disabled:opacity-50 flex items-center border border-zinc-700"
                  title="Polish Draft"
                >
                  <Sparkles className="w-3 h-3" />
                </button>
                <button 
                  onClick={() => handleAIAction('meeting')}
                  disabled={loading}
                  className="bg-zinc-800 text-zinc-100 px-3 py-1.5 rounded-md text-xs font-medium hover:bg-zinc-700 transition disabled:opacity-50 flex items-center border border-zinc-700"
                  title="Schedule Meeting Script"
                >
                  <Clock className="w-3 h-3 mr-1" /> Pitch Meeting
                </button>
                <button 
                  onClick={() => handleAIAction('sequence')}
                  disabled={loading}
                  className="bg-black dark:bg-zinc-800 text-white px-3 py-1.5 rounded-md text-xs font-bold hover:bg-zinc-800 dark:hover:bg-zinc-700 transition disabled:opacity-50 shadow-sm flex items-center"
                >
                  <Layers className="w-3 h-3 mr-1" /> Sequence
                </button>
                <button 
                  onClick={() => handleAIAction('write')}
                  disabled={loading}
                  className="bg-rose-900 text-white px-4 py-1.5 rounded-md text-sm font-bold hover:bg-rose-800 transition disabled:opacity-50 shadow-sm"
                >
                  {loading ? 'Working...' : 'Draft'}
                </button>
              </div>
            </div>

            {/* Body */}
            <textarea
              name="body"
              value={composerState.body}
              onChange={handleComposerChange}
              className="flex-1 w-full p-6 outline-none text-black dark:text-white resize-none leading-relaxed text-sm bg-white dark:bg-zinc-900 transition-colors"
              placeholder="Write your email, insert merge tags above, or instruct the AI..."
            ></textarea>

            {/* Footer / Actions */}
            <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 flex justify-between items-center transition-colors">
              <div className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center font-bold">
                <Server className="w-4 h-4 mr-1" />
                SMTP: {config.smtpHost ? 'Configured' : 'Not Configured'}
              </div>
              <button 
                onClick={handleSendEmail}
                disabled={loading || Boolean(composerErrors.to)}
                className="flex items-center bg-black dark:bg-white text-white dark:text-black px-6 py-2 rounded-lg hover:bg-zinc-800 dark:hover:bg-zinc-200 transition font-bold disabled:opacity-50 shadow-sm"
              >
                <Send className="w-4 h-4 mr-2" />
                Send Email
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderSettings = () => {
    const diagnostics = [
      {
        label: 'Auth Session',
        ok: Boolean(user),
        detail: user ? `Connected (${user.uid.slice(0, 8)}...)` : 'Not signed in yet'
      },
      {
        label: 'Proxy Mode',
        ok: Boolean(getApiBaseUrl()),
        detail: getApiBaseUrl() ? `Routing via ${getApiBaseUrl()}` : 'Not configured (direct API mode)'
      },
      {
        label: 'Gemini AI Access',
        ok: Boolean(config.geminiKey) || Boolean(getApiBaseUrl()),
        detail: getApiBaseUrl() ? 'Handled by proxy when configured server-side' : (config.geminiKey ? 'Key loaded for this session' : 'Missing key')
      },
      {
        label: 'HubSpot Integration',
        ok: Boolean(config.hubspotToken) || Boolean(getApiBaseUrl()),
        detail: getApiBaseUrl() ? 'Handled by proxy when configured server-side' : (config.hubspotToken ? 'Token configured' : 'Token missing')
      },
      {
        label: 'SMTP Readiness',
        ok: Boolean(config.smtpHost && config.smtpUser && config.smtpPass),
        detail: config.smtpHost && config.smtpUser && config.smtpPass ? 'Host/user/password present' : 'Missing required fields'
      },
      {
        label: 'IMAP Readiness',
        ok: Boolean(config.imapHost && config.imapPort),
        detail: config.imapHost && config.imapPort ? 'Host/port present' : 'Missing host or port'
      }
    ];

    return (
      <div className="p-8 max-w-4xl mx-auto w-full space-y-8">
        <div>
          <h2 className="text-2xl font-bold text-black dark:text-white mb-6">Integrations & Settings</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* System Health */}
            <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm md:col-span-2 transition-colors">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center text-black dark:text-white">
                  <Activity className="w-5 h-5 mr-2 text-rose-900 dark:text-rose-600" />
                  <h3 className="text-lg font-bold">System Health</h3>
                </div>
                <button
                  onClick={clearSavedPreferences}
                  className="text-xs bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 px-3 py-1.5 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-700 transition"
                >
                  Clear Saved Local Settings
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {diagnostics.map((item) => (
                  <div key={item.label} className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50 flex items-start">
                    {item.ok ? (
                      <CheckCircle className="w-4 h-4 mr-2 mt-0.5 text-emerald-600" />
                    ) : (
                      <AlertCircle className="w-4 h-4 mr-2 mt-0.5 text-amber-600" />
                    )}
                    <div>
                      <p className="text-sm font-bold text-black dark:text-white">{item.label}</p>
                      <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">{item.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-4">
                Security note: API keys and tokens are intentionally not persisted in local storage.
              </p>

              <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                <h4 className="text-sm font-bold text-black dark:text-white mb-3">Secure Proxy Routing</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Proxy Base URL</label>
                    <input
                      type="text"
                      name="apiBaseUrl"
                      value={config.apiBaseUrl}
                      onChange={handleConfigChange}
                      className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                      placeholder="http://localhost:8787"
                    />
                    {configErrors.apiBaseUrl && <p className="text-xs text-rose-700 dark:text-rose-400 mt-1">{configErrors.apiBaseUrl}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Proxy Shared Secret (Optional)</label>
                    <input
                      type="password"
                      name="proxySecret"
                      value={config.proxySecret}
                      onChange={handleConfigChange}
                      className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                      placeholder="Matches PROXY_SHARED_SECRET"
                    />
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Kept in memory only for this session.</p>
                  </div>
                </div>
              </div>
            </div>
          {/* Company Profile Config */}
          <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm md:col-span-2 transition-colors">
            <div className="flex items-center mb-4 text-black dark:text-white">
              <Globe className="w-5 h-5 mr-2 text-rose-900 dark:text-rose-600" />
              <h3 className="text-lg font-bold">Company Profile</h3>
            </div>
            <div>
              <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Company Website URL</label>
              <input 
                type="url"
                name="companyUrl"
                value={config.companyUrl}
                onChange={handleConfigChange}
                className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm focus:ring-2 focus:ring-rose-900 outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                placeholder="https://yourcompany.com"
              />
              {configErrors.companyUrl && <p className="text-xs text-rose-700 dark:text-rose-400 mt-1">{configErrors.companyUrl}</p>}
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Providing your website helps the AI model understand your company, products, and value proposition for better email generation.</p>
            </div>
          </div>

          {/* Sender Profile Config */}
          <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm md:col-span-2 transition-colors">
            <div className="flex items-center mb-4 text-black dark:text-white">
              <User className="w-5 h-5 mr-2 text-rose-900 dark:text-rose-600" />
              <h3 className="text-lg font-bold">Sender & Signature Details</h3>
            </div>
            <div className="grid grid-cols-1 gap-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Your Name</label>
                  <input 
                    type="text"
                    name="senderName"
                    value={config.senderName}
                    onChange={handleConfigChange}
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm focus:ring-2 focus:ring-rose-900 outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                    placeholder="e.g., Jane Smith"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Reply-To Email Address</label>
                  <input 
                    type="email"
                    name="replyTo"
                    value={config.replyTo}
                    onChange={handleConfigChange}
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm focus:ring-2 focus:ring-rose-900 outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                    placeholder="e.g., jane@yourcompany.com"
                  />
                  {configErrors.replyTo && <p className="text-xs text-rose-700 dark:text-rose-400 mt-1">{configErrors.replyTo}</p>}
                </div>
                <div>
                  <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Auto-BCC (CRM)</label>
                  <input 
                    type="email"
                    name="autoBcc"
                    value={config.autoBcc}
                    onChange={handleConfigChange}
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm focus:ring-2 focus:ring-rose-900 outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                    placeholder="bcc@hubspot.com"
                  />
                  {configErrors.autoBcc && <p className="text-xs text-rose-700 dark:text-rose-400 mt-1">{configErrors.autoBcc}</p>}
                </div>
              </div>
              <div>
                 <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Email Signature</label>
                 <textarea
                   name="signature"
                   value={config.signature}
                   onChange={handleConfigChange}
                   rows="4"
                   className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm focus:ring-2 focus:ring-rose-900 outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors resize-none"
                   placeholder="Your signature block..."
                 ></textarea>
                 <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">This signature will be automatically appended to the bottom of your generated drafts.</p>
              </div>
            </div>
          </div>

          {/* CRM Config */}
          <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm transition-colors">
            <div className="flex items-center mb-4 text-black dark:text-white">
              <Database className="w-5 h-5 mr-2 text-rose-900 dark:text-rose-600" />
              <h3 className="text-lg font-bold">HubSpot CRM</h3>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Private App Access Token</label>
                <input 
                  type="password"
                  name="hubspotToken"
                  value={config.hubspotToken}
                  onChange={handleConfigChange}
                  className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm focus:ring-2 focus:ring-rose-900 outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                  placeholder="pat-na1-..."
                />
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Required to sync contacts and log emails.</p>
              </div>
            </div>
          </div>

          {/* Email Server Config */}
          <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm transition-colors">
            <div className="flex items-center mb-4 text-black dark:text-white">
              <Server className="w-5 h-5 mr-2 text-rose-900 dark:text-rose-600" />
              <h3 className="text-lg font-bold">Email Server & Security (IMAP/SMTP)</h3>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-2">
                <div className="col-span-2">
                  <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">SMTP Host</label>
                  <input 
                    type="text" name="smtpHost" value={config.smtpHost} onChange={handleConfigChange}
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors" placeholder="smtp.example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Port</label>
                  <input 
                    type="text" name="smtpPort" value={config.smtpPort} onChange={handleConfigChange}
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Security</label>
                  <select 
                    name="smtpSecure" value={config.smtpSecure} onChange={handleConfigChange}
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                  >
                    <option value="none">None</option>
                    <option value="tls">STARTTLS</option>
                    <option value="ssl">SSL/TLS</option>
                  </select>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">SMTP Username</label>
                  <input 
                    type="text" name="smtpUser" value={config.smtpUser} onChange={handleConfigChange}
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors" placeholder="user@example.com"
                  />
                  {configErrors.smtpUser && <p className="text-xs text-rose-700 dark:text-rose-400 mt-1">{configErrors.smtpUser}</p>}
                </div>
                <div>
                  <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">SMTP Password</label>
                  <input 
                    type="password" name="smtpPass" value={config.smtpPass} onChange={handleConfigChange}
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors" placeholder="••••••••"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800">
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">IMAP Host</label>
                    <input 
                      type="text" name="imapHost" value={config.imapHost} onChange={handleConfigChange}
                      className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors" placeholder="imap.example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Port</label>
                    <input 
                      type="text" name="imapPort" value={config.imapPort} onChange={handleConfigChange}
                      className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Sending Limits & Safety */}
          <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm transition-colors">
            <div className="flex items-center mb-4 text-black dark:text-white">
              <Shield className="w-5 h-5 mr-2 text-rose-900 dark:text-rose-600" />
              <h3 className="text-lg font-bold">Sending Safety & Limits</h3>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Max Daily Emails</label>
                  <input 
                    type="number" name="maxDailyEmails" value={config.maxDailyEmails} onChange={handleConfigChange}
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                  />
                  {configErrors.maxDailyEmails && <p className="text-xs text-rose-700 dark:text-rose-400 mt-1">{configErrors.maxDailyEmails}</p>}
                </div>
                <div>
                  <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Send Delay (sec)</label>
                  <input 
                    type="number" name="sendDelay" value={config.sendDelay} onChange={handleConfigChange}
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                  />
                  {configErrors.sendDelay && <p className="text-xs text-rose-700 dark:text-rose-400 mt-1">{configErrors.sendDelay}</p>}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Start Time</label>
                  <input 
                    type="time" name="activeHoursStart" value={config.activeHoursStart} onChange={handleConfigChange}
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                  />
                  {configErrors.activeHoursStart && <p className="text-xs text-rose-700 dark:text-rose-400 mt-1">{configErrors.activeHoursStart}</p>}
                </div>
                <div>
                  <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">End Time</label>
                  <input 
                    type="time" name="activeHoursEnd" value={config.activeHoursEnd} onChange={handleConfigChange}
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                  />
                  {configErrors.activeHoursEnd && <p className="text-xs text-rose-700 dark:text-rose-400 mt-1">{configErrors.activeHoursEnd}</p>}
                </div>
                <div>
                  <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Timezone</label>
                  <select 
                    name="timezone" value={config.timezone} onChange={handleConfigChange}
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                  >
                    <option value="EST">EST</option>
                    <option value="CST">CST</option>
                    <option value="MST">MST</option>
                    <option value="PST">PST</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Global AI Preferences */}
          <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm transition-colors">
            <div className="flex items-center mb-4 text-black dark:text-white">
              <SlidersHorizontal className="w-5 h-5 mr-2 text-rose-900 dark:text-rose-600" />
              <h3 className="text-lg font-bold">AI Defaults</h3>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Default Tone</label>
                  <select 
                    name="defaultTone" value={config.defaultTone} onChange={handleConfigChange}
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                  >
                    <option value="Professional">Professional</option>
                    <option value="Persuasive">Persuasive</option>
                    <option value="Friendly">Friendly</option>
                    <option value="Direct">Direct & Urgent</option>
                    <option value="Consultative">Consultative</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Default Length</label>
                  <select 
                    name="defaultLength" value={config.defaultLength} onChange={handleConfigChange}
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                  >
                    <option value="Concise">Concise (Short)</option>
                    <option value="Standard">Standard</option>
                    <option value="Detailed">Detailed</option>
                  </select>
                </div>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2">These preferences will be automatically applied when you open the composer or draft a new sequence.</p>
            </div>
          </div>

          {/* AI Providers Config */}
          <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm md:col-span-2 transition-colors">
            <div className="flex items-center mb-4 text-black dark:text-white">
              <Key className="w-5 h-5 mr-2 text-rose-900 dark:text-rose-600" />
              <h3 className="text-lg font-bold">AI Provider API Keys</h3>
            </div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
              Gemini is active by default. Enter keys below to enable other routing providers for generation and analysis.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[
                { label: 'Gemini API Key (Google AI Studio)', name: 'geminiKey' },
                { label: 'OpenAI API Key (ChatGPT)', name: 'openaiKey' },
                { label: 'Anthropic API Key (Claude)', name: 'anthropicKey' },
                { label: 'xAI API Key (Grok)', name: 'xaiKey' },
                { label: 'Meta API Key (Llama)', name: 'metaKey' },
              ].map((provider) => (
                <div key={provider.name}>
                  <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">{provider.label}</label>
                  <input 
                    type="password"
                    name={provider.name}
                    value={config[provider.name]}
                    onChange={handleConfigChange}
                    className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm focus:ring-2 focus:ring-rose-900 outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors"
                    placeholder="sk-..."
                  />
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
    );
  };

  return (
    <div className={`flex h-screen font-sans overflow-hidden transition-colors ${isDarkMode ? 'dark bg-zinc-950' : 'bg-white'}`}>
      
      {/* Sidebar Navigation */}
      <div className="w-64 bg-black dark:bg-zinc-900 text-zinc-300 flex flex-col border-r border-zinc-800 transition-colors">
        <div className="p-6 border-b border-zinc-800">
          <h1 className="text-xl font-bold text-white flex items-center">
            <div className="w-8 h-8 bg-rose-900 rounded-lg flex items-center justify-center mr-3">
              <Activity className="w-5 h-5 text-white" />
            </div>
            Sales Director
          </h1>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          {[
            { id: 'dashboard', icon: Activity, label: 'Dashboard' },
            { id: 'inbox', icon: Inbox, label: 'Smart Inbox' },
            { id: 'tasks', icon: CheckSquare, label: 'Tasks & Calendar' },
            { id: 'contacts', icon: Users, label: 'CRM & Contacts' },
            { id: 'outreach', icon: Edit3, label: 'AI Outreach' },
            { id: 'settings', icon: Settings, label: 'Settings' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center px-4 py-3 rounded-lg transition-colors duration-150 ${
                activeTab === item.id 
                  ? 'bg-zinc-800 dark:bg-zinc-800 text-white font-bold shadow-sm' 
                  : 'hover:bg-zinc-900 dark:hover:bg-zinc-800 hover:text-white font-bold'
              }`}
            >
              <item.icon className={`w-5 h-5 mr-3 ${activeTab === item.id ? 'text-rose-900 dark:text-rose-500' : 'text-zinc-400'}`} />
              {item.label}
              {activeTab === item.id && <ChevronRight className="w-4 h-4 ml-auto opacity-50" />}
            </button>
          ))}
        </nav>
        
        <div className="p-4 border-t border-zinc-800 text-xs text-zinc-500 text-center flex flex-col items-center">
          <p className="mb-1 font-medium">Proudly built in Niagara Falls by</p>
          <a href="https://www.akitaengineering.com" target="_blank" rel="noopener noreferrer" className="text-rose-900 dark:text-rose-600 hover:text-rose-700 dark:hover:text-rose-400 font-bold text-sm mb-1 transition-colors">
            Akita Engineering
          </a>
          <p className="text-zinc-600 dark:text-zinc-500 font-medium text-[10px]">www.akitaengineering.com</p>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col relative overflow-hidden bg-white dark:bg-zinc-950 transition-colors">
        {/* Header bar */}
        <header className="h-16 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between px-8 z-10 transition-colors">
          <h2 className="text-lg font-bold text-black dark:text-white capitalize">
            {activeTab.replace('-', ' ')}
          </h2>
          <div className="flex items-center space-x-4">
            <button 
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-2 rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              title="Toggle Dark Mode"
            >
              {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-zinc-400" />
              <input 
                type="text" 
                placeholder="Search leads..." 
                className="pl-9 pr-4 py-1.5 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-full text-sm outline-none focus:ring-2 focus:ring-rose-900 w-64 transition-all text-black dark:text-white"
              />
            </div>
            <div className="w-8 h-8 rounded-full bg-rose-900 text-white flex items-center justify-center font-bold text-sm shadow-sm">
              JD
            </div>
          </div>
        </header>

        {/* Dynamic Content */}
        <main className="flex-1 overflow-auto flex bg-white dark:bg-zinc-950 transition-colors">
          {activeTab === 'dashboard' && renderDashboard()}
          {activeTab === 'inbox' && renderInbox()}
          {activeTab === 'tasks' && renderTasks()}
          {activeTab === 'contacts' && renderContacts()}
          {activeTab === 'outreach' && renderOutreach()}
          {activeTab === 'settings' && renderSettings()}
        </main>

        {/* Global Notifications Notification */}
        {notification && (
          <div className="absolute bottom-6 right-6 z-50 animate-fade-in-up">
            <div className={`flex items-center px-4 py-3 rounded-lg shadow-lg border ${
              notification.type === 'error' 
                ? 'bg-white dark:bg-zinc-900 border-rose-900 text-rose-900 dark:text-rose-500 font-bold'
                : 'bg-black dark:bg-white border-zinc-800 dark:border-zinc-200 text-white dark:text-black font-bold'
            }`}>
              {notification.type === 'error' 
                ? <AlertCircle className="w-5 h-5 mr-3 text-rose-900 dark:text-rose-500" />
                : <CheckCircle className="w-5 h-5 mr-3 text-white dark:text-black" />
              }
              <span className="text-sm">{notification.message}</span>
            </div>
          </div>
        )}
      </div>

      {/* CRM Create/Edit Modal Overlay */}
      {isContactModalOpen && editingContact && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden border border-zinc-200 dark:border-zinc-800 animate-fade-in-up">
            <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-zinc-50 dark:bg-zinc-950/50">
              <h2 className="text-xl font-bold text-black dark:text-white">{editingContact._isNew ? 'Add Contact' : 'Edit Contact'}</h2>
              <button onClick={() => { setIsContactModalOpen(false); setEditingContact(null); }} className="text-zinc-400 hover:text-black dark:hover:text-white transition">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Full Name</label>
                <input type="text" name="name" value={editingContact.name} onChange={handleContactFormChange} className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm focus:ring-2 focus:ring-rose-900 outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Email <span className="text-rose-900">*</span></label>
                <input type="email" name="email" disabled={!editingContact._isNew} value={editingContact.email} onChange={handleContactFormChange} className={`w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm focus:ring-2 focus:ring-rose-900 outline-none text-black dark:text-white transition-colors ${!editingContact._isNew ? 'bg-zinc-100 dark:bg-zinc-950 opacity-70' : 'bg-white dark:bg-zinc-800'}`} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Company</label>
                  <input type="text" name="company" value={editingContact.company} onChange={handleContactFormChange} className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm focus:ring-2 focus:ring-rose-900 outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Job Title</label>
                  <input type="text" name="jobTitle" value={editingContact.jobTitle} onChange={handleContactFormChange} className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm focus:ring-2 focus:ring-rose-900 outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Phone</label>
                  <input type="text" name="phone" value={editingContact.phone} onChange={handleContactFormChange} className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm focus:ring-2 focus:ring-rose-900 outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Stage</label>
                  <select name="stage" value={editingContact.stage} onChange={handleContactFormChange} className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm focus:ring-2 focus:ring-rose-900 outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors">
                    <option value="Lead">Lead</option>
                    <option value="Opportunity">Opportunity</option>
                    <option value="Customer">Customer</option>
                    <option value="Churned">Churned</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">LinkedIn URL</label>
                <input type="url" name="linkedin" value={editingContact.linkedin} onChange={handleContactFormChange} className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm focus:ring-2 focus:ring-rose-900 outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">Notes</label>
                <textarea name="notes" value={editingContact.notes} onChange={handleContactFormChange} rows="3" className="w-full border border-zinc-300 dark:border-zinc-700 rounded-md p-2 text-sm focus:ring-2 focus:ring-rose-900 outline-none text-black dark:text-white bg-white dark:bg-zinc-800 transition-colors resize-none"></textarea>
              </div>
            </div>
            <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50 flex justify-end space-x-3">
              <button onClick={() => { setIsContactModalOpen(false); setEditingContact(null); }} className="px-4 py-2 text-sm font-bold text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white transition">Cancel</button>
              <button onClick={saveContact} disabled={loading} className="px-6 py-2 bg-black dark:bg-white text-white dark:text-black rounded-lg text-sm font-bold hover:bg-zinc-800 dark:hover:bg-zinc-200 transition disabled:opacity-50">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal Overlay */}
      {contactToDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-sm rounded-xl shadow-2xl p-6 border border-zinc-200 dark:border-zinc-800 animate-fade-in-up">
             <h2 className="text-xl font-bold text-black dark:text-white mb-2">Delete Contact</h2>
             <p className="text-zinc-600 dark:text-zinc-400 text-sm mb-6">Are you sure you want to permanently delete <strong className="text-black dark:text-white">{contactToDelete.name}</strong>? This action cannot be undone.</p>
             <div className="flex justify-end space-x-3">
               <button onClick={() => setContactToDelete(null)} className="px-4 py-2 text-sm font-bold text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white transition">Cancel</button>
               <button onClick={deleteContact} disabled={loading} className="px-6 py-2 bg-rose-900 text-white rounded-lg text-sm font-bold hover:bg-rose-950 transition disabled:opacity-50">Delete</button>
             </div>
          </div>
        </div>
      )}

      {/* Lead Dossier Modal Overlay */}
      {selectedContact && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-4xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden border border-zinc-200 dark:border-zinc-800 animate-fade-in-up">
            
            {/* Modal Header */}
            <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-start bg-zinc-50 dark:bg-zinc-950/50">
              <div>
                <h2 className="text-2xl font-bold text-black dark:text-white flex items-center">
                  {selectedContact.name}
                  <span className={`ml-3 px-2 py-0.5 rounded-full text-xs font-bold ${
                      selectedContact.status === 'Warm' || selectedContact.stage === 'Opportunity' ? 'bg-rose-100 dark:bg-rose-900/30 text-rose-900 dark:text-rose-400' :
                      selectedContact.status === 'Cold' ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-300' :
                      'bg-black dark:bg-white text-white dark:text-black'
                    }`}>
                      {selectedContact.stage || selectedContact.status}
                  </span>
                </h2>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">{selectedContact.jobTitle ? `${selectedContact.jobTitle} at ` : ''}<strong className="text-black dark:text-white">{selectedContact.company}</strong></p>
              </div>
              <button onClick={() => setSelectedContact(null)} className="text-zinc-400 hover:text-black dark:hover:text-white transition">
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 flex flex-col md:flex-row gap-6">
              
              {/* Left Column: Details & Actions */}
              <div className="w-full md:w-1/3 space-y-6">
                <div className="bg-zinc-50 dark:bg-zinc-950/50 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800">
                  <h3 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-4">Contact Info</h3>
                  <div className="space-y-3">
                    <div className="flex items-center text-sm">
                      <Mail className="w-4 h-4 mr-2 text-zinc-400" />
                      <a href={`mailto:${selectedContact.email}`} className="text-rose-900 dark:text-rose-500 hover:underline">{selectedContact.email}</a>
                    </div>
                    {selectedContact.phone && (
                      <div className="flex items-center text-sm text-zinc-700 dark:text-zinc-300">
                        <Phone className="w-4 h-4 mr-2 text-zinc-400" />
                        {selectedContact.phone}
                      </div>
                    )}
                    {selectedContact.linkedin && (
                      <div className="flex items-center text-sm text-zinc-700 dark:text-zinc-300">
                        <Linkedin className="w-4 h-4 mr-2 text-zinc-400" />
                        <a href={selectedContact.linkedin} target="_blank" rel="noopener noreferrer" className="hover:underline hover:text-rose-900 dark:hover:text-rose-500 truncate">LinkedIn Profile</a>
                      </div>
                    )}
                  </div>
                  {selectedContact.notes && (
                    <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                      <h4 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-1">Notes</h4>
                      <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">{selectedContact.notes}</p>
                    </div>
                  )}
                </div>

                <div className="bg-zinc-50 dark:bg-zinc-950/50 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800">
                   <h3 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-4">Quick Actions</h3>
                   <div className="space-y-2">
                     <button 
                       onClick={() => {
                         setComposerState(prev => ({ 
                           ...prev, 
                           to: selectedContact.email,
                           hubspotId: selectedContact.hubspotId || null,
                           recipientName: selectedContact.name,
                           companyName: selectedContact.company,
                           jobTitle: selectedContact.jobTitle || '',
                           threadHistory: selectedContact.historyString
                         }));
                         setSelectedContact(null);
                         setActiveTab('outreach');
                       }}
                       className="w-full flex items-center justify-center bg-rose-900 text-white py-2 rounded-lg text-sm font-bold hover:bg-rose-800 transition"
                     >
                       <Edit3 className="w-4 h-4 mr-2" /> Draft Outreach
                     </button>
                     <button 
                        onClick={() => {
                           setNewTaskInput(`Follow up with ${selectedContact.name}`);
                           setSelectedContact(null);
                           setActiveTab('tasks');
                        }}
                        className="w-full flex items-center justify-center bg-zinc-200 dark:bg-zinc-800 text-black dark:text-white py-2 rounded-lg text-sm font-bold hover:bg-zinc-300 dark:hover:bg-zinc-700 transition"
                     >
                       <CheckSquare className="w-4 h-4 mr-2" /> Add Task
                     </button>
                     <button 
                        onClick={() => showNotification("Call logged to HubSpot (Simulation)", "success")}
                        className="w-full flex items-center justify-center bg-black dark:bg-white text-white dark:text-black py-2 rounded-lg text-sm font-bold hover:bg-zinc-800 dark:hover:bg-zinc-200 transition"
                     >
                       <Phone className="w-4 h-4 mr-2" /> Log Call
                     </button>
                   </div>
                </div>
              </div>

              {/* Right Column: Timeline */}
              <div className="w-full md:w-2/3">
                 <h3 className="text-lg font-bold text-black dark:text-white mb-4 flex items-center">
                    <Activity className="w-5 h-5 mr-2 text-rose-900 dark:text-rose-600" /> Interaction Timeline
                 </h3>
                 
                 {(!selectedContact.messages || selectedContact.messages.length === 0) ? (
                    <div className="p-8 text-center text-zinc-500 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl">
                      <MessageSquare className="w-8 h-8 mx-auto mb-2 text-zinc-400" />
                      <p>No recorded interactions yet.</p>
                    </div>
                 ) : (
                   <div className="space-y-4">
                     {selectedContact.messages.map((msg, idx) => (
                       <details key={idx} className="group bg-zinc-50 dark:bg-zinc-950/50 rounded-xl border border-zinc-200 dark:border-zinc-800 [&_summary::-webkit-details-marker]:hidden">
                         <summary className="flex justify-between items-center p-4 cursor-pointer focus:outline-none">
                           <div className="flex items-center">
                             <span className={`text-xs font-bold px-2 py-1 rounded mr-3 ${msg.direction === 'outbound' ? 'bg-zinc-200 dark:bg-zinc-800 text-black dark:text-white' : 'bg-rose-100 dark:bg-rose-900/30 text-rose-900 dark:text-rose-400'}`}>
                                {msg.direction === 'outbound' ? 'You Sent' : 'They Replied'}
                             </span>
                             <h4 className="text-sm font-bold text-black dark:text-white truncate max-w-xs">{msg.subject || 'No Subject'}</h4>
                           </div>
                           <div className="flex items-center text-zinc-400">
                             <span className="text-xs mr-3">{new Date(msg.date).toLocaleString()}</span>
                             <ChevronRight className="w-4 h-4 transform group-open:rotate-90 transition-transform" />
                           </div>
                         </summary>
                         <div className="p-4 pt-0 border-t border-zinc-200 dark:border-zinc-800 mt-2 text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">
                            {msg.body}
                         </div>
                       </details>
                     ))}
                   </div>
                 )}
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}
