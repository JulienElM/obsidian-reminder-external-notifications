import { ObsidianToNtfyRemindersSettings } from "settings/settings";
import {
  App,
  TFile,
  FrontMatterCache,
  Notice,
  moment,
  requestUrl,
} from "obsidian";
import { Md5 } from "ts-md5";

const FRONTMATTER_REMIND_DATE_KEY = "RemindDate";

export interface NtfyApiError {
  code?: number;
  http?: number;
  error?: string;
  link?: string;
}

export interface NtfyApiSuccess {
  id: string;
  time: number;
  expires: number;
  event: string;
  topic: string;
  title: string;
  message: string;
  tags: string[];
  click: string;
}

export type NtfyApiResponse = NtfyApiSuccess | NtfyApiError;

export interface ReminderInfo {
  eventDate: string;
  remindDate: string;
  fileName: string;
  filePath: string;
  fileURI: string;
}

export interface ReminderDelay {
  delay: string;
  label: string;
}

export class ReminderService {
  constructor(
    private app: App,
    private settings: ObsidianToNtfyRemindersSettings,
  ) {}

  /**
   * Validates and extracts the event date from frontmatter
   * @returns ISO date string or null if invalid
   */
  getEventDate(frontmatter: FrontMatterCache): string | null {
    const dateValue: unknown = frontmatter[this.settings.frontmatterDateKey];
    if (!dateValue || typeof dateValue !== "string") {
      return null;
    }

    const parsed = moment(dateValue);
    if (!parsed.isValid()) {
      console.error(`Invalid date format: ${dateValue}`);
      return null;
    }

    return dateValue;
  }

  /**
   * Calculates reminder date based on event date and selected delay
   * @returns ISO date string
   */
  calculateRemindDate(eventDate: string, reminderDelay: ReminderDelay) {
    return moment(eventDate)
      .add(reminderDelay.delay, "day")
      .set("hour", 9)
      .startOf("hour")
      .toISOString(true);
  }

  /**
   * Generates the Obsidian URI for the given file
   * @returns Obsidian URI string (obsidian://open?...)
   */
  generateObsidianURI(file: TFile): string {
    const vaultName = encodeURIComponent(this.app.vault.getName());
    const filePath = encodeURIComponent(file.path);
    return `obsidian://open?vault=${vaultName}&file=${filePath}`;
  }

  /**
   * Creates reminder info object from files and dates
   * @returns ReminderInfo object
   */
  createReminderInfo(
    file: TFile,
    eventDate: string,
    remindDate: string,
  ): ReminderInfo {
    return {
      eventDate,
      remindDate,
      fileName: file.basename,
      filePath: file.path,
      fileURI: this.generateObsidianURI(file),
    };
  }

  /**
   * Validates user defined API endpoints from plugin settings
   * @returns boolean isValid
   */
  private validateApiEndpoint(): boolean {
    if (!this.settings.apiEndpoint) {
      return false;
    }

    try {
      new URL(this.settings.apiEndpoint);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Parses user defined custom headers from plugin settings
   * @returns Record<string, string> Record of parsed headers
   */
  private parseHeaderValues(customHeaders: string): Record<string, string> {
    const headers: Record<string, string> = {};
    const lines = customHeaders.split("\n");
    for (const line of lines) {
      const [key, value] = line.split(":", 2).map((e) => e.trim());
      if (key && value) {
        headers[key] = value;
      }
    }
    return headers;
  }

  /**
   * Sends reminder to external API
   * @param reminderInfo - reminder information
   * @returns boolean success
   */
  async notifyExternalApi(reminderInfo: ReminderInfo): Promise<boolean> {
    if (!this.settings.sendReminderToExternalApi) {
      return false;
    }

    if (!this.validateApiEndpoint()) {
      new Notice("Cannot send reminder info, invalid API endpoint configured.");
      return false;
    }

    try {
      const hash = Md5.hashStr(reminderInfo.fileURI + reminderInfo.eventDate);
      const response = await requestUrl({
        url: this.settings.apiEndpoint,
        method: "POST",
        contentType: "application/json",
        headers: this.parseHeaderValues(this.settings.additionalHeaders),
        body: JSON.stringify({
          topic: "obsidian-calendar-reminder",
          message: `Happening on ${moment(reminderInfo.eventDate).format("ddd DD [at] H:mm")}`,
          title: `Reminder : ${reminderInfo.fileName}`,
          tags: ["alarm_clock"],
          click: reminderInfo.fileURI,
          delay: moment(reminderInfo.remindDate).valueOf(),
          reminderInfo: {
            event_date: reminderInfo.eventDate,
            remind_date: reminderInfo.remindDate,
            file_title: reminderInfo.fileName,
            hash,
          },
        }),
      });

      if (response.status >= 200 && response.status < 300) {
        return true;
      } else {
        console.error(`API returned status ${response.status}`, response.json);
        new Notice(
          "Failed to send reminder to external API. Check console for more details.",
        );
        return false;
      }
    } catch (error: unknown) {
      console.error("Failed to connect to external API: ", error);
      new Notice("Failed to connect to external API : network error.");
      return false;
    }
  }

  isNtfyApiError(data: object): data is NtfyApiError {
    return (
      Object.keys(data).contains("code") && Object.keys(data).contains("error")
    );
  }

  isNtfyApiSuccess(data: object): data is NtfyApiSuccess {
    return (
      Object.keys(data).contains("id") && Object.keys(data).contains("time")
    );
  }

  /**
   * Updates frontmatter with reminder date
   * @param file TFile
   * @param remindDate string
   * @returns boolean Success
   */
  async setRemindDate(file: TFile, remindDate: string): Promise<boolean> {
    try {
      await this.app.fileManager.processFrontMatter(
        file,
        (frontmatter: FrontMatterCache) => {
          frontmatter[FRONTMATTER_REMIND_DATE_KEY] = remindDate;
        },
      );
      return true;
    } catch (error) {
      console.error("Failed to set reminder date: ", error);
      new Notice("Failed to set reminder date.");
      return false;
    }
  }

  /**
   * Removes reminder date from frontmatter
   * @param file TFile
   * @returns boolean
   */
  async clearRemindDate(file: TFile): Promise<boolean> {
    try {
      await this.app.fileManager.processFrontMatter(
        file,
        (frontmatter: FrontMatterCache) => {
          delete frontmatter[FRONTMATTER_REMIND_DATE_KEY];
        },
      );
      return true;
    } catch (error) {
      console.error("Failed to remove reminder date: ", error);
      new Notice("Failed to remove reminder.");
      return false;
    }
  }
  /**
   * Resets remindMe checkbox
   * @param file Tfile
   */
  async uncheckReminder(file: TFile): Promise<void> {
    try {
      await this.app.fileManager.processFrontMatter(
        file,
        (frontmatter: FrontMatterCache) => {
          delete frontmatter[this.settings.frontmatterRemindMeKey];
        },
      );
    } catch (error) {
      console.error("Failed to reset remindMe checkbox: ", error);
      new Notice("Failed to uncheck remind-me checkbox.");
    }
  }
}
