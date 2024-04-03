import { autoinject } from 'aurelia-framework';
import { Router } from 'aurelia-router';
import {SettingsService} from '../Setting-Service';

@autoinject()
export class PresetPage {
    presets: Array<{name: string, description: string, settings: any}> = [];
    defaultPresets: Array<{name: string, description: string, video: string, settings: any}> = [];
    public activeTab: string = 'presets';
    settings: any;

    constructor(private router: Router, private settingsService: SettingsService) {}


    public get isLoadFromFile(): boolean {
        return this.activeTab === 'load-file';
    }

    attached() {
        this.loadDefaultPresets();
        this.loadPresetsFromLocalStorage();
    }

    public async loadDefaultPresets(): Promise<void> {
        try {
            let response = await fetch('../../../assets/defaultPresets.json');
            this.defaultPresets = await response.json();
            console.log('loaded default presets', this.defaultPresets);
        } catch (error) {
            console.error('promise rejected', error)
        }
    }

    public loadPresetsFromLocalStorage(): void {
        console.log("Number of items in localStorage:", localStorage.length);

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            const value = localStorage.getItem(key);
            if (value) {
                const presetData = JSON.parse(value);
                this.presets.push({
                    name: key,
                    description: presetData.description || 'No description provided',
                    settings: presetData.settings
                });
            }
        }
        console.log("Presets array:", this.presets);

    }

    public loadPresetAndNavigate(preset: any): void {
        this.settingsService.settings = preset.settings; // Update the settings in the service
        this.navigateToConfigurationBuilder();
    }

    public showTab(tabId: string): void {
        console.log("Is Your Presets Active?", this.isYourPresetsActive);

        this.activeTab = tabId;
    }

    public get isPresetsActive(): boolean {
        return this.activeTab === 'presets';
    }

    public get isYourPresetsActive(): boolean {
        return this.activeTab === 'your-presets';
    }

    public get (): boolean {
        return this.activeTab === 'load-file';
    }

    public deletePreset(presetName: string): void {
        // Remove the preset from local storage
        localStorage.removeItem(presetName);

        // Remove the preset from the presets array
        this.presets = this.presets.filter(p => p.name !== presetName);
    }
    public handleFileUpload(event: any): void {
        const file = event.target.files[0];
        if (!file) {
            console.error("No file chosen");
            return;
        }

        const reader = new FileReader();

        reader.onload = (loadEvent: any) => {
            try {
                const parsedData = JSON.parse(loadEvent.target.result as string);
                if (parsedData && parsedData.player && parsedData.player.tint === undefined) {
                    parsedData.player.tint = "#FFFFFF";
                }

                if (parsedData) {
                    this.settingsService.settings = parsedData; // Update the settings in the service without checking for a `settings` property since the file directly contains the settings
                    this.navigateToConfigurationBuilder();  // Method to navigate to configuration builder
                } else {
                    console.error("Invalid file format");
                }
            } catch (error) {
                console.error("Error parsing the file", error);
            }
        };

        reader.readAsText(file);
    }
    public navigateToConfigurationBuilder(): void {
        this.router.navigate('home');
    }




}
