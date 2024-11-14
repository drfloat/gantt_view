odoo.define('web.GanttCAView', function (require) {
    "use strict";


    const { _lt } = require('web.core');
    const utils = require('web.utils');
    const pyUtils = require('web.py_utils');
    const { BasicView } = require('web.BasicView');
    const { GanttCAModel } = require('web.GanttCAModel');
    const { GanttCARenderer } = require('web.GanttCARenderer');
    const { GanttCAController } = require('web.GanttCAController');
    const { viewRegistry } = require('web.view_registry');

    const GanttCAView = BasicView.extend({
        accesskey: "G",
        display_name: _lt('GanttCA'),
        icon: 'fa-tasks',
        jsLibs: ["/web_gantt_ca/static/lib/vis-timeline/vis-timeline-graph2d.js"],
        cssLibs: ["/web_gantt_ca/static/lib/vis-timeline/vis-timeline-graph2d.css"],
        config: {
            ...BasicView.prototype.config,
            Model: GanttCAModel,
            Renderer: GanttCARenderer,
            Controller: GanttCAController,
        },
        viewType: 'gantt_ca',

        /**
         * @override
         *
         * @param {Object} viewInfo
         * @param {Object} params
         * @param {boolean} params.hasSidebar
         * @param {boolean} [params.hasSelectors=true]
         */
        init(viewInfo, params) {
            this._super.apply(this, arguments);

            const date_start = this.arch.attrs.date_start;
            const date_stop = this.arch.attrs.date_stop;

            const pyevalContext = pyUtils.pyEvalContext(_.pick(params.context, (value) => !_.isUndefined(value)) || {});
            const expandGroups = !!JSON.parse(pyUtils.py_eval(this.arch.attrs.expand || "0", { context: pyevalContext }));

            this.groupbys = {};
            this.arch.children.forEach((child) => {
                if (child.tag === 'groupby') {
                    this._extractGroup(child);
                }
            });

            this.defaultGroupBy = this.arch.attrs.default_group_by ? this.arch.attrs.default_group_by.split(",") : [];
            this.controllerParams.toolbarActions = viewInfo.toolbar;
            this.controllerParams.mode = 'readonly';
            this.controllerParams.currentScale = this.loadParams.context.default_scale || 'week';
            this.controllerParams.eventOpenPopup = utils.toBoolElse(this.arch.attrs.event_open_popup || '', false);

            this.rendererParams.arch = this.arch;
            this.rendererParams.groupbys = this.groupbys;
            this.rendererParams.addCreateLine = false;
            this.rendererParams.mode = this.arch.attrs.mode || this.arch.attrs.default_window || "fit";
            this.rendererParams.date_start = date_start;
            this.rendererParams.date_stop = date_stop;
            this.rendererParams.dependency_arrow = this.arch.attrs.dependency_arrow;
            this.rendererParams.arrow_type = this.arch.attrs.arrow_type || 'straight';
            this.rendererParams.edge_color = this.arch.attrs.edge_color || false;
            this.rendererParams.reverse_arrow = this.arch.attrs.reverse_arrow;
            this.rendererParams.highlightField = this.arch.attrs.highlight_field;
            this.rendererParams.columns = this._getColumns();
            this.rendererParams.columnsVisibleOnGroup = this.columnsVisibleOnGroup;

            this.modelParams.groupbys = this.groupbys;

            this.loadParams.limit = this.loadParams.limit || 1000;
            this.loadParams.openGroupByDefault = expandGroups;
            this.loadParams.type = 'list';
            const groupsLimit = parseInt(this.arch.attrs.groups_limit, 10);
            this.loadParams.groupsLimit = groupsLimit || (expandGroups ? 10 : 80);
            this.loadParams.dateStartField = date_start;
            this.loadParams.dateStopField = date_stop;
            this.loadParams.defaultGroupBy = this.defaultGroupBy;
        },

        //--------------------------------------------------------------------------
        // Private
        //--------------------------------------------------------------------------

        /**
         * @private
         * @param {Object} node
         */
        _extractGroup(node) {
            const innerView = this.fields[node.attrs.name].views.groupby;
            this.groupbys[node.attrs.name] = this._processFieldsView(innerView, 'groupby');
        },

        /**
         * @override
         */
        _extractParamsFromAction(action) {
            const params = this._super.apply(this, arguments);
            const inDialog = action.target === 'new';
            const inline = action.target === 'inline';
            params.hasSidebar = !inDialog && !inline;
            return params;
        },

        /**
         * @override
         */
        _updateMVCParams() {
            this._super.apply(this, arguments);
            this.controllerParams.noLeaf = !!this.loadParams.context.group_by_no_leaf;
        },

        /**
         * @private
         */
        _getColumns() {
            for (const child of this.arch.children) {
                if (child.tag === 'columns' && child.children.length) {
                    this.columnsVisibleOnGroup = child.attrs.visible_on_group ? JSON.parse(child.attrs.visible_on_group) : false;
                    const columns = child.children;
                    columns[0].isDescriptionColumn = true;
                    return columns;
                }
            }
            return [];
        }
    });

    viewRegistry.add("gantt_ca", GanttCAView);

    return GanttCAView;

});
