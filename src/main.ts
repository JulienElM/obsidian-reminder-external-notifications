import {
  App,
  Plugin,
  Notice,
  TFile,
  CachedMetadata,
  FuzzySuggestModal,
} from "obsidian";

import {
  DEFAULT_SETTINGS,
  ObsidianNotificationsSelfhostedSettings,
  ONSSettingTab,
} from "./settings/settings";
import { ReminderService } from "ReminderService";

interface DelayEntry {
  delay: string;
  label: string;
}

const DelayEntries: DelayEntry[] = [
  {
    delay: "-0",
    label: "On day of event (9:00 AM)",
  },
  {
    delay: "-1",
    label: "1 day before (9:00 AM)",
  },
  {
    delay: "-2",
    label: "2 days before (9:00 AM)",
  },
  {
    delay: "-3",
    label: "3 days before (9:00 AM)",
  },
];

export default class ObsidianNotificationsSelfhosted extends Plugin {
  settings: ObsidianNotificationsSelfhostedSettings;
  private remindState = new Map<string, boolean>();
  private reminderService: ReminderService;
  private processingReminder = new Set<string>();

  async onload() {
    await this.loadSettings();
    this.reminderService = new ReminderService(this.app, this.settings);

    // Clear remindState on file deletion
    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        if (file instanceof TFile) {
          this.remindState.delete(file.path);
        }
      }),
    );

    // Handle cleanup for renamed files
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        const state = this.remindState.get(oldPath);
        if (state !== undefined) {
          this.remindState.delete(oldPath);
          this.remindState.set(file.path, state);
        }
      }),
    );

    //Load current open file metadata (metadata.on-changed event doesn't trigger at launch or file open)
    this.registerEvent(
      this.app.workspace.on("file-open", (file: TFile) => {
        const cache = this.app.metadataCache.getFileCache(file);
        //Verify frontmatter contains data
        if (!cache) return;
        const remindMe = this.getFrontMatterRemindMe(file, cache);
        if (!remindMe) return;

        const current = remindMe === true;
        const previous = this.remindState.get(file.path);

        if (previous === undefined) {
          this.remindState.set(file.path, current);
          return;
        }
      }),
    );

    // Handle reminder scheduling and canceling when RemindMe is toggled
    this.registerEvent(
      this.app.metadataCache.on(
        "changed",
        async (file: TFile, data: string, cache: CachedMetadata) => {
          await this.handleMetadataChange(file, cache);
        },
      ),
    );

    this.addSettingTab(new ONSSettingTab(this.app, this));
  }

  onunload() {}

  private getFrontMatterRemindMe(
    file: TFile,
    cache: CachedMetadata,
  ): boolean | null {
    //Verify file is an .md file
    if (!(file instanceof TFile) || file.extension !== "md") return null;

    //Verify file is in user defined folder from settings
    if (!file.path?.includes(this.settings.defaultFolder)) return null;

    //Verify frontmatter contains data
    if (!cache.frontmatter) return null;

    //Verify remindMe checkbox exists
    const remindMe: unknown =
      cache.frontmatter[this.settings.frontmatterRemindMeKey];
    if (remindMe === null || typeof remindMe !== "boolean") {
      return null;
    }

    return remindMe;
  }

  private async handleMetadataChange(
    file: TFile,
    cache: CachedMetadata,
  ): Promise<void> {
    const remindMe = this.getFrontMatterRemindMe(file, cache);
    if (remindMe === null) return;

    // Debounce if already handling this reminder
    if (this.processingReminder.has(file.path)) {
      return;
    }

    const current = remindMe === true;
    const previous = this.remindState.get(file.path);

    this.remindState.set(file.path, current);

    //Handle remindMe toggle
    if (!previous && current) {
      await this.scheduleReminder(file, cache);
    } else if (previous && !current) {
      await this.cancelReminder(file);
    }
  }

  private async scheduleReminder(
    file: TFile,
    cache: CachedMetadata,
  ): Promise<void> {
    if (!cache.frontmatter) return;
    this.processingReminder.add(file.path);

    try {
      const eventDate = this.reminderService.getEventDate(cache.frontmatter);
      if (!eventDate) {
        new Notice(
          `File ${file.basename} is missing a valid "${this.settings.frontmatterDateKey}" field \
					(based on the key that was defined in settings).`,
        );
        await this.reminderService.uncheckReminder(file);
        return;
      }
      const modal = new RemindDateSelectorSuggest(this.app);
      const selectedDelay = await modal.openAndWait();

      if (selectedDelay === null) {
        return;
      }

      const remindDate = this.reminderService.calculateRemindDate(
        eventDate,
        selectedDelay,
      );
      const success = await this.reminderService.setRemindDate(
        file,
        remindDate,
      );

      if (success) {
        const reminderInfo = this.reminderService.createReminderInfo(
          file,
          eventDate,
          remindDate,
        );
        await this.reminderService.notifyExternalApi(reminderInfo);
      }
    } catch (error) {
      console.error("Failed to schedule reminder: ", error);
      new Notice("Failed to schedule reminder.");
    } finally {
      this.processingReminder.delete(file.path);
    }
  }

  private async cancelReminder(file: TFile): Promise<void> {
    await this.reminderService.clearRemindDate(file);
  }

  async loadSettings() {
    this.settings = Object.assign(
      {},
      DEFAULT_SETTINGS,
      (await this.loadData()) as Partial<ObsidianNotificationsSelfhostedSettings>,
    );
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class RemindDateSelectorSuggest extends FuzzySuggestModal<DelayEntry> {
  private resolvePromise: (value: DelayEntry | null) => void;
  private promise: Promise<DelayEntry | null>;
  private chosenItem: DelayEntry | null = null;
  constructor(app: App) {
    super(app);
    this.promise = new Promise((resolve) => {
      //Store resolve for later (when user chooses item or cancels)
      this.resolvePromise = resolve;
    });
  }

  getItems(): DelayEntry[] {
    return DelayEntries;
  }

  getItemText(item: DelayEntry): string {
    return item.label;
  }
  //TODO issue with handling promise resolution -> onClose is called before onChooseItem
  onChooseItem(item: DelayEntry, evt: MouseEvent | KeyboardEvent): void {
    this.chosenItem = item;
  }

  /**
   * queueMicrotask queues a microtask to be executed at a safe time prior to control returning to the browser's event loop.
   * It runs after the current task but before the next event loop tick.
   *
   * Execution order:
   * 1. onClose() runs
   * 2. onClose() completes
   * 3. onChooseItem() runs (if item was selected)
   * 4. Microtask queued runs (promise is resolved)
   */
  onClose(): void {
    queueMicrotask(() => {
      this.resolvePromise(this.chosenItem);
    });
  }

  async openAndWait(): Promise<DelayEntry | null> {
    this.open();
    return this.promise;
  }
}
