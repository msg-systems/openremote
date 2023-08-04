import manager, { Util } from "@openremote/core";
import {Asset, Attribute, AttributeRef, DashboardWidget, ValueDatapoint, AssetDatapointQueryUnion, AssetQueryMatch } from "@openremote/model";
import { showSnackbar } from "@openremote/or-mwc-components/or-mwc-snackbar";
import { i18next } from "@openremote/or-translate";
import { html, LitElement, TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {OrWidgetConfig, OrWidgetEntity} from "./or-base-widget";
import {style} from "../style";
import {SettingsPanelType, widgetSettingsStyling} from "../or-dashboard-settingspanel";
import {InputType, OrInputChangedEvent } from "@openremote/or-mwc-components/or-mwc-input";

import {OrMwcTableRowClickEvent, TableColumn, TableRow} from "@openremote/or-mwc-components/or-mwc-table";
import {GenericAxiosResponse} from "@openremote/rest";
import moment from "moment";

export interface WarnWidgetConfig extends OrWidgetConfig {
    displayName: string;
    attributeRefs: AttributeRef[];
    thresholds: [number, string][];
    valueType: string;
    checkIrregular: boolean;
    checkIrregularDuration: number;
    checkIrregularFactor: number;
}

type IrregularStatus = {
    hasData: boolean;
    isIrregular: boolean;
    minInterval: number;
    maxInterval: number;
}

export class OrWarnWidget implements OrWidgetEntity {

    readonly DISPLAY_MDI_ICON: string = "alert-circle";
    readonly DISPLAY_NAME: string = "WARN";
    readonly MIN_COLUMN_WIDTH: number = 2;
    readonly MIN_PIXEL_HEIGHT: number = 0;
    readonly MIN_PIXEL_WIDTH: number = 0;

    getDefaultConfig(widget: DashboardWidget): OrWidgetConfig {
        return {
            displayName: widget.displayName,
            attributeRefs: [],
            thresholds: [[0, "#4caf50"],[15, "#ff9800"],[90, "#ef5350"]], // colors from https://mui.com/material-ui/customization/palette/ as reference (since material has no official colors)
            valueType: 'number',
            checkIrregular: true,
            checkIrregularDuration: 24,
            checkIrregularFactor: 2
        } as WarnWidgetConfig;
    }

    // Triggered every update to double check if the specification.
    // It will merge missing values, or you can add custom logic to process here.
    verifyConfigSpec(widget: DashboardWidget): WarnWidgetConfig {
        return Util.mergeObjects(this.getDefaultConfig(widget), widget.widgetConfig, false) as WarnWidgetConfig;
    }


    getSettingsHTML(widget: DashboardWidget, realm: string) {
        return html`<or-warn-widgetsettings .widget="${widget}" realm="${realm}"></or-warn-widgetsettings>`;
    }

    getWidgetHTML(widget: DashboardWidget, editMode: boolean, realm: string) {
        return html`<or-warn-widget .widget="${widget}" .editMode="${editMode}" realm="${realm}" style="height: 100%; overflow: hidden;"></or-warn-widget>`;
    }

}

@customElement("or-warn-widget")
export class OrWarnWidgetContent extends LitElement {

    @property({
        hasChanged(newVal: DashboardWidget, oldVal: DashboardWidget) {
            return JSON.stringify(newVal) !== JSON.stringify(oldVal);
        }
    })
    public readonly widget?: DashboardWidget;

    @property()
    public editMode?: boolean;

    @property()
    public realm?: string;

    private loaded: boolean = false;

    @state()
    private loadedAssets: Asset[] = [];

    @state()
    private assetStatusIrregular: Map<string, IrregularStatus> = new Map();  // assetId -> IrregularStatus(hasData, isIrregular, minInterval, maxInterval)

    willUpdate(changedProperties: Map<string, any>) {
        if(changedProperties.has("widget") || changedProperties.has("editMode")) {
            // this.widget.widgetConfig is loaded / has changed. Start fetching assets
            this.fetchAssets(this.widget?.widgetConfig).then((done: boolean) => {
                this.loaded = done;
                if(done) {
                    this.fetchAssetIrregularStatuses(this.widget?.widgetConfig);
                }
            });
        }

    }

    render() {
        console.log("render at " + moment().toDate().getTime());
        if (!this.loaded) {
            return html`<span>${i18next.t('loading')}</span>`;
        }

        let userTableColumns: TableColumn[];
        if(this.widget?.widgetConfig.checkIrregular) {
            // Content of Table
             userTableColumns = [
                {title: 'Name'},
                {title: 'Letztes Update vor'},
                {title: 'Regelmäßiges Senden (letzte '+this.widget?.widgetConfig.checkIrregularDuration+'h)'}
            ];
        } else {
            // Content of Table
            userTableColumns = [
                {title: 'Name'},
                {title: 'Letztes Update vor'}
            ];
        }

        let sortedThresholds = this.widget?.widgetConfig.thresholds.sort((a : [number, string], b : [number, string]) => {
            return a[0] - b[0]  // sort ascending
        });

        let tableData: any = this.loadedAssets.map((asset) => {
            let attributeName : any = this.widget?.widgetConfig.attributeRefs[0].name;
            let currentTimestamp : any = moment().toDate().getTime()
            let attributeTimestamp : any = asset.attributes ? (asset.attributes[attributeName] ? asset.attributes[attributeName].timestamp : currentTimestamp) : currentTimestamp;

            let timeSinceLastUpdate : any = Math.floor((currentTimestamp - attributeTimestamp) / (1000 * 60));

            let color : any = "#FF0000";
            sortedThresholds.forEach((pair : [number, string]) => {
                if(timeSinceLastUpdate >= pair[0]) {
                    color = pair[1];
                }
            });

            let coloredBox : any = html`<span style="background-color:${color}; border-radius:50%; aspect-ratio:1/1; height:60%; display:inline-block"></span>`;

            if(!this.widget?.widgetConfig.checkIrregular) {
                return {
                    name: asset.name,
                    circleUpdateStatus: coloredBox,
                    timeSinceLastUpdate: timeSinceLastUpdate
                }
            }

            let isIrregularHtml: any;
            let irregularHasData: boolean = false;
            let isIrregular: boolean;
            let irregularMinInterval: number = 0;
            let irregularMaxInterval: number = 0;
            let irregularText = html``;
            if(this.assetStatusIrregular.has(asset.id as string)) {
                let irregularStatus: IrregularStatus = this.assetStatusIrregular.get(asset.id as string) as IrregularStatus;
                if(irregularStatus.isIrregular) {
                    isIrregular = true;
                    isIrregularHtml = html`<or-icon icon="alert" style="color:#ef5350"></or-icon>`;
                } else {
                    isIrregular = false;
                    isIrregularHtml = html`<or-icon icon="clock-check-outline" style="color:#4caf50"></or-icon>`;
                }
                irregularHasData = irregularStatus.hasData;
                irregularMinInterval = irregularStatus.minInterval;
                irregularMaxInterval = irregularStatus.maxInterval;
                irregularText = irregularStatus.hasData ? html`alle ${Math.floor(irregularStatus.minInterval / (1000*60))} - ${Math.floor(irregularStatus.maxInterval / (1000*60))} min` : html`keine Daten`;
            } else {
                isIrregular = false;
                isIrregularHtml = html`<span>${i18next.t('loading')}</span>`;
            }


            return {
                name: asset.name,
                circleUpdateStatus: coloredBox,
                timeSinceLastUpdate: timeSinceLastUpdate,
                circleIrregularStatus: isIrregularHtml,
                isIrregular: isIrregular,
                irregularHasData: irregularHasData,
                irregularMinInterval: irregularMinInterval,
                irregularMaxInterval: irregularMaxInterval,
                irregularText: irregularText
            }
        }).sort((a : any, b : any) => {

            if(a.timeSinceLastUpdate && b.timeSinceLastUpdate && a.isIrregular === undefined && b.isIrregular === undefined) {
                // in case of widgetConfig.checkIrregular is false
                return (b.timeSinceLastUpdate as number) - (a.timeSinceLastUpdate as number);
            }

            if(a.isIrregular === undefined || b.isIrregular === undefined || a.timeSinceLastUpdate === undefined || b.timeSinceLastUpdate === undefined) {
                return 0;
            }
            if (a.isIrregular && !b.isIrregular) {
                // a should be first
                return -1;
            }
            if (!a.isIrregular && b.isIrregular) {
                // b should be first
                return 1;
            }
            return b.timeSinceLastUpdate - a.timeSinceLastUpdate;
        });


        let rows: TableRow[] = tableData.map((asset: any) => {
            let cell = html`<span>${asset.circleUpdateStatus}<span style="padding-left:0.5em">${asset.timeSinceLastUpdate} min</span></span>`;
            if(this.widget?.widgetConfig.checkIrregular) {
                let cellIrregular = html`<span>${asset.circleIrregularStatus}<span style="padding-left:0.5em">${asset.irregularText}</span></span>`;

                return {
                    content: [asset.name, cell, cellIrregular] as string[],
                    clickable: false
                }
            } else {
                return {
                    content: [asset.name, cell] as string[],
                    clickable: false
                }
            }
        });


        // Table Configuration
        const config = {
            columnFilter: [],
            stickyFirstColumn: false,
            pagination: {
                enable: true
            }
        }

        let columns = userTableColumns;

        return html`
            <or-mwc-table .columns="${columns instanceof Array ? columns : undefined}"
                                    .columnsTemplate="${!(columns instanceof Array) ? columns : undefined}"
                                    .rows="${rows instanceof Array ? rows : undefined}"
                                    .rowsTemplate="${!(rows instanceof Array) ? rows : undefined}"
                                    .paginationSizePresets="${[3,5,10,20]}"
                                    .paginationSize="${5}"
                                    .config="${config}">
            </or-mwc-table>
          `

    }


    async fetchAssets(config: OrWidgetConfig): Promise<boolean> {
        let selectedAssets: Asset[] = await this.fetchSelectedAssets(config);

        if(selectedAssets.length != 0) {
            // use selectedAssets to fetchAllAssetsOfType -> loadedAssets
            let loadedAssets: Asset[] = await this.fetchAllAssetsOfType(config, selectedAssets);
            this.loadedAssets = loadedAssets;
        } else {
            this.loadedAssets = [] as Asset[];
        }
        console.log("loaded " + this.loadedAssets.length + " assets");
        this.loaded = true;


        return true;
    }

    async fetchAssetIrregularStatuses(config: OrWidgetConfig | any): Promise<boolean> {
        if(!this.widget?.widgetConfig.checkIrregular) {
            this.assetStatusIrregular = new Map();
            return true;
        }
        if(!config.attributeRefs || config.attributeRefs.length == 0) {
            return true;
        }


        // use loadedAssets to get irregular assets -> assetStatusIrregular
        let attributeName: string = config.attributeRefs[0].name;

        for(let asset of this.loadedAssets) {
            let irregularStatus: IrregularStatus = await this.hasIrregularUpdates(asset.id as string, attributeName, config);
            this.assetStatusIrregular.set(asset.id as string, irregularStatus);
        }

        this.requestUpdate();  // because this.assetStatusIrregular is updated and won't trigger update automatically

        return true;
    }


    async fetchSelectedAssets(config: OrWidgetConfig | any): Promise<Asset[]> {
        if(config.attributeRefs && config.attributeRefs.length > 0) {
            let assets: Asset[] = [];
            await manager.rest.api.AssetResource.queryAssets({
                ids: config.attributeRefs?.map((x: AttributeRef) => x.id) as string[],
                select: {
                    attributes: config.attributeRefs?.map((x: AttributeRef) => x.name) as string[]
                }
            }).then(response => {
                assets = response.data;
            }).catch((reason) => {
                console.error(reason);
                showSnackbar(undefined, i18next.t('errorOccurred'));
            });
            if(assets.length == 0) {
                console.error("No permission to access selected assets");
                showSnackbar(undefined, "No permission to access selected assets");
            }
            return assets;
        } else {
            return [] as Asset[];
        }
    }


    async fetchAllAssetsOfType(config: OrWidgetConfig | any, selectedAssets: Asset[] | any): Promise<Asset[]> {
        if(config.attributeRefs && config.attributeRefs.length > 0) {
            let assets: Asset[] = [];
            console.log("using "+selectedAssets[0].type+" and "+selectedAssets[0].realm);
            await manager.rest.api.AssetResource.queryAssets({
                types: [selectedAssets[0].type],
                realm: {name: selectedAssets[0].realm}
            }).then(response => {
                assets = response.data;
            }).catch((reason) => {
                console.error(reason);
                showSnackbar(undefined, i18next.t('errorOccurred'));
            });
            return assets;
        } else {
            return [] as Asset[];
        }
    }


    async hasIrregularUpdates(assetId:string, attributeName:string, config: OrWidgetConfig | any) : Promise<IrregularStatus> {
        let response: GenericAxiosResponse<ValueDatapoint<any>[]>;
        const datapointQuery : AssetDatapointQueryUnion = {  // query all datapoints from the last config.checkIrregularDuration hours
            type: "all",
            fromTimestamp: moment().subtract(config.checkIrregularDuration, "hours").toDate().getTime(),
            toTimestamp: moment().set('minute', 60).toDate().getTime()
        };

        response = await manager.rest.api.AssetDatapointResource.getDatapoints(assetId, attributeName, datapointQuery)
        if (response.status != 200) {
            console.error("error fetching API");
            return {
                hasData: true,
                isIrregular: false,
                minInterval: 0,
                maxInterval: 0
            } as IrregularStatus;
        }


        let timestamps : number[] = response.data.map((datapoint : ValueDatapoint<number>) => {
            return datapoint.x as number;
        }).sort((a:number, b:number) => {
            return a - b;  // sort ascending
        });

        let timestampDiffs : number[] = [];
        for (let i:number = 0; i<timestamps.length-1; i++) {
            timestampDiffs[i] = timestamps[i+1] - timestamps[i];
        }

        if (timestampDiffs.length == 0) {
            return {
                hasData: false,
                isIrregular: false,
                minInterval: 0,
                maxInterval: 0
            } as IrregularStatus;
        }

        if (timestampDiffs.length < 2) {
            return {
                hasData: true,
                isIrregular: false,
                minInterval: Math.min(...timestampDiffs),
                maxInterval: Math.max(...timestampDiffs)
            } as IrregularStatus;
        }

        timestampDiffs = timestampDiffs.sort((a:number, b:number) => {
            return a - b;  // sort ascending
        });
        let median : number = (timestampDiffs.length % 2) == 0 ? (timestampDiffs[Math.floor(timestampDiffs.length / 2) - 1] + timestampDiffs[Math.floor(timestampDiffs.length / 2)]) / 2 : timestampDiffs[Math.floor(timestampDiffs.length / 2)];

        let isIrregular : boolean = false;
        let factor : number = config.checkIrregularFactor;
        timestampDiffs.forEach((x:number) => {
            if (x < (1-1/factor)*median || x > (1+1/factor)*median) {
                isIrregular = true;
            }
        });
        return {
            hasData: true,
            isIrregular: isIrregular,
            minInterval: Math.min(...timestampDiffs),
            maxInterval: Math.max(...timestampDiffs)
        } as IrregularStatus;
    }



    updated(changedProperties: Map<string, any>) {
        console.log("performed render update because of updated keys: " + Array.from(changedProperties.keys()));
    }

}



@customElement("or-warn-widgetsettings")
export class OrWarnWidgetSettings extends LitElement {

    @property()
    public readonly widget?: DashboardWidget;

    // Default values
    private expandedPanels: string[] = [i18next.t('attributes'), i18next.t('display'), i18next.t('values'), i18next.t('thresholds')];
    private loadedAsset?: Asset;


    static get styles() {
        return [style, widgetSettingsStyling];
    }

    // UI Rendering
    render() {
        const config = JSON.parse(JSON.stringify(this.widget!.widgetConfig)) as WarnWidgetConfig; // duplicate to edit, to prevent parent updates. Please trigger updateConfig()
        return html`
            <div>
                ${this.generateExpandableHeader(i18next.t('attributes'))}
            </div>
            <div>
                ${this.expandedPanels.includes(i18next.t('attributes')) ? html`
                    <or-dashboard-settingspanel .type="${SettingsPanelType.SINGLE_ATTRIBUTE}" .widgetConfig="${this.widget!.widgetConfig}"
                                                @updated="${(event: CustomEvent) => {
                                                    this.onAttributesUpdate(event.detail.changes);
                                                    this.updateConfig(this.widget!, event.detail.changes.get('config'));
                                                }}"
                    ></or-dashboard-settingspanel>
                ` : null}
            </div>
            <div>
                ${this.generateExpandableHeader(i18next.t('values'))}
            </div>
            <div>
                ${this.expandedPanels.includes(i18next.t('values')) ? html`
                    <div style="padding: 24px 24px 48px 24px;">
                        <div class="switchMwcInputContainer" style="margin-top: 16px;">
                            <span>Check for irregular sending intervals</span>
                            <or-mwc-input .type="${InputType.SWITCH}" style="margin: 0 -10px;" .value="${config.checkIrregular}"
                                          @or-mwc-input-changed="${(event: OrInputChangedEvent) => {
                                              config.checkIrregular = event.detail.value;
                                              this.updateConfig(this.widget!, config);
                                          }}"
                            ></or-mwc-input>
                        </div>
                        <div style="margin-top: 18px;">
                            <or-mwc-input .type="${InputType.NUMBER}" style="width: 100%;" .value="${config.checkIrregularDuration}" label="Search in last x hours"
                                          @or-mwc-input-changed="${(event: OrInputChangedEvent) => {
                                              config.checkIrregularDuration = event.detail.value;
                                              this.updateConfig(this.widget!, config);
                                          }}"
                            ></or-mwc-input>
                        </div>
                        <div style="margin-top: 18px;">
                            <or-mwc-input .type="${InputType.NUMBER}" style="width: 100%;" .value="${config.checkIrregularFactor}" label="Factor"
                                          @or-mwc-input-changed="${(event: OrInputChangedEvent) => {
                                              config.checkIrregularFactor = event.detail.value;
                                              this.updateConfig(this.widget!, config);
                                          }}"
                            ></or-mwc-input>
                        </div>
                    </div>
                ` : null}
            </div>
            <div>
                ${this.generateExpandableHeader(i18next.t('thresholds'))}
            </div>
            <div>
                ${this.expandedPanels.includes(i18next.t('thresholds')) ? html`
                    <or-dashboard-settingspanel .type="${SettingsPanelType.THRESHOLDS}" .widgetConfig="${this.widget?.widgetConfig}"
                                                @updated="${(event: CustomEvent) => { this.updateConfig(this.widget!, event.detail.changes.get('config')); }}">
                    </or-dashboard-settingspanel>
                ` : null}
            </div>
        `
    }

    updateConfig(widget: DashboardWidget, config: OrWidgetConfig | any, force: boolean = false) {
        const oldWidget = JSON.parse(JSON.stringify(widget)) as DashboardWidget;
        widget.widgetConfig = config;
        this.requestUpdate("widget", oldWidget);
        this.forceParentUpdate(new Map<string, any>([["widget", widget]]), force);
    }

    onAttributesUpdate(changes: Map<string, any>) {
        if(changes.has('loadedAssets')) {
            this.loadedAsset = changes.get('loadedAssets')[0];
        }

        if(changes.has('config')) {
            const config = changes.get('config') as WarnWidgetConfig;
            if(config.attributeRefs.length > 0) {
                this.widget!.displayName = this.loadedAsset?.name + " - " + this.loadedAsset?.attributes![config.attributeRefs[0].name!].name;
            }
        }
    }

    // Method to update the Grid. For example after changing a setting.
    forceParentUpdate(changes: Map<string, any>, force: boolean = false) {
        this.requestUpdate();
        this.dispatchEvent(new CustomEvent('updated', {detail: {changes: changes, force: force}}));
    }

    generateExpandableHeader(name: string): TemplateResult {
        return html`
            <span class="expandableHeader panel-title" @click="${() => { this.expandPanel(name); }}">
                <or-icon icon="${this.expandedPanels.includes(name) ? 'chevron-down' : 'chevron-right'}"></or-icon>
                <span style="margin-left: 6px; height: 25px; line-height: 25px;">${name}</span>
            </span>
        `
    }
    expandPanel(panelName: string): void {
        if (this.expandedPanels.includes(panelName)) {
            const indexOf = this.expandedPanels.indexOf(panelName, 0);
            if (indexOf > -1) {
                this.expandedPanels.splice(indexOf, 1);
            }
        } else {
            this.expandedPanels.push(panelName);
        }
        this.requestUpdate();
    }
}
