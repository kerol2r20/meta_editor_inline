import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, MarkdownRenderChild, AbstractInputSuggest, TFolder } from 'obsidian';
import type { MarkdownPostProcessorContext } from 'obsidian';
import type { Transform } from 'sucrase';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as ReactDOMClient from 'react-dom/client';
import { transform } from 'sucrase';

// Remember to rename these classes and interfaces!

interface ReactRenderPluginSettings {
    modulePath: string;
}

const DEFAULT_SETTINGS: ReactRenderPluginSettings = {
    modulePath: '',
};

const SYSTEM_MODULES: Record<string, unknown> = {
    'react': React,
    'react-dom': ReactDOM,
};

type AllowedLanguageType = 'js' | 'jsx' | 'ts' | 'tsx';

class FolderSuggest extends AbstractInputSuggest<TFolder> {
    textInputEl: HTMLInputElement;

    constructor(app: App, textInputEl: HTMLInputElement) {
        super(app, textInputEl);
        this.textInputEl = textInputEl;
    }

    getSuggestions(query: string): TFolder[] {
        const folders = this.app.vault
            .getAllLoadedFiles()
            .filter(file => file instanceof TFolder)
            .filter(file => file.path.toLowerCase().includes(query.toLowerCase())) as TFolder[];
        return folders;
    }

    renderSuggestion(folder: TFolder, el: HTMLElement): void {
        el.setText(folder.path === '/' ? 'Vault root (/)' : folder.path);
    }

    selectSuggestion(folder: TFolder): void {
        this.textInputEl.value = folder.path;
        this.textInputEl.trigger('input');
        this.close();
    }
}

class ReactWidget extends MarkdownRenderChild {
    source: string;
    containerEl: HTMLElement;
    ctx: MarkdownPostProcessorContext;
    root: ReturnType<typeof ReactDOMClient.createRoot> | null = null;
    language: AllowedLanguageType;

    constructor(source: string, containerEl: HTMLElement, ctx: MarkdownPostProcessorContext, language: AllowedLanguageType) {
        super(containerEl);
        this.source = source;
        this.containerEl = containerEl;
        this.ctx = ctx;
        this.language = language;
    }

    onload(): void {
        this.renderReact();
    }

    onunload(): void {
        if (this.root) {
            this.root.unmount();
            this.root = null;
        }
    }

    renderReact() {
        const langTransform: Transform[] = [];

        if (this.language === 'jsx' || this.language === 'tsx') {
            langTransform.push('jsx');
        }

        if (this.language === 'ts' || this.language === 'tsx') {
            langTransform.push('typescript');
        }

        const { code } = transform(this.source, {
            transforms: [...langTransform, 'imports'],
            jsxPragma: 'React.createElement',
            jsxFragmentPragma: 'React.Fragment',
        });

        const customRequire = (moduleName: string) => {
            if (moduleName in SYSTEM_MODULES) {
                return SYSTEM_MODULES[moduleName];
            }
            throw new Error(`Module ${moduleName} not found`);
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const customExports: any = {};

        const run = new Function('require', 'exports', 'React', code);
        run(customRequire, customExports, React);

        if (this.language === 'jsx' || this.language === 'tsx') {
            const container = this.containerEl.createDiv();
            this.root = ReactDOMClient.createRoot(container);
            this.root.render(React.createElement(customExports.default));
        }
    }
}

export default class ReactRenderPlugin extends Plugin {
    settings: ReactRenderPluginSettings;

    async onload() {
        await this.loadSettings();

        // This creates an icon in the left ribbon.
        const ribbonIconEl = this.addRibbonIcon('dice', 'Sample Plugin', (_evt: MouseEvent) => {
            // Called when the user clicks the icon.
            new Notice('This is a notice!');
        });
        // Perform additional things with the ribbon
        ribbonIconEl.addClass('my-plugin-ribbon-class');

        // This adds a status bar item to the bottom of the app. Does not work on mobile apps.
        const statusBarItemEl = this.addStatusBarItem();
        statusBarItemEl.setText('Status Bar Text');

        // This adds a simple command that can be triggered anywhere
        this.addCommand({
            id: 'open-sample-modal-simple',
            name: 'Open sample modal (simple)',
            callback: () => {
                new SampleModal(this.app).open();
            },
        });
        // This adds an editor command that can perform some operation on the current editor instance
        this.addCommand({
            id: 'sample-editor-command',
            name: 'Sample editor command',
            editorCallback: (editor: Editor, _view: MarkdownView) => {
                console.log(editor.getSelection());
                editor.replaceSelection('Sample Editor Command');
            },
        });
        // This adds a complex command that can check whether the current state of the app allows execution of the command
        this.addCommand({
            id: 'open-sample-modal-complex',
            name: 'Open sample modal (complex)',
            checkCallback: (checking: boolean) => {
                // Conditions to check
                const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (markdownView) {
                    // If checking is true, we're simply "checking" if the command can be run.
                    // If checking is false, then we want to actually perform the operation.
                    if (!checking) {
                        new SampleModal(this.app).open();
                    }

                    // This command will only show up in Command Palette when the check function returns true
                    return true;
                }
            },
        });

        // This adds a settings tab so the user can configure various aspects of the plugin
        this.addSettingTab(new ReactRenderSettingTab(this.app, this));

        // If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
        // Using this function will automatically remove the event listener when this plugin is disabled.
        // this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
        // 	console.log('click', evt);
        // });

        // When registering intervals, this function will automatically clear the interval when the plugin is disabled.
        // this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));

        this.registerMarkdownCodeBlockProcessor('reactjs', async (source, el, ctx) => {
            const widget = new ReactWidget(source, el, ctx, 'js');
            ctx.addChild(widget);
        });

        this.registerMarkdownCodeBlockProcessor('reactts', async (source, el, ctx) => {
            const widget = new ReactWidget(source, el, ctx, 'ts');
            ctx.addChild(widget);
        });

        this.registerMarkdownCodeBlockProcessor('reactjsx', async (source, el, ctx) => {
            const widget = new ReactWidget(source, el, ctx, 'jsx');
            ctx.addChild(widget);
        });

        this.registerMarkdownCodeBlockProcessor('reacttsx', async (source, el, ctx) => {
            const widget = new ReactWidget(source, el, ctx, 'tsx');
            ctx.addChild(widget);
        });

        this.register(this.registerCodeblockHighlighting());
    }

    registerCodeblockHighlighting(): () => void {
        window.CodeMirror.defineMode('reactjsx', (config) => window.CodeMirror.getMode(config, 'jsx'));

        // Return function is executed on unload
        return () => {
            window.CodeMirror.defineMode('reactjsx', (config) => window.CodeMirror.getMode(config, 'null'));
        };
    }

    onunload() {

    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

class SampleModal extends Modal {
    constructor(app: App) {
        super(app);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.setText('Woah!');
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

class ReactRenderSettingTab extends PluginSettingTab {
    plugin: ReactRenderPlugin;

    constructor(app: App, plugin: ReactRenderPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        new Setting(containerEl)
            .setName('Module Path')
            .setDesc('Path to the React component module')
            .addText(text => {
                text
                    .setPlaceholder('Enter module path')
                    .setValue(this.plugin.settings.modulePath)
                    .onChange(async (value) => {
                        this.plugin.settings.modulePath = value;
                        await this.plugin.saveSettings();
                    })
                new FolderSuggest(this.app, text.inputEl);
            });
    }
}
