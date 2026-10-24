export type CallState = "idle" | "connecting" | "ringing" | "connected" | "held" | "ended";

export interface CallRecord {
  id: string;
  time: string;
  number: string;
  contactName?: string;
  type: "inbound" | "outbound" | "missed";
  duration: number;
  notes?: string;
  recordingUrl?: string;
  transcript?: string;
  status?: string;
}

export interface MessageRecord {
  id: string;
  threadId?: string;
  from: string;
  to: string;
  text: string;
  time: string;
  isInbound: boolean;
  mediaUrls?: string[];
  status?: "pending" | "sent" | "delivered" | "failed";
}

export interface MessageThread {
  id: string;
  contactNumber: string;
  contactName?: string;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
}

export interface PhoneContact {
  id: string;
  name: string;
  number: string;
  email?: string;
  organization?: string;
  notes?: string;
  source?: string;
}

export interface VoicemailRecord {
  id: string;
  from: string;
  time: string;
  duration: number;
  audioUrl?: string;
  transcript?: string;
  isRead: boolean;
}

export interface PhoneAgentConfig {
  greeting?: string;
  prompt?: string;
  voice?: string;
  language?: string;
  model?: string;
  transferNumber?: string;
  enabled?: boolean;
}

export interface PhoneSettings {
  defaultCallerId?: string;
  ringtonePreset?: string;
  customRingtoneUrl?: string;
  autoRecord?: boolean;
  transcriptionEnabled?: boolean;
  voicemailGreetingUrl?: string;
  audioInputDeviceId?: string;
  audioOutputDeviceId?: string;
}

export interface WebRtcCredentials {
  wsUrl: string;
  sipExtension: string;
  sipPassword?: string;
  sipRealm: string;
  iceServers?: RTCIceServer[];
}

export interface PhoneDataSource {
  getCredentials(): Promise<WebRtcCredentials>;
  listCalls(): Promise<CallRecord[]>;
  logCall(call: Omit<CallRecord, "id" | "time">): Promise<CallRecord>;
  listThreads(): Promise<MessageThread[]>;
  getThreadMessages(contactNumber: string): Promise<MessageRecord[]>;
  sendMessage(to: string, text: string, mediaUrls?: string[]): Promise<MessageRecord>;
  listVoicemails(): Promise<VoicemailRecord[]>;
  setVoicemailGreeting(audioFile: File | Blob): Promise<void>;
  listContacts(): Promise<PhoneContact[]>;
  searchContacts(query: string): Promise<PhoneContact[]>;
  upsertContact(contact: Omit<PhoneContact, "id"> & { id?: string }): Promise<PhoneContact>;
  getAgentConfig(): Promise<PhoneAgentConfig>;
  setAgentConfig(config: Partial<PhoneAgentConfig>): Promise<void>;
  getSettings(): Promise<PhoneSettings>;
  setSettings(settings: Partial<PhoneSettings>): Promise<void>;
}

export type PhoneDrawerTab =
  | "dialer"
  | "calls"
  | "messages"
  | "contacts"
  | "agents"
  | "settings";
