import { useState, useEffect, useRef, useCallback } from "react";
import type {
  CallRecord,
  MessageRecord,
  MessageThread,
  PhoneContact,
  PhoneDataSource,
  PhoneDrawerTab,
  PhoneSettings,
  PhoneAgentConfig,
  CallState,
} from "./types";
import "./phone-workspace.css";

const KEYPAD_BUTTONS = [
  { num: "1", sub: "" },
  { num: "2", sub: "ABC" },
  { num: "3", sub: "DEF" },
  { num: "4", sub: "GHI" },
  { num: "5", sub: "JKL" },
  { num: "6", sub: "MNO" },
  { num: "7", sub: "PQRS" },
  { num: "8", sub: "TUV" },
  { num: "9", sub: "WXYZ" },
  { num: "*", sub: "" },
  { num: "0", sub: "+" },
  { num: "#", sub: "" },
];

export interface PhoneWorkspaceProps {
  dataSource: PhoneDataSource;
  initialNumber?: string;
  onCallStateChange?: (state: CallState) => void;
}

export function PhoneWorkspace({
  dataSource,
  initialNumber = "",
  onCallStateChange,
}: PhoneWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<PhoneDrawerTab>("dialer");
  const [dialedNumber, setDialedNumber] = useState(initialNumber);
  const [callState, setCallState] = useState<CallState>("idle");
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isHeld, setIsHeld] = useState(false);

  // Host microphone permission status
  const [micPermission, setMicPermission] = useState<"granted" | "prompt" | "denied" | "unsupported">("prompt");
  const audioStreamRef = useRef<MediaStream | null>(null);

  // Data states
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [activeThreadContact, setActiveThreadContact] = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<MessageRecord[]>([]);
  const [newMessageText, setNewMessageText] = useState("");
  const [contacts, setContacts] = useState<PhoneContact[]>([]);
  const [contactSearch, setContactSearch] = useState("");
  const [agentConfig, setAgentConfig] = useState<PhoneAgentConfig>({});
  const [settings, setSettings] = useState<PhoneSettings>({});
  const [loading, setLoading] = useState(false);

  // Call timer interval
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    if (callState === "connected") {
      timer = setInterval(() => {
        setCallDuration((d) => d + 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [callState]);

  // Host microphone permission check
  useEffect(() => {
    if (!navigator?.mediaDevices?.getUserMedia) {
      return;
    }
    navigator.permissions?.query?.({ name: "microphone" as PermissionName })
      .then((status) => {
        setMicPermission(status.state as "granted" | "prompt" | "denied");
        status.onchange = () => {
          setMicPermission(status.state as "granted" | "prompt" | "denied");
        };
      })
      .catch(() => {
        // Fallback: leave as prompt
      });
  }, []);

  const requestMicAccess = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      setMicPermission("granted");
    } catch {
      setMicPermission("denied");
    }
  }, []);

  // Fetch data per tab
  useEffect(() => {
    let active = true;

    if (activeTab === "calls") {
      dataSource.listCalls()
        .then((data) => { if (active) setCalls(data); })
        .catch(() => {})
        .finally(() => { if (active) setLoading(false); });
    } else if (activeTab === "messages") {
      dataSource.listThreads()
        .then((data) => {
          if (active) {
            setThreads(data);
            if (data.length > 0 && !activeThreadContact) {
              setActiveThreadContact(data[0].contactNumber);
            }
          }
        })
        .catch(() => {})
        .finally(() => { if (active) setLoading(false); });
    } else if (activeTab === "contacts") {
      dataSource.listContacts()
        .then((data) => { if (active) setContacts(data); })
        .catch(() => {})
        .finally(() => { if (active) setLoading(false); });
    } else if (activeTab === "agents") {
      dataSource.getAgentConfig()
        .then((data) => { if (active) setAgentConfig(data); })
        .catch(() => {})
        .finally(() => { if (active) setLoading(false); });
    } else if (activeTab === "settings") {
      dataSource.getSettings()
        .then((data) => { if (active) setSettings(data); })
        .catch(() => {})
        .finally(() => { if (active) setLoading(false); });
    } else {
      setLoading(false);
    }

    return () => { active = false; };
  }, [activeTab, dataSource, activeThreadContact]);

  // Load thread messages when selected
  useEffect(() => {
    if (activeThreadContact) {
      dataSource.getThreadMessages(activeThreadContact)
        .then(setThreadMessages)
        .catch(() => {});
    }
  }, [activeThreadContact, dataSource]);

  const handleKeyPress = (num: string) => {
    if (callState === "connected") {
      // In-call DTMF
      return;
    }
    setDialedNumber((prev) => prev + num);
  };

  const handleStartCall = async () => {
    if (!dialedNumber.trim()) return;
    setCallDuration(0);
    if (micPermission !== "granted") {
      await requestMicAccess();
    }
    setCallState("connecting");
    onCallStateChange?.("connecting");

    try {
      await dataSource.logCall({
        number: dialedNumber,
        type: "outbound",
        duration: 0,
        status: "initiated",
      });
      setCallState("connected");
      onCallStateChange?.("connected");
    } catch {
      setCallState("ended");
      onCallStateChange?.("ended");
      setTimeout(() => {
        setCallState("idle");
        setCallDuration(0);
      }, 1500);
    }
  };

  const handleEndCall = () => {
    setCallState("ended");
    onCallStateChange?.("ended");
    setTimeout(() => {
      setCallState("idle");
      setCallDuration(0);
      onCallStateChange?.("idle");
    }, 1000);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessageText.trim() || !activeThreadContact) return;
    try {
      const msg = await dataSource.sendMessage(activeThreadContact, newMessageText);
      setThreadMessages((prev) => [...prev, msg]);
      setNewMessageText("");
    } catch {
      // Handled gracefully
    }
  };

  const formatTimer = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="phone-workspace">
      {micPermission !== "granted" && (
        <div className="phone-host-perm-banner">
          <div className="phone-perm-text">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
            <span>Host microphone access required for voice calls</span>
          </div>
          <button type="button" className="phone-perm-btn" onClick={requestMicAccess}>
            Grant Microphone
          </button>
        </div>
      )}

      <nav className="phone-workspace-nav">
        {(["dialer", "calls", "messages", "contacts", "agents", "settings"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            className={`phone-nav-tab ${activeTab === tab ? "active" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </nav>

      <div className="phone-workspace-content">
        {/* DIALER TAB */}
        {activeTab === "dialer" && (
          <div className="phone-dialer-card">
            {callState === "connected" ? (
              <div className="phone-active-call-banner">
                <div className="phone-call-party">{dialedNumber}</div>
                <div className="phone-call-timer">{formatTimer(callDuration)}</div>
                <div style={{ fontSize: "12px", color: isHeld ? "#f59e0b" : "#10b981" }}>
                  {isHeld ? "Call on Hold" : "Active Call"}
                </div>
              </div>
            ) : (
              <div className="phone-display-wrap">
                <input
                  type="text"
                  className="phone-number-input"
                  placeholder="Enter phone number"
                  value={dialedNumber}
                  onChange={(e) => setDialedNumber(e.target.value)}
                />
                {dialedNumber && (
                  <button
                    type="button"
                    className="phone-clear-btn"
                    onClick={() => setDialedNumber("")}
                    aria-label="Clear"
                  >
                    ✕
                  </button>
                )}
              </div>
            )}

            <div className="phone-keypad-grid">
              {KEYPAD_BUTTONS.map((k) => (
                <button
                  key={k.num}
                  type="button"
                  className="phone-key-btn"
                  onClick={() => handleKeyPress(k.num)}
                >
                  <span className="phone-key-num">{k.num}</span>
                  {k.sub && <span className="phone-key-sub">{k.sub}</span>}
                </button>
              ))}
            </div>

            <div className="phone-call-actions">
              {callState === "connected" ? (
                <>
                  <button
                    type="button"
                    className={`phone-action-circle aux ${isMuted ? "active" : ""}`}
                    onClick={() => setIsMuted(!isMuted)}
                    title={isMuted ? "Unmute" : "Mute"}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><line x1="2" x2="22" y1="2" y2="22"/></svg>
                  </button>
                  <button
                    type="button"
                    className="phone-action-circle end-call"
                    onClick={handleEndCall}
                    title="End Call"
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"/><line x1="2" x2="22" y1="2" y2="22"/></svg>
                  </button>
                  <button
                    type="button"
                    className={`phone-action-circle aux ${isHeld ? "active" : ""}`}
                    onClick={() => setIsHeld(!isHeld)}
                    title={isHeld ? "Resume" : "Hold"}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="phone-action-circle start-call"
                  onClick={handleStartCall}
                  title="Place Call"
                  disabled={!dialedNumber.trim()}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                </button>
              )}
            </div>
          </div>
        )}

        {/* CALLS TAB */}
        {activeTab === "calls" && (
          <div className="phone-list">
            {calls.length === 0 && !loading && (
              <div className="phone-empty-state">No call history recorded.</div>
            )}
            {calls.map((c) => (
              <div key={c.id} className="phone-list-item">
                <div className="phone-item-main">
                  <div className="phone-item-title">
                    <span>{c.contactName || c.number}</span>
                    <span style={{ fontSize: "11px", fontWeight: "normal", color: "#94a3b8" }}>
                      ({c.type})
                    </span>
                  </div>
                  <div className="phone-item-subtitle">
                    {c.time} · {c.duration}s
                  </div>
                </div>
                <div className="phone-item-actions">
                  <button
                    type="button"
                    className="phone-mini-btn"
                    onClick={() => {
                      setDialedNumber(c.number);
                      setActiveTab("dialer");
                    }}
                  >
                    Call
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* MESSAGES TAB */}
        {activeTab === "messages" && (
          <div style={{ display: "flex", gap: "16px", height: "100%" }}>
            <div style={{ width: "220px", borderRight: "1px solid var(--tr-border, #334155)", paddingRight: "12px" }}>
              <div className="phone-list">
                {threads.length === 0 && !loading && (
                  <div className="phone-empty-state">No threads found.</div>
                )}
                {threads.map((t) => (
                  <div
                    key={t.id}
                    className="phone-list-item"
                    style={{
                      cursor: "pointer",
                      background: activeThreadContact === t.contactNumber ? "rgba(16, 185, 129, 0.15)" : undefined,
                    }}
                    onClick={() => setActiveThreadContact(t.contactNumber)}
                  >
                    <div className="phone-item-main">
                      <div className="phone-item-title">{t.contactName || t.contactNumber}</div>
                      <div className="phone-item-subtitle">{t.lastMessage}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
              <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px", marginBottom: "12px" }}>
                {threadMessages.map((m) => (
                  <div
                    key={m.id}
                    style={{
                      alignSelf: m.isInbound ? "flex-start" : "flex-end",
                      maxWidth: "75%",
                      padding: "8px 12px",
                      borderRadius: "8px",
                      background: m.isInbound ? "#1e293b" : "#059669",
                      fontSize: "13px",
                    }}
                  >
                    <div>{m.text}</div>
                    <div style={{ fontSize: "10px", opacity: 0.7, marginTop: "4px", textAlign: "right" }}>{m.time}</div>
                  </div>
                ))}
              </div>

              <form onSubmit={handleSendMessage} style={{ display: "flex", gap: "8px" }}>
                <input
                  type="text"
                  className="phone-form-input"
                  style={{ flex: 1 }}
                  placeholder="Type a message..."
                  value={newMessageText}
                  onChange={(e) => setNewMessageText(e.target.value)}
                  disabled={!activeThreadContact}
                />
                <button type="submit" className="phone-submit-btn" disabled={!activeThreadContact || !newMessageText.trim()}>
                  Send
                </button>
              </form>
            </div>
          </div>
        )}

        {/* CONTACTS TAB */}
        {activeTab === "contacts" && (
          <div>
            <div style={{ marginBottom: "12px" }}>
              <input
                type="text"
                className="phone-form-input"
                style={{ width: "100%" }}
                placeholder="Search contacts by name or number..."
                value={contactSearch}
                onChange={(e) => {
                  setContactSearch(e.target.value);
                  if (e.target.value.trim()) {
                    dataSource.searchContacts(e.target.value).then(setContacts);
                  } else {
                    dataSource.listContacts().then(setContacts);
                  }
                }}
              />
            </div>

            <div className="phone-list">
              {contacts.length === 0 && !loading && (
                <div className="phone-empty-state">No contacts found.</div>
              )}
              {contacts.map((contact) => (
                <div key={contact.id} className="phone-list-item">
                  <div className="phone-item-main">
                    <div className="phone-item-title">{contact.name}</div>
                    <div className="phone-item-subtitle">{contact.number} {contact.organization ? `· ${contact.organization}` : ""}</div>
                  </div>
                  <div className="phone-item-actions">
                    <button
                      type="button"
                      className="phone-mini-btn"
                      onClick={() => {
                        setDialedNumber(contact.number);
                        setActiveTab("dialer");
                      }}
                    >
                      Call
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AGENTS TAB */}
        {activeTab === "agents" && (
          <div>
            <div className="phone-form-group">
              <label className="phone-form-label">Inbound Agent Status</label>
              <div>
                <button
                  type="button"
                  className={`phone-mini-btn ${agentConfig.enabled ? "active" : ""}`}
                  onClick={async () => {
                    const next = !agentConfig.enabled;
                    await dataSource.setAgentConfig({ enabled: next });
                    setAgentConfig((prev) => ({ ...prev, enabled: next }));
                  }}
                  style={{ background: agentConfig.enabled ? "#10b981" : undefined }}
                >
                  {agentConfig.enabled ? "Active (Handling Calls)" : "Disabled (Direct Ring)"}
                </button>
              </div>
            </div>

            <div className="phone-form-group">
              <label className="phone-form-label">Greeting Message</label>
              <input
                type="text"
                className="phone-form-input"
                value={agentConfig.greeting || ""}
                onChange={(e) => setAgentConfig((prev) => ({ ...prev, greeting: e.target.value }))}
                onBlur={() => dataSource.setAgentConfig({ greeting: agentConfig.greeting })}
              />
            </div>

            <div className="phone-form-group">
              <label className="phone-form-label">Agent Prompt / Persona</label>
              <textarea
                className="phone-form-textarea"
                value={agentConfig.prompt || ""}
                onChange={(e) => setAgentConfig((prev) => ({ ...prev, prompt: e.target.value }))}
                onBlur={() => dataSource.setAgentConfig({ prompt: agentConfig.prompt })}
              />
            </div>

            <div className="phone-form-group">
              <label className="phone-form-label">Voice Model</label>
              <select
                className="phone-form-select"
                value={agentConfig.voice || "alloy"}
                onChange={(e) => {
                  const val = e.target.value;
                  setAgentConfig((prev) => ({ ...prev, voice: val }));
                  dataSource.setAgentConfig({ voice: val });
                }}
              >
                <option value="alloy">Alloy (Balanced)</option>
                <option value="echo">Echo (Warm)</option>
                <option value="fable">Fable (Expressive)</option>
                <option value="onyx">Onyx (Deep)</option>
                <option value="nova">Nova (Bright)</option>
                <option value="shimmer">Shimmer (Clear)</option>
              </select>
            </div>
          </div>
        )}

        {/* SETTINGS TAB */}
        {activeTab === "settings" && (
          <div>
            <div className="phone-form-group">
              <label className="phone-form-label">Default Outbound Caller ID</label>
              <input
                type="text"
                className="phone-form-input"
                value={settings.defaultCallerId || ""}
                onChange={(e) => setSettings((prev) => ({ ...prev, defaultCallerId: e.target.value }))}
                onBlur={() => dataSource.setSettings({ defaultCallerId: settings.defaultCallerId })}
              />
            </div>

            <div className="phone-form-group">
              <label className="phone-form-label">Ringtone Preset</label>
              <select
                className="phone-form-select"
                value={settings.ringtonePreset || "classic"}
                onChange={(e) => {
                  const val = e.target.value;
                  setSettings((prev) => ({ ...prev, ringtonePreset: val }));
                  dataSource.setSettings({ ringtonePreset: val });
                }}
              >
                <option value="classic">Classic Bell</option>
                <option value="digital">Digital Chirp</option>
                <option value="marimba">Marimba Tone</option>
                <option value="chime">Subtle Chime</option>
              </select>
            </div>

            <div className="phone-form-group">
              <label className="phone-form-label">Automatic Call Recording</label>
              <div>
                <input
                  type="checkbox"
                  id="chk-autorecord"
                  checked={settings.autoRecord || false}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setSettings((prev) => ({ ...prev, autoRecord: checked }));
                    dataSource.setSettings({ autoRecord: checked });
                  }}
                />
                <label htmlFor="chk-autorecord" style={{ marginLeft: "8px", fontSize: "13px" }}>
                  Record all inbound and outbound calls
                </label>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
