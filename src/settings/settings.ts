import ObsidianToNtfyReminders from "main";
import { App, PluginSettingTab, Setting, normalizePath } from "obsidian";
import { MultiSuggest } from "settings/MultiSuggest";

export interface ObsidianToNtfyRemindersSettings {
  defaultFolder: string;
  dateFormat: string;
  frontmatterDateKey: string;
  frontmatterRemindMeKey: string;
  sendReminderToExternalApi: boolean;
  apiEndpoint: string;
  ntfyTopic: string;
  additionalHeaders: string;
}

export const DEFAULT_SETTINGS: ObsidianToNtfyRemindersSettings = {
  defaultFolder: "/",
  dateFormat: "YYYY-MM-DD",
  frontmatterDateKey: "Date",
  frontmatterRemindMeKey: "RemindMe",
  sendReminderToExternalApi: false,
  apiEndpoint: "https://example.com/notifyme",
  ntfyTopic: "sample-topic",
  additionalHeaders: "",
};

export class ObsidianToNtfyRemindersSettingsTab extends PluginSettingTab {
  plugin: ObsidianToNtfyReminders;

  constructor(app: App, plugin: ObsidianToNtfyReminders) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();

    new Setting(containerEl)
      .setName("Source folder location")
      .setDesc("Select the folder from which notifications will be sourced.")
      .addSearch((cb) => {
        new MultiSuggest(this.app, cb.inputEl);
        cb.setPlaceholder("Example: folder1/folder2")
          .setValue(this.plugin.settings.defaultFolder)
          .onChange((new_folder) => {
            this.plugin.settings.defaultFolder = normalizePath(new_folder);
            this.plugin.saveSettings().catch((e: string) => {
              console.error(e);
            });
          });
      });

    new Setting(containerEl)
      .setName("YAML keys date format.")
      .setDesc("Set the date format you are using for the event date")
      .addText((text) => {
        text
          // eslint-disable-next-line obsidianmd/ui/sentence-case
          .setPlaceholder("Example: YYYY-MM-DD")
          .setValue(this.plugin.settings.dateFormat)
          .onChange((newValue) => {
            this.plugin.settings.dateFormat = newValue;
            this.plugin.saveSettings().catch((e: string) => {
              console.error(e);
            });
          });
      });

    new Setting(containerEl)
      .setName("Event date YAML key")
      .setDesc("Set the YAML key for the event date.")
      .addText((text) => {
        text
          .setValue(this.plugin.settings.frontmatterDateKey)
          .onChange((newValue) => {
            this.plugin.settings.frontmatterDateKey = newValue;
            this.plugin.saveSettings().catch((e: string) => {
              console.error(e);
            });
          });
      });

    new Setting(containerEl)
      .setName("Event remind me YAML key")
      .setDesc(
        "Set the YAML key for the event's checkbox propery you want the plugin to react to, to setup a reminder",
      )
      .addText((text) => {
        text
          .setValue(this.plugin.settings.frontmatterRemindMeKey)
          .onChange((newValue) => {
            this.plugin.settings.frontmatterRemindMeKey = newValue;
            this.plugin.saveSettings().catch((e: string) => {
              console.error(e);
            });
          });
      });

    new Setting(containerEl)
      .setName("Send reminders to external API ?")
      .setDesc(
        "Use this if you want to use an external service to handle notifications (such as ntfy.sh). \n \
				This will just send the reminder informations to the configured URL, you'll probably need to run your own middleware to transform the data (and handle delays, deduplications etc...) before activating this option.",
      )
      .addToggle((value) => {
        value
          .setValue(this.plugin.settings.sendReminderToExternalApi)
          .onChange((newValue) => {
            this.plugin.settings.sendReminderToExternalApi = newValue;
            this.plugin.saveSettings().catch((e: string) => {
              console.error(e);
            });
          });
      });

    new Setting(containerEl)
      .setName("API URL")
      .setDesc(
        "Set the API endpoint you want to call when creating a reminder.",
      )
      .addText((text) => {
        text.setValue(this.plugin.settings.apiEndpoint).onChange((newValue) => {
          this.plugin.settings.apiEndpoint = newValue;
          this.plugin.saveSettings().catch((e: string) => {
            console.error(e);
          });
        });
      });

    new Setting(containerEl)
      .setName("Ntfy target topic name")
      .setDesc(
        "Enter here the name of the topic you want to publish your reminder to.",
      )
      .addText((text) => {
        text.setValue(this.plugin.settings.ntfyTopic).onChange((newValue) => {
          this.plugin.settings.ntfyTopic = newValue;
          this.plugin.saveSettings().catch((e: string) => {
            console.error(e);
          });
        });
      });

    new Setting(containerEl)
      .setName("Additional headers")
      .setDesc(
        "Add here any additional headers you would like to send along the API call.",
      )
      .addTextArea((text) => {
        text
          .setValue(this.plugin.settings.additionalHeaders)
          .onChange((newValue) => {
            this.plugin.settings.additionalHeaders = newValue;
            this.plugin.saveSettings().catch((e: string) => {
              console.error(e);
            });
          });
      });
  }
}
