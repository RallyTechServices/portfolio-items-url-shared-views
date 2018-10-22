Ext.define("custom-grid-with-deep-export", {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    layout: {
        type: 'vbox',
        align: 'stretch'
    },
    items: [{
            id: 'control-area',
            xtype: 'container'
        },
        {
            id: 'grid-area',
            xtype: 'container',
            flex: 1,
            type: 'vbox',
            align: 'stretch'
        }
    ],
    config: {
        defaultSettings: {
            columnNames: ['FormattedID', 'Name', 'ScheduleState'],
            query: '',
            showControls: true,
            type: 'HierarchicalRequirement',
            pageSize: 50,
            searchAllProjects: false,
        }
    },

    integrationHeaders: {
        name: "custom-grid-with-deep-export"
    },

    piTypesOnly: true,
    selectedPiType: undefined,
    selectedPiTypePath: undefined,

    disallowedAddNewTypes: ['user', 'userprofile', 'useriterationcapacity', 'testcaseresult', 'task', 'scmrepository', 'project', 'changeset', 'change', 'builddefinition', 'build', 'program'],
    orderedAllowedPageSizes: [10, 25, 50, 100, 200],
    readOnlyGridTypes: ['build', 'change', 'changeset'],
    statePrefix: 'customlist',
    allowExpansionStateToBeSaved: false,
    enableAddNew: true,
    onTimeboxScopeChange: function(newTimeboxScope) {
        this.callParent(arguments);
        this._buildStore();
    },
    launch: function() {
        this.piTypePlugin = Ext.create('TS.PortfolioItemTypePlugin', {
            stateful: true,
            stateId: this.getContext().getScopedStateId('pitype'), // No model yet, can't use model scoped id
            fieldLabel: 'Portfolio Items',
            labelCls: 'tstitle',
            labelWidth: 130,
            listeners: {
                scope: this,
                ready: function(combobox) {
                    // Pi picker has initial value, save it for 
                    this.selectedPiType = combobox.getRecord();

                    // Get the list of portfolio item types from the pi picker
                    this.portfolioItemTypes = _.sortBy(combobox.getStore().getRecords(), function(type) {
                        return type.get('Ordinal');
                    });

                    // Now that ready (and initial updates have completed), listen for future changes
                    combobox.on('select', function(combobox, records) {
                        this.selectedPiType = records[0];
                        var newModel = this.selectedPiType.get('TypePath');
                        if (newModel != this.selectedPiTypePath) {
                            this.selectedPiTypePath = newModel;
                            // Update the grid with the new PI type
                            this.viewChange();
                        }
                    }, this);

                    // Add the picker to the display
                    var controlArea = this.down('#control-area');
                    controlArea.add(this.piTypePlugin);

                    // Add the data grid if we have a pi type selected
                    if (this.selectedPiType) {
                        this.selectedPiTypePath = this.selectedPiType.get('TypePath');
                        this.viewChange();
                    }
                }
            }
        });
    },

    // Usual monkey business to size gridboards
    onResize: function() {
        this.callParent(arguments);
        var gridArea = this.down('#grid-area');
        var gridboard = this.down('rallygridboard');
        if (gridArea && gridboard) {
            gridboard.setHeight(gridArea.getHeight())
        }
    },

    _buildStore: function() {
        this.logger.log('_buildStore', this.selectedPiTypePath);
        var fetch = ['FormattedID', 'Name'];
        var dataContext = this.getContext().getDataContext();
        if (this.searchAllProjects()) {
            dataContext.project = null;
        }

        Ext.create('Rally.data.wsapi.TreeStoreBuilder').build({
            models: [this.selectedPiTypePath],
            enableHierarchy: true,
            remoteSort: true,
            fetch: fetch,
            context: dataContext
        }).then({
            success: this._addGridboard,
            scope: this
        });
    },
    _addGridboard: function(store) {
        var gridArea = this.down('#grid-area')
        gridArea.removeAll();

        var filters = this.getSetting('query') ? [Rally.data.wsapi.Filter.fromQueryString(this.getSetting('query'))] : [];
        var timeboxScope = this.getContext().getTimeboxScope();
        if (timeboxScope && timeboxScope.isApplicable(store.model)) {
            filters.push(timeboxScope.getQueryFilter());
        }
        this.logger.log('_addGridboard', store);

        var context = this.getContext();
        var dataContext = context.getDataContext();
        if (this.searchAllProjects()) {
            dataContext.project = null;
        }
        var summaryRowFeature = Ext.create('Rally.ui.grid.feature.SummaryRow');
        this.gridboard = gridArea.add({
            xtype: 'rallygridboard',
            context: context,
            modelNames: [this.selectedPiTypePath],
            toggleState: 'grid',
            height: gridArea.getHeight(),
            listeners: {
                scope: this,
                viewchange: this.viewChange,
            },
            sharedViewAdditionalCmps: [this.piTypePlugin],
            plugins: [
                'rallygridboardaddnew',
                {
                    ptype: 'rallygridboardinlinefiltercontrol',
                    inlineFilterButtonConfig: {
                        stateful: true,
                        stateId: this.getModelScopedStateId(this.selectedPiTypePath, 'filters'),
                        modelNames: [this.selectedPiTypePath],
                        inlineFilterPanelConfig: {
                            quickFilterPanelConfig: {
                                portfolioItemTypes: this.portfolioItemTypes,
                                modelName: this.selectedPiTypePath,
                                whiteListFields: [
                                    'Tags',
                                    'Milestones'
                                ]
                            }
                        }
                    }
                },
                {
                    ptype: 'rallygridboardfieldpicker',
                    headerPosition: 'left',
                    modelNames: [this.selectedPiTypePath],
                    stateful: true,
                    stateId: this.getModelScopedStateId(this.selectedPiTypePath, 'fields')
                },
                {
                    ptype: 'rallygridboardactionsmenu',
                    menuItems: this._getExportMenuItems(),
                    buttonConfig: {
                        iconCls: 'icon-export'
                    }
                },
                {
                    ptype: 'rallygridboardsharedviewcontrol',
                    sharedViewConfig: {
                        enableUrlSharing: this.isFullPageApp !== false,
                        stateful: true,
                        stateId: this.getContext().getScopedStateId('views'),
                        stateEvents: ['select', 'beforedestroy'],
                        additionalFilters: [this.piTypePlugin.getCurrentViewFilter()],
                        suppressViewNotFoundNotification: true,
                        emptyText: 'Select or Add Saved View...',
                        defaultSelectionPosition: null,
                        defaultViews: _.map(this._getDefaultViews(this.selectedPiTypePath), function(view) {
                            Ext.apply(view, {
                                Value: Ext.JSON.encode(view.Value, true)
                            });
                            return view;
                        }, this),
                    },
                }
            ],
            cardBoardConfig: {
                attribute: 'ScheduleState'
            },
            gridConfig: {
                store: store,
                storeConfig: {
                    filters: filters,
                    context: dataContext
                },
                columnCfgs: [
                    'Name',
                    {
                        dataIndex: 'PlanEstimate',
                        summaryType: 'sum'
                    },
                    {
                        dataIndex: 'TaskRemainingTotal',
                        summaryType: 'sum'
                    },
                    {
                        dataIndex: 'ToDo',
                        summaryType: 'sum'
                    },
                    {
                        dataIndex: 'TaskEstimateTotal',
                        summaryType: 'sum'
                    }
                ],
                features: [summaryRowFeature]
            }
        });
    },

    _getDefaultViews: function(modelName) {
        return [{
            Name: this.selectedPiType.get('Name') + ' Default View',
            identifier: this.selectedPiType.get('Ordinal') + 1, // Doesn't work with value 0
            Value: {
                toggleState: 'grid',
                columns: _.map(this._getDefaultFields(modelName), function(columnName) {
                    return {
                        dataIndex: columnName
                    }
                })
            }
        }];
    },

    _getDefaultFields: function(modelName) {
        var result = ['Name', 'State', 'PercentDoneByStoryCount', 'PlannedStartDate', 'PlannedEndDate', 'Project']
        // Release only applies to lowest Pi level
        if (modelName == this.portfolioItemTypes[0].get('TypePath')) {
            result.push('Release');
        }
        return result;
    },

    viewChange: function() {
        this._buildStore();
    },

    getModelScopedStateId: function(modelName, id) {
        return this.getContext().getScopedStateId(modelName + '-' + id);
    },

    _getExportMenuItems: function() {
        var result = [];
        this.logger.log('_getExportMenuItems', this.selectedPiTypePath);
        var currentModel = this.selectedPiTypePath.toLowerCase();
        if (currentModel === 'hierarchicalrequirement') {
            result = [{
                text: 'Export User Stories...',
                handler: this._export,
                scope: this,
                childModels: ['hierarchicalrequirement']
            }, {
                text: 'Export User Stories and Tasks...',
                handler: this._export,
                scope: this,
                childModels: ['hierarchicalrequirement', 'task']
            }, {
                text: 'Export User Stories and Child Items...',
                handler: this._export,
                scope: this,
                childModels: ['hierarchicalrequirement', 'task', 'defect', 'testcase']
            }];
        }
        else if (currentModel.startsWith("portfolioitem")) {
            var piTypeNames = this.getPortfolioItemTypeNames();
            var idx = _.indexOf(piTypeNames, currentModel);
            var childModels = [];
            if (idx > 0) {
                for (var i = idx; i > 0; i--) {
                    childModels.push(piTypeNames[i - 1]);
                }
            }

            result = [{
                text: 'Export Portfolio Items...',
                handler: this._export,
                scope: this,
                childModels: childModels
            }, {
                text: 'Export Portfolio Items and User Stories...',
                handler: this._export,
                scope: this,
                childModels: childModels.concat(['hierarchicalrequirement'])
            }, {
                text: 'Export Portfolio Items, User Stories and Tasks...',
                handler: this._export,
                scope: this,
                childModels: childModels.concat(['hierarchicalrequirement', 'task'])
            }, {
                text: 'Export Portfolio Items and Child Items...',
                handler: this._export,
                scope: this,
                childModels: childModels.concat(['hierarchicalrequirement', 'task', 'defect', 'testcase'])
            }];
        }
        else if (currentModel == 'defect') {
            result = [{
                text: 'Export Defects...',
                handler: this._export,
                scope: this,
                childModels: []
            }, {
                text: 'Export Defects and Child Items...',
                handler: this._export,
                scope: this,
                childModels: ['defect', 'task', 'testcase']
            }];
        }
        else if (currentModel == 'testcase') {
            result = [{
                text: 'Export Test Cases...',
                handler: this._export,
                scope: this,
                childModels: []
            }, {
                text: 'Export Test Cases and Child Items...',
                handler: this._export,
                scope: this,
                childModels: ['defect', 'task', 'testcase']
            }];
        }
        else {
            result = [{
                text: 'Export to CSV...',
                handler: this._export,
                scope: this,
                childModels: []
            }];
        }

        return result;
    },
    getPortfolioItemTypeNames: function() {
        return _.map(this.portfolioItemTypes, function(type) {
            return type.get('TypePath').toLowerCase();
        });
    },

    _showError: function(msg) {
        Rally.ui.notify.Notifier.showError({ message: msg });
    },
    _showStatus: function(message) {
        this.logger.log('_showstatus', message, this);
        if (message) {
            Rally.ui.notify.Notifier.showStatus({
                message: message,
                showForever: true,
                closable: false,
                animateShowHide: false
            });
        }
        else {
            Rally.ui.notify.Notifier.hide();
        }
    },
    _getExportColumns: function() {
        var grid = this.down('rallygridboard').getGridOrBoard();
        if (grid) {
            return _.filter(grid.columns, function(item) {
                return (
                    item.dataIndex &&
                    item.dataIndex != "DragAndDropRank" &&
                    item.xtype &&
                    item.xtype != "rallytreerankdraghandlecolumn" &&
                    item.xtype != "rallyrowactioncolumn" &&
                    item.text != "&#160;");
            });
        }
        return [];
    },
    _getExportFilters: function() {
        var grid = this.down('rallygridboard'),
            filters = [],
            query = this.getSetting('query');

        if (grid.currentCustomFilter && grid.currentCustomFilter.filters) {
            filters = grid.currentCustomFilter.filters;
        }

        if (query) {
            filters.push(Rally.data.wsapi.Filter.fromQueryString(query));
        }

        var timeboxScope = this.getContext().getTimeboxScope();
        if (timeboxScope && timeboxScope.isApplicable(grid.getGridOrBoard().store.model)) {
            filters.push(timeboxScope.getQueryFilter());
        }
        return filters;
    },
    _getExportFetch: function() {
        var fetch = _.pluck(this._getExportColumns(), 'dataIndex');
        if (Ext.Array.contains(fetch, 'TaskActualTotal')) {
            fetch.push('Actuals');
        }
        return fetch;
    },
    _getExportSorters: function() {
        return this.down('rallygridboard').getGridOrBoard().getStore().getSorters();
    },
    _export: function(args) {
        var columns = this._getExportColumns(),
            fetch = this._getExportFetch(),
            filters = this._getExportFilters(),
            modelName = this.selectedPiTypePath,
            childModels = args.childModels,
            sorters = this._getExportSorters();

        this.logger.log('_export', fetch, args, columns, filters.toString(), childModels, sorters);

        var exporter = Ext.create('Rally.technicalservices.HierarchyExporter', {
            modelName: modelName,
            fileName: 'hierarchy-export.csv',
            columns: columns,
            portfolioItemTypeObjects: this.portfolioItemTypes

        });
        exporter.on('exportupdate', this._showStatus, this);
        exporter.on('exporterror', this._showError, this);
        exporter.on('exportcomplete', this._showStatus, this);

        var dataContext = this.getContext().getDataContext();
        if (this.searchAllProjects()) {
            dataContext.project = null;
        }
        var hierarchyLoader = Ext.create('Rally.technicalservices.HierarchyLoader', {
            model: modelName,
            fetch: fetch,
            filters: filters,
            sorters: sorters,
            loadChildModels: childModels,
            portfolioItemTypes: this.portfolioItemTypes,
            context: dataContext
        });
        hierarchyLoader.on('statusupdate', this._showStatus, this);
        hierarchyLoader.on('hierarchyloadartifactsloaded', exporter.setRecords, exporter);
        hierarchyLoader.on('hierarchyloadcomplete', exporter.export, exporter);
        hierarchyLoader.on('hierarchyloaderror', this._showError, this)
        hierarchyLoader.load();
    },
    getHeight: function() {
        var el = this.getEl();
        if (el) {
            var height = this.callParent(arguments);
            return Ext.isIE8 ? Math.max(height, 600) : height;
        }

        return 0;
    },

    setHeight: function(height) {
        this.callParent(arguments);
        if (this.gridboard) {
            this.gridboard.setHeight(height);
        }
    },
    getOptions: function() {
        return [{
            text: 'About...',
            handler: this._launchInfo,
            scope: this
        }];
    },

    _launchInfo: function() {
        if (this.about_dialog) { this.about_dialog.destroy(); }
        this.about_dialog = Ext.create('Rally.technicalservices.InfoLink', {});
    },

    isExternal: function() {
        return typeof(this.getAppId()) == 'undefined';
    },

    isMilestoneScoped: function() {
        var result = false;

        var tbscope = this.getContext().getTimeboxScope();
        if (tbscope && tbscope.getType() == 'milestone') {
            result = true;
        }
        return result
    },

    searchAllProjects: function() {
        var searchAllProjects = this.getSetting('searchAllProjects');
        return this.isMilestoneScoped() && searchAllProjects;
    },

    getSettingsFields: function() {
        return Rally.technicalservices.CustomGridWithDeepExportSettings.getFields({
            showSearchAllProjects: this.isMilestoneScoped()
        });
    }
});
