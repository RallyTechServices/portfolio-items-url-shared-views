Ext.define('TS.PortfolioItemTypePlugin', {
    alias: 'plugin.tsportfolioitemtype',
    extend: 'Rally.ui.combobox.PortfolioItemTypeComboBox',

    // Force remove the Rally.ui.combobox.plugin.PreferenceEnabledComboBox plugin that is
    // normally used with the PortfolioItemTypeComboBox. It interferes with this components
    // use of the URL to get the selected PI type because it sets the combobox value to
    // whatever value was stored in the preference, but it's _onReady can't be overridden by this class.
    plugins: [],

    saveState: function() {
        this._applyParameters();
        this.callParent(arguments);
    },

    applyState: function(state) {
        var oidFromUrl = this._getParameters();
        if (oidFromUrl) {
            this.value = '/typedefinition/' + oidFromUrl;
        }
        this.store.on('load', function() {

            // Only use state value if there isn't a url param value which would have been
            // used as the default value in the contructor
            if (oidFromUrl) {
                this.setValue('/typedefinition/' + oidFromUrl);
            }
            else {
                this.setValue(state.value);
            }
            this.saveState();
        }, this, { single: true });
    },

    _loadPreference: function() {
        var oidFromUrl = this._getParameters();
        // Only load preferences if no OID in the URL
        if (!oidFromUrl) {
            this.callParent(arguments);
        }
    },

    _applyParameters: function() {
        var record = this.getRecord();
        Rally.nav.Manager.applyParameters({
            pitypeoid: record.get('ObjectID')
        }, false);
    },

    _getParameters: function() {
        var result;
        var hash = parent.location.hash,
            matches = hash.match(/pitypeoid=(\d+)/);
        var param = matches && matches[1];
        if (Ext.isNumeric(param)) {
            result = +param;
        }
        return result;
    },

    getCurrentView: function() {
        return {
            tsportfolioitemtype: this.getValue()
        }
    },

    setCurrentView: function(view) {
        this.setValue(view.tsportfolioitemtype);
    },

    getCurrentViewFilter: function() {
        return {
            property: 'value',
            operator: 'contains',
            value: "\"tsportfolioitemtype\":\"" + this.getValue() + "\""
        }
    }
});
