import { AbstractInputSuggest, App } from "obsidian";

export class MultiSuggest extends AbstractInputSuggest<string> {
  folders: string[];
  constructor(
    app: App,
    private inputEl: HTMLInputElement,
  ) {
    super(app, inputEl);
    this.folders = ["/"].concat(
      this.app.vault.getAllFolders().map((folder) => folder.path),
    );
  }

  getSuggestions(inputStr: string): string[] {
    const lowerCaseInputStr = inputStr.toLocaleLowerCase();
    return [...this.folders].filter((folder) =>
      folder.toLocaleLowerCase().contains(lowerCaseInputStr),
    );
  }

  renderSuggestion(content: string, el: HTMLElement): void {
    el.setText(content);
  }

  selectSuggestion(folder: string, evt: MouseEvent | KeyboardEvent): void {
    this.inputEl.value = folder;
    this.close();
  }
}
