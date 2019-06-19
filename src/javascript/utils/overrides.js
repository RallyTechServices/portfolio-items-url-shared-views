Rally.ui.renderer.GridEditorFactory.editorRenderers['PreliminaryEstimate'] = function(field) {
    return {
        xtype: 'rallyrecordcontexteditor',
        field: {
            xtype: 'rallycombobox',
            allowNoEntry: !field.required,
            editable: false,
            name: field.name,
            storeConfig: {
                autoLoad: true,
                model: field.name,
                remoteFilter: true,
                sorters: [{
                    property: "Value"
                }],
                listeners: {
                    load: function() {
                        return;
                    }
                }
            }
        }
    };
};

Ext.override(Rally.data.wsapi.Field, {
    getAllowedValueStore: function(storeConfig) {
        var allowedValues = this._getAllowedValues();
        if (allowedValues) {
            if(!this._allowedValueStore) {
                this._allowedValueStore = Ext.create('Rally.data.wsapi.collection.Store', _.merge({
                    cacheResults: true,
                    initialCount: allowedValues.length || allowedValues.Count,
                    model: Ext.identityFn('AllowedAttributeValue'),
                    proxy: Rally.data.wsapi.ModelFactory.buildProxy(this.getAllowedValuesRef(), this.name),
                    pageSize: 2000
                }, storeConfig));
            }
            return this._allowedValueStore;
        }
        return null;
    }
});

Ext.override(Rally.nav.Manager, {
    // Override to not automatically remove other parameters
    applyParameters: function(params, triggerNavStateChange, paramsToRemove) {
        var hash = parent.location.hash;
        var re = /(\w+)=(\d+)&?/g;
        var matches;
        var currentParams = {};
        while ((matches = re.exec(hash)) !== null) {
            var name = matches[1];
            var value = matches[2];
            // Add any params currently in the URL, unless they are in the remove list
            if (!paramsToRemove || !Ext.Array.contains(paramsToRemove, name)) {
                currentParams[name] = value;
            }
        }
        _.merge(currentParams, params);

        Rally.environment.getMessageBus().publish(Rally.nav.Message.applyParameters, currentParams, triggerNavStateChange, paramsToRemove);
    }
});

Ext.override(Rally.ui.gridboard.plugin.GridBoardFieldPicker, {
    gridFieldBlackList: [
        'Changesets',
        'Children',
        // 'Description',
        // 'Notes',
        'ObjectID',
        'Predecessors',
        'RevisionHistory',
        'Subscription',
        'Successors',
        'TaskIndex',
        'Workspace',
        'VersionId'
    ]
});

Ext.override(Rally.ui.inlinefilter.PropertyFieldComboBox, {
    /**
     * @cfg {String[]} whiteListFields
     * field names that should be included from the filter row field combobox
     */
    defaultWhiteListFields: ['Milestones', 'Tags']
});

Ext.override(Rally.ui.grid.TreeGrid, {
    // Override needed to allow summaryType to be restored when a column with
    // summaryType config is added by the field picker
    _mergeColumnConfigs: function(newColumns, oldColumns) {
        return _.map(newColumns, function(newColumn) {
            // If the newly selected column is currently in oldColumns (this.columns), then
            // use the in-use column config to preserve its current settings
            var result = newColumn;
            var newColumnName = this._getColumnName(newColumn);
            var oldColumn = _.find(oldColumns, { dataIndex: newColumnName });
            if (oldColumn) {
                result = this._getColumnConfigFromColumn(oldColumn);
            }
            else if (this.config && this.config.columnCfgs) {
                // Otherwise, if the newly selected column appears in the original columnCfgs
                // use that config. (This allows the column picker to get any renderers or summary
                // config from the column config)
                var columnCfg = _.find(this.config.columnCfgs, { dataIndex: newColumnName });
                if (columnCfg) {
                    result = columnCfg;
                }
            }

            return result;
        }, this);
    },

    // Override needed to allow summaryType to be included when a column is restored
    // from state.
    _applyStatefulColumns: function(columns) {
        // TODO (tj) test default columns
        if (this.alwaysShowDefaultColumns) {
            _.each(this.columnCfgs, function(columnCfg) {
                if (!_.any(columns, { dataIndex: this._getColumnName(columnCfg) })) {
                    columns.push(columnCfg);
                }
            }, this);
        }

        if (this.config && this.config.columnCfgs) {
            // Merge the column config with the stateful column if the dataIndex is the same.
            // This allows use to pick up summaryType and custom renderers
            _.each(this.config.columnCfgs, function(columnCfg) {
                // Search by dataIndex or text
                var columnName = this._getColumnName(columnCfg);
                var columnState = _.find(columns, function(value) {
                    return (value.dataIndex === columnName || value.text === columnName);
                });
                if (columnState) {
                    // merge them (add renderer)
                    _.merge(columnState, columnCfg);
                }
            }, this);
        }

        this.columnCfgs = columns;
    }
});
