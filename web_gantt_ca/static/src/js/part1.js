odoo.define('web.GanttCARenderer', function (require) {
    "use strict";

    const config = require('web.config');
    const { qweb, _t } = require('web.core');
    const field_utils = require('web.field_utils');
    const utils = require('web.utils');
    const QWeb = require("web.QWeb");
    const session = require("web.session");
    const BasicRenderer = require('web.BasicRenderer');
    const GanttCACanvas = require("web_gantt_ca.GanttCACanvas");

    function findInNode(node, predicate) {
        if (predicate(node)) {
            return node;
        }
        if (!node.children) {
            return undefined;
        }
        for (let i = 0; i < node.children.length; i++) {
            if (findInNode(node.children[i], predicate)) {
                return node.children[i];
            }
        }
    }

    return BasicRenderer.extend({
        template: 'GanttCAView',
        events: {
            'click .o_gantt_ca_group .o_toggle_group': 'onGroupClick',
            'click .o_open_group_record': 'onClickOpenGroup',
            'dblclick .o_open_record': 'onClickOpenRecord',
        },

        init: function (parent, state, params) {
            this._super.apply(this, arguments);
            this.pagers = []; // instantiated pagers (only for grouped lists)
            this.isGrouped = this.state.groupedBy.length > 0;
            this.modelName = params.modelName;
            this.groupbys = params.groupbys;
            this.mode = params.mode;
            this.dateStart = params.date_start;
            this.dateStop = params.date_stop;
            this.dependencyArrow = params.dependency_arrow;
            this.highlightField = params.highlightField;
            this.arrowType = params.arrow_type;
            this.edgeColorField = params.edge_color;
            this.isReverseArrow = params.reverse_arrow;
            this.columns = params.columns;
            this.columnsVisibleOnGroup = params.columnsVisibleOnGroup;

            this.qweb = new QWeb(config.isDebug(), {_s: session.origin}, false);
            let templates = findInNode(this.arch, function (n) {
                return n.tag === 'templates';
            });
            this.qweb.add_template(utils.json_node_to_xml(templates));
        },

        willStart: function () {
            let def = this._rpc({
                model: this.state.model,
                method: 'get_gantt_ca_default_options',
                args: [[]],
                context: this.state.context,
            }).then((options) => {
                this.options = options;
            });
            return Promise.all([this._super.apply(this, arguments), def]);
        },

        start: function () {
            const attrs = this.arch.attrs;
            this.current_window = {
                start: new moment(),
                end: new moment().add(24, "hours"),
            };

            this.$el.addClass(attrs.class);
            this.$el.addClass('loading');

            if (!this.dateStart) {
                throw new Error(
                    _t("Gantt CA view has not defined 'date_start' attribute.")
                );
            }
            this._super.apply(this, arguments);
        },

        //--------------------------------------------------------------------------
        // Public
        //--------------------------------------------------------------------------

        getController: function () {
            let controller;
            this.trigger_up('get_controller', {
                callback: (result) => {
                    controller = result;
                }
            });
            return controller;
        },

        on_attach_callback: function () {
            const height = this.$el && this.$el.parent().height() || 0;
            if (this.gantt) {
                if (height > 300) {
                    this.gantt.setOptions({
                        maxHeight: this.ganttHeight || height,
                    });
                }
                let ganttState = this.state.getState();
                if (!this.prevGanttState || !_.isEqual(ganttState, this.prevGanttState)) {
                    this.current_window = {
                        start: ganttState.startDate,
                        end: ganttState.scale === 'month' ? ganttState.stopDate.clone().subtract(10, 'days') : ganttState.stopDate,
                    };
                    setTimeout(() => {
                        this.gantt.setWindow(this.current_window);
                    }, 0);
                }
                this.prevGanttState = {...ganttState};
            }
        },

        isLightColor: function (color) {
            if (!color) return false;
            let r, g, b;
            if (color.match(/^rgb/)) {
                color = color.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d+(?:\.\d+)?))?\)$/);
                r = color[1];
                g = color[2];
                b = color[3];
            } else {
                color = +("0x" + color.slice(1).replace(color.length < 5 && /./g, '$&$&'));
                r = color >> 16;
                g = color >> 8 & 255;
                b = color & 255;
            }
            let yiq = (r * 299 + g * 587 + b * 114) / 1000;
            return !(yiq < 128);
        },

        updateState: function (state, params) {
            this.isGrouped = state.groupedBy.length > 0;
            return this._super.apply(this, arguments);
        },

        drawCanvas: function () {
            this.$('.vis-item-content').css('transform', '');
            this.canvas.clear();
            if (this.dependencyArrow) {
                this.drawDependencies();
            }
        },

        drawDependencies: function () {
            let items = this.gantt.itemSet.items;
            if (!items) return;
            _.each(items, (item, key) => {
                if (item.data.record) {
                    item.childs = [];
                    item.parents = [];
                    _.each(item.data.record.data[this.dependencyArrow].res_ids, (id) => {
                        let to = _.find(items, (i) => {
                            return i.data.res_id === id;
                        });
                        if (to) {
                            to.childs = to.childs || [];
                            to.parents = to.parents || [];
                        }
                        if (item && to) {
                            let color;
                            if (this.isReverseArrow) {
                                item.parents.push(to.id);
                                to.childs.push(item.id);
                                if (item.displayed && to.displayed) {
                                    color = item.data.record.data[this.edgeColorField];
                                    this.drawDependency(to, item, {edge_color: color});
                                }
                            } else {
                                to.parents.push(item.id);
                                item.childs.push(to.id);
                                if (item.displayed && to.displayed) {
                                    color = item.data.record.data[this.edgeColorField];
                                    this.drawDependency(item, to, {edge_color: color});
                                }
                            }
                        }
                    });
                }
            });
            _.each(this.selectedIds, id => {
                this.$el.find('path[id="' + id + '"]').attr('stroke', 'gray').addClass('vis-moving-path');
                this.$el.find('marker[lineId="' + id + '"] path').css('fill', 'gray');
            });
        },

        drawDependency: function (from, to, options) {
            const defaults = _.defaults({}, options, {
                edge_color: 'orange',
                edge_width: 1.5,
            });
            this.canvas.drawArrow(from, to, defaults.edge_color, defaults.edge_width);
        },

        getLocalState: function () {
            return {
                scrollTop: this.gantt && this.gantt._getScrollTop() || 0,
            };
        },

        setLocalState: function (state) {
            setTimeout(() => {
                this.gantt && this.gantt._setScrollTop(state.scrollTop || 0);
                this.gantt && this.gantt._redraw();
            }, 0)
        },

        resizeGroup: function () {
            _.each(this.$el.find('.o_gantt_ca_group'), (grp) => {
                let $grp = $(grp);
                $grp.toggleClass('o_group_expanded', $grp.find('table').is(':visible'));
            });
        },

        updateGanttData: function () {
            let data = [];
            this.state.getData({is_groups: this.isGrouped}).forEach((item) => {
                let element = {
                    id: item.res_id,
                    start: item.start_date,
                    end: item.end_date,
                    title: item.title,
                    state: item.state,
                    resource_id: item.resource_id,
                    type: item.type,
                };
                if (this.highlightField) {
                    element[this.highlightField] = item[this.highlightField];
                }
                data.push(element);
            });
            return data;
        }
    });
});
