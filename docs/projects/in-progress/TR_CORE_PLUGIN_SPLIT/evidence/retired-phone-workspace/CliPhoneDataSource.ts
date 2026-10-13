import { runPluginCommand } from "../../../../api/plugins";
import type {
  CallRecord,
  MessageRecord,
  MessageThread,
  PhoneAgentConfig,
  PhoneContact,
  PhoneDataSource,
  PhoneSettings,
  VoicemailRecord,
  WebRtcCredentials,
} from "./types";

/**
 * Host-backed CliPhoneDataSource for the Total Recall slide-out drawer workspace.
 * Routes all phone operations directly through plugin CLI execution.
 */
export class CliPhoneDataSource implements PhoneDataSource {
  private pluginId: string;

  constructor(pluginId = "phone") {
    this.pluginId = pluginId;
  }

  private async execJson<T>(subcommand: string, args: string[] = []): Promise<T> {
    const res = await runPluginCommand(this.pluginId, subcommand, [...args, "--json"]);
    if (!res.success) {
      throw new Error(`Command '${subcommand}' failed: ${res.error || res.output || "Unknown error"}`);
    }
    try {
      return JSON.parse(res.output || "{}") as T;
    } catch {
      throw new Error(`Command '${subcommand}' output invalid JSON: ${res.output}`);
    }
  }

  async getCredentials(): Promise<WebRtcCredentials> {
    const raw = await this.execJson<{
      wsUrl?: string;
      extension?: string;
      sipExtension?: string;
      password?: string;
      sipPassword?: string;
      realm?: string;
      sipRealm?: string;
      iceServers?: RTCIceServer[];
    }>("session");

    return {
      wsUrl: raw.wsUrl || `wss://${window.location.hostname}:8089/ws`,
      sipExtension: raw.sipExtension || raw.extension || "101",
      sipPassword: raw.sipPassword || raw.password,
      sipRealm: raw.sipRealm || raw.realm || window.location.hostname,
      iceServers: raw.iceServers,
    };
  }

  async listCalls(): Promise<CallRecord[]> {
    const res = await this.execJson<{ calls?: CallRecord[] } | CallRecord[]>("call", ["list"]);
    return Array.isArray(res) ? res : res.calls || [];
  }

  async logCall(call: Omit<CallRecord, "id" | "time">): Promise<CallRecord> {
    return this.execJson<CallRecord>("call", ["log", "--data", JSON.stringify(call)]);
  }

  async listThreads(): Promise<MessageThread[]> {
    const res = await this.execJson<{ threads?: MessageThread[] } | MessageThread[]>("message", ["threads"]);
    return Array.isArray(res) ? res : res.threads || [];
  }

  async getThreadMessages(contactNumber: string): Promise<MessageRecord[]> {
    const res = await this.execJson<{ messages?: MessageRecord[] } | MessageRecord[]>("message", ["thread", contactNumber]);
    return Array.isArray(res) ? res : res.messages || [];
  }

  async sendMessage(to: string, text: string, mediaUrls: string[] = []): Promise<MessageRecord> {
    const args = ["send", "--to", to, "--text", text];
    if (mediaUrls.length > 0) {
      args.push("--media", mediaUrls.join(","));
    }
    return this.execJson<MessageRecord>("message", args);
  }

  async listVoicemails(): Promise<VoicemailRecord[]> {
    const res = await this.execJson<{ voicemails?: VoicemailRecord[] } | VoicemailRecord[]>("voicemail", ["list"]);
    return Array.isArray(res) ? res : res.voicemails || [];
  }

  async setVoicemailGreeting(audioFile: File | Blob): Promise<void> {
    const buffer = await audioFile.arrayBuffer();
    const base64 = btoa(
      new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
    );
    await this.execJson<{ ok: boolean }>("voicemail", ["greeting", "--base64", base64]);
  }

  async listContacts(): Promise<PhoneContact[]> {
    const res = await this.execJson<{ contacts?: PhoneContact[] } | PhoneContact[]>("contact", ["list"]);
    return Array.isArray(res) ? res : res.contacts || [];
  }

  async searchContacts(query: string): Promise<PhoneContact[]> {
    const res = await this.execJson<{ contacts?: PhoneContact[] } | PhoneContact[]>("contact", ["search", query]);
    return Array.isArray(res) ? res : res.contacts || [];
  }

  async upsertContact(contact: Omit<PhoneContact, "id"> & { id?: string }): Promise<PhoneContact> {
    return this.execJson<PhoneContact>("contact", ["upsert", "--data", JSON.stringify(contact)]);
  }

  async getAgentConfig(): Promise<PhoneAgentConfig> {
    return this.execJson<PhoneAgentConfig>("agent", ["get"]);
  }

  async setAgentConfig(config: Partial<PhoneAgentConfig>): Promise<void> {
    await this.execJson<{ ok: boolean }>("agent", ["set", "--data", JSON.stringify(config)]);
  }

  async getSettings(): Promise<PhoneSettings> {
    return this.execJson<PhoneSettings>("settings", ["get"]);
  }

  async setSettings(settings: Partial<PhoneSettings>): Promise<void> {
    await this.execJson<{ ok: boolean }>("settings", ["set", "--data", JSON.stringify(settings)]);
  }
}
