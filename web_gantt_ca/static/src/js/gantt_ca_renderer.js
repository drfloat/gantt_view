/**
 * Copyright 2020 Chintan Ambaliya <chintanambaliya007@gmail.com>
 * License LGPL-3.0 or later (http://www.gnu.org/licenses/lgpl.html).
 */
odoo.define("web.GanttCARenderer", function (require) {
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
        /**
         * @constructor
         * @param {Widget} parent
         * @param {any} state
         * @param {Object} params
         * @param {boolean} params.hasSelectors
         */
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
        /**
         * @override
         */
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
        /**
         * @override
         */
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

        /**
         * Get current view controller.
         *
         * @public
         */
        getController: function () {
            let controller;
            this.trigger_up('get_controller', {
                callback: (result) => {
                    controller = result;
                }
            });
            return controller;
        },
        /**
         * Triggered when the gantt_ca view is attached to the DOM.
         *
         * @public
         */
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
        /**
         * Check color is light or not.
         *
         * @public
         * @param color
         * @returns {boolean}
         */
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
        /**
         * @override
         */
        updateState: function (state, params) {
            this.isGrouped = state.groupedBy.length > 0;
            return this._super.apply(this, arguments);
        },
        /**
         * Clears and draws the canvas items.
         *
         * @public
         */
        drawCanvas: function () {
            // FIXME: below line is for display exceed days of actual deadline.
            this.$('.vis-item-content').css('transform', '');
            this.canvas.clear();
            if (this.dependencyArrow) {
                this.drawDependencies();
            }
        },
        /**
         * Draw item dependencies on canvas.
         *
         * @public
         */
        drawDependencies: function () {
            let items = this.gantt.itemSet.items;
            if (!items) {
                return;
            }

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

        /**
         * Draws a dependency arrow between 2 timeline items.
         *
         * @public
         * @param {Object} from Start timeline item
         * @param {Object} to Destination timeline item
         * @param {Object} options
         * @param {Object} options.line_color Color of the line
         * @param {Object} options.line_width The width of the line
         */
        drawDependency: function (from, to, options) {
            const defaults = _.defaults({}, options, {
                edge_color: 'orange',
                edge_width: 1.5,
            });
            this.canvas.drawArrow(
                from,
                to,
                defaults.edge_color,
                defaults.edge_width
            );
        },
        /**
         * return the scrollTop of gantt_ca view
         *
         * @see setLocalState
         * @returns {Object} set scrollTop as it is as before update.
         */
        getLocalState: function () {
            return {
                scrollTop: this.gantt && this.gantt._getScrollTop() || 0,
            };
        },
        /**
         * restore the scrollTop of gannt_ca view
         *
         * @param {Object} state the result from a getLocalState call
         */
        setLocalState: function (state) {
            setTimeout(() => {
                this.gantt && this.gantt._setScrollTop(state.scrollTop || 0);
                this.gantt && this.gantt._redraw();
            }, 0)
        },
        resizeGroup: function () {
            _.each(this.$el.find('.o_gantt_ca_group'), (grp) => {
                let $grp = $(grp),
                    $parent = $grp.closest('.vis-nested-group');
                $grp.height($parent.outerHeight());
            });
        },
        /**
         * Add highlight CSS class to related or linked items
         */
        setHighlight: function () {
            for (let id of this.selectedIds) {
                let item = this.gantt.itemSet.items[id];
                try {
                    item.dom.content.classList.add('vis-highlight-border');
                } catch (e) {}
                this.$el.find('path[id="' + id + '"]').attr('stroke', 'gray').addClass('vis-moving-path');
                this.$el.find('marker[lineId="' + id + '"] path').css('fill', 'gray');
            }
        },
        /**
         * Remove highlight CSS class to related or linked items
         */
        removeHighlight: function () {
            for (let id of this.selectedIds) {
                let item = this.gantt.itemSet.items[id];
                try {
                    item.dom.content.classList.remove('vis-highlight-border');
                } catch (e) {}
                let color = this.$el.find('path[id="' + id + '"]').attr('lineColor') || '#000000';
                this.$el.find('path[id="' + id + '"]').attr('stroke', color).removeClass('vis-moving-path');
                this.$el.find('marker[lineId="' + id + '"] path').css('fill', color);
            }
        },

        //--------------------------------------------------------------------------
        // Private
        //--------------------------------------------------------------------------

        /**
         * Builds an object containing the formatted record data used in the
         * template
         *
         * @private
         * @param {Object} recordState
         * @returns {Object} transformed record data
         */
        _transformRecord: function (recordState) {
            let new_record = {};
            let recordData = recordState.data;
            _.each(this.state.getFieldNames(), function (name) {
                let value = recordData[name];
                let r = _.clone(recordState.fields[name] || {});

                if ((r.type === 'date' || r.type === 'datetime') && value) {
                    r.raw_value = value.toDate();
                } else if (r.type === 'one2many' || r.type === 'many2many') {
                    r.raw_value = value.count ? value.res_ids : [];
                } else if (r.type === 'many2one') {
                    r.raw_value = value && value.res_id || false;
                } else {
                    r.raw_value = value;
                }

                if (r.type) {
                    let formatter = field_utils.format[r.type];
                    r.value = formatter(value, recordState.fields[name], recordData, recordState);
                } else {
                    r.value = value;
                }

                new_record[name] = r;
            });
            return new_record;
        },

        /**
         * Create normal tooltip to bootstrap tooltip.
         *
         * @private
         */
        _attachTooltip: function () {
            let self = this;
            this.$('[tooltip]').each(function () {
                let $el = $(this);
                let tooltip = $el.attr('tooltip');
                if (tooltip) {
                    $el.tooltip({
                        title: self.qweb.render(tooltip, self.qweb_context)
                    });
                }
            });
        },

        /**
         * Processes each 'field' tag and replaces it by the specified widget, if
         * any, or directly by the formatted value
         *
         * @private
         */
        _processFields: function ($template, recordState) {
            let self = this;
            $template.find("field").each(function () {
                let $field = $(this);
                let field_name = $field.attr("name");
                self._processField($field, field_name, recordState);
            });
        },
        /**
         * Replace a field by its formatted value.
         *
         * @private
         * @param {JQuery} $field
         * @param {String} field_name
         * @param {Object} recordState
         * @returns {Jquery} the modified node
         */
        _processField: function ($field, field_name, recordState) {
            // no widget specified for that field, so simply use a formatter
            // note: we could have used the widget corresponding to the field's type, but
            // it is much more efficient to use a formatter
            let field = recordState.fields[field_name];
            let value = recordState.data[field_name];
            let options = {data: this.recordData};
            let formatted_value = field_utils.format[field.type](value, field, options);
            let classes = $field.attr('class')
            let style = $field.attr('style')
            let $result = $('<span>', {
                text: formatted_value,
                'class': classes || false,
                style: style || false,
            });
            $field.replaceWith($result);
            this._setFieldDisplay($result, field_name);
            return $result;
        },
        /**
         * Sets particular classnames on a field $el according to the
         * field's attrs (display or bold attributes)
         *
         * @private
         * @param {JQuery} $el
         * @param {string} fieldName
         */
        _setFieldDisplay: function ($el, fieldName) {
            // attribute display
            if (this.state.fieldsInfo.gantt_ca[fieldName].display === 'right') {
                $el.addClass('float-right');
            } else if (this.state.fieldsInfo.gantt_ca[fieldName].display === 'full') {
                $el.addClass('o_text_block');
            }

            // attribute bold
            if (this.state.fieldsInfo.gantt_ca[fieldName].bold) {
                $el.addClass('o_text_bold');
            }
        },
        /**
         * Get html content for group title.
         *
         * @private
         * @returns {HTMLElement}
         */
        _getGroupTitleContent: function () {
            return qweb.render('gantt-ca-group-title', { widget: this });
        },
        /**
         * Get html content for group which will displayed for groups.
         *
         * @private
         * @param recordState
         * @returns {HTMLElement}
         */
        _getGroupContent: function (recordState) {
            if (recordState.type === 'record') {
                let qweb_context = {
                    context: this.state.getContext(),
                    record: this._transformRecord(recordState),
                    user_context: this.getSession().user_context,
                    widget: this,
                };
                let $template = $(qweb.render('gantt-ca-group', qweb_context));
                this._processFields($template, recordState);
                this._attachTooltip($template);
                $template.addClass('o_open_record');
                $template.attr('data-id', recordState.id);
                return $template[0];
            } else {
                return qweb.render('GanttCAView.ParentGroup', {
                    widget: this,
                    group: recordState
                })
            }
        },
        /**
         * Get html content for item which will displayed for items.
         *
         * @private
         * @param recordState
         * @returns {HTMLElement}
         */
        _getItemContent: function (recordState) {
            let qweb_context = {
                context: this.state.getContext(),
                record: this._transformRecord(recordState),
                user_context: this.getSession().user_context,
                widget: this,
            };
            let $template = $(this.qweb.render('gantt-ca-item', qweb_context));
            this._processFields($template, recordState);
            this._attachTooltip($template);
            $template.addClass('o_open_record vis-gantt-item');
            $template.attr('data-id', recordState.id);
            return $template[0];
        },
        /**
         * Get html content for tooptip which will displayed on item mouse hover.
         *
         * @private
         * @param recordState
         * @returns {HTMLElement}
         */
        _getTooltipContent: function (recordState) {
            let qweb_context = {
                context: this.state.getContext(),
                record: this._transformRecord(recordState),
                user_context: this.getSession().user_context,
                widget: this,
            };
            let $template = $(this.qweb.render('gantt-ca-item-tooltip', qweb_context));
            this._processFields($template, recordState);
            this._attachTooltip($template);
            return $template[0];
        },
        /**
         * Create groups
         *
         * @private
         * @param {Array} data set of nested group data.
         * @param groups {vis_ca.DataSet}
         * @param level group level
         * @param group
         * @param groupData
         * @private
         */
        _createGroups: function (data, groups, level, group, groupData) {
            groups = groups || new vis_ca.DataSet();
            groupData = groupData || {};
            for (let d of data) {
                groupData = Object.assign({}, groupData, {
                    [group.groupedBy[0]]: d.res_id,
                });
                let grp = {
                    id: d.id,
                    content: this._getGroupContent(d),
                    record: groupData,
                    nestedGroups: d.type === 'list' ? _.pluck(d.data, 'id') : [],
                    type: d.type,
                    treeLevel: level,
                };
                groups.add(grp);
                if ('isOpen' in d && !d.isOpen) continue;
                if (d.data.length) {
                    let lvl = level + 1;
                    this._createGroups(d.data, groups, lvl, d, groupData)
                }
            }
        },
        /**
         * Create items
         *
         * @param data {Array} redords
         * @param items {vis_ca.DataSet}
         * @param group
         * @private
         */
        _createItems: function (data, items, group) {
            items = items || new vis_ca.DataSet();
            items = items || new vis_ca.DataSet();
            let i = [];
            _.each(data, (d) => {
                if ('isOpen' in d && !d.isOpen) return;
                if (d.data.length && d.type === 'list') {
                    this._createItems(d.data, items, d);
                }
                if (d.type === 'record' && d.data[this.dateStart] && d.data[this.dateStop]) {
                    i.push({
                        id: d.id,
                        group: d.id,
                        start: d.data[this.dateStart],
                        end: d.data[this.dateStop] ? d.data[this.dateStop] : d.data[this.dateStart],
                        record: d,
                        res_id: d.res_id,
                        title: this._getTooltipContent(d),
                        content: this._getItemContent(d),
                    });
                }
            });
            if (i.length && group) {
                items.add({
                    group: group.id,
                    start: moment.min(_.pluck(i, 'start')),
                    end: moment.max(_.pluck(i, 'end')),
                    content: qweb.render('OverallLine', {group: group}),
                    title: qweb.render('OverallLine-Tooltip', {group: group}),
                    editable: false,
                    style: `background-color: transparent; border-color: transparent; height: 15px`,
                });
            }
            items.add(i)
        },
        /**
         * Render a column title on view
         */
        _renderTitle: function () {
            if (!this.gantt) return;
            if (!this.topTitle) {
                this.topTitle = document.createElement('div');
                this.topTitle.innerHTML = this._getGroupTitleContent();
                this.topTitle.className = 'vis-panel vis-top-title';
                this.topTitle.style.left = '0';
                this.topTitle.style.top = '0';
                this.gantt.dom.root.appendChild(this.topTitle);
            }
            this.topTitle.style.height = "".concat(this.gantt.body.domProps.top.height, "px");
            this.topTitle.style.width = this.gantt.dom.top.style.left;
        },
        /**
         * Initializes the Gantt CA view
         * (https://visjs.github.io/vis-timeline/docs/timeline).
         *
         * @private
         */
        _initGanttCA: function () {
            this.options = _.defaults({}, this.options, {
                editable: {
                    // Add new items by double tapping
                    add: false, // this.activeActions.create,
                    // Drag items horizontally
                    updateTime: this.activeActions.edit,
                    // Drag items from one group to another
                    updateGroup: this.activeActions.edit,
                    // Delete an item by tapping the delete button top right
                    remove: false, // this.activeActions.delete,
                },
                // groupOrder: false,
                margin: {
                    // item: 15,
                },
                onInitialDrawComplete: () => {
                    setTimeout(() => {
                        this.gantt && this.gantt._setScrollTop(0);
                        this.gantt && this.gantt._redraw();
                        this.$el.removeClass('loading');
                        this.resizeGroup();
                        this._renderTitle();
                    }, 2500);
                    this.drawCanvas();
                    this.gantt.on("changed", () => {
                        this.drawCanvas();
                        this.resizeGroup();
                        this._renderTitle();
                    });
                },
                itemsAlwaysDraggable: {
                    item: true
                },
                onUpdate: this._onUpdate.bind(this),
                onMove: this._onMove.bind(this),
                onMoving: (item, callback) => {
                    $(item.content).popover("dispose");
                    this.$('.vis-gantt-item').popover('dispose');
                    callback(item);
                },
                showTooltips: false,
                tooltip: {
                    delay: 100,
                    followMouse: true,
                    overflowMethod: 'cap',
                },
                snap: function (date, scale, step) {
                    let hour = 60 * 60 * 1000;
                    return Math.round(date / hour) * hour;
                },
                verticalScroll: true,
                horizontalScroll: true,
                orientation: {
                    axis: 'top',
                },
                zoomKey: 'ctrlKey'
            });
            this.qweb = new QWeb(session.debug, {_s: session.origin}, false);
            if (this.arch.children.length) {
                const tmpl = utils.json_node_to_xml(
                    _.filter(this.arch.children, item => item.tag === "templates")[0]
                );
                this.qweb.add_template(tmpl);
            }

            this.gantt = new vis_ca.Timeline(this.$el.find('.o_gantt_ca_view_container').get(0), [], [], this.options);
            this.gantt.on('select', this._onSelect.bind(this));
            this.gantt.on('itemover', ({ item, event }) => {
                let _item = this.gantt.itemsData.get(item)
                $(_item.content).popover({
                    container: this.$el,
                    trigger: 'hover',
                    delay: {show: 100},
                    html: true,
                    placement: 'right',
                    content: function () {
                        return _item.title;
                    },
                }).popover("show");
            });
            this.gantt.on('itemout', ({ item, event }) => {
                let _item = this.gantt.itemsData.get(item)
                $(_item.content).popover("hide");
            });
            this.$centerContainer = $(this.gantt.dom.centerContainer);
            this.canvas = new GanttCACanvas(this);
            this.canvas.appendTo(this.$centerContainer);
            let wheelType = "onwheel" in document.createElement("div") ? "wheel" : // Modern browsers support "wheel"
                document.onmousewheel !== undefined ? "mousewheel" : // Webkit and IE support at least "mousewheel"
                // DOMMouseScroll - Older Firefox versions use "DOMMouseScroll"
                // onmousewheel - All the use "onmousewheel"
                this.gantt.dom.centerContainer.addEventListener ? "DOMMouseScroll" : "onmousewheel";
                this.gantt.dom.top.addEventListener ? "DOMMouseScroll" : "onmousewheel";
                this.gantt.dom.bottom.addEventListener ? "DOMMouseScroll" : "onmousewheel";
            this.gantt.dom.centerContainer.addEventListener(wheelType, () => {
                this.setHighlight();
            }, false);
        },
        _getHierarchyParentIds: function (itemsIds, ids) {
            ids = ids || [];
            _.each(itemsIds, (id) => {
                let item = this.gantt.itemSet.items[id];
                if (item.data.record && item.parents.length) {
                    ids = ids.concat(item.parents);
                    ids = ids.concat(this._getHierarchyParentIds(item.parents, ids));
                }
            });
            return ids;
        },
        _getHierarchyChildIds: function (itemsIds, ids) {
            ids = ids || [];
            _.each(itemsIds, (id) => {
                let item = this.gantt.itemSet.items[id];
                if (item.data.record && item.childs.length) {
                    ids = ids.concat(item.childs);
                    ids = ids.concat(this._getHierarchyChildIds(item.childs, ids));
                }
            });
            return ids;
        },

        /**
         * @override
         */
        _renderView: function () {
            this.groupField = undefined;
            if (this.state.groupedBy.length === 1) {
                let field = this.state.fields[this.state.groupedBy[0]];
                if (field.type === 'many2one') {
                    this.groupField = {...field, name: this.state.groupedBy[0]}
                }
            }
            if (this.options.arrowType) {
                this.arrowType = this.options.arrowType;
                delete this.options.arrowType;
            }
            this.$('.vis-gantt-item').popover('dispose');
            if (!this.gantt) {
                this._initGanttCA();
                $(window).trigger("resize");
            }
            this._computeAggregates();
            this.selectedIds = [];
            let groups = new vis_ca.DataSet();
            let items = new vis_ca.DataSet();
            if (this.state.data.length) {
                this._createGroups(this.state.data, groups, 1, this.state);
                this._createItems(this.state.data, items);
            } else {
                groups.add({
                    id: 'group_no_data_available',
                    content: '',
                    style: 'width: 400px;'
                });
            }
            let backgrounds = this.backgrounds || this.options.backgrounds
            if (backgrounds) {
                items.add(backgrounds);
                if (!this.backgrounds && this.options.backgrounds) {
                    this.backgrounds = { ...this.options.backgrounds };
                    delete this.options.backgrounds;
                }
            }
            this.gantt.setGroups(groups);
            this.gantt.setItems(items);
            this.on_attach_callback();
            return this._super.apply(this, arguments);
        },
        _computeColumnAggregates: function (data) {
            let aggregateValues = {};
            for (let column of this.columns) {
                let attrs = column.attrs;
                let field = this.state.fields[attrs.name];
                if (!field) continue;
                let type = field.type;
                aggregateValues[attrs.name] = '';
                if (type !== 'integer' && type !== 'float' && type !== 'monetary') continue;
                let func = (attrs.sum && 'sum') || (attrs.avg && 'avg') ||
                    (attrs.max && 'max') || (attrs.min && 'min');
                if (func) {
                    let count = 0;
                    let aggregateValue = 0;
                    if (func === 'max') {
                        aggregateValue = -Infinity;
                    } else if (func === 'min') {
                        aggregateValue = Infinity;
                    }
                    _.each(data, function (d) {
                        count += 1;
                        let value = (d.type === 'record') ? d.data[attrs.name] : d.aggregateValues[attrs.name];
                        if (func === 'avg') {
                            aggregateValue += value;
                        } else if (func === 'sum') {
                            aggregateValue += value;
                        } else if (func === 'max') {
                            aggregateValue = Math.max(aggregateValue, value);
                        } else if (func === 'min') {
                            aggregateValue = Math.min(aggregateValue, value);
                        }
                    });
                    if (func === 'avg') {
                        aggregateValue = count ? aggregateValue / count : aggregateValue;
                    }
                    aggregateValues[attrs.name] = Math.round(aggregateValue * 100) / 100;
                }
            }
            return aggregateValues;
        },
        _traverse_records: function (data) {
            for (let d of data) {
                if (d.type === 'record') return;
                if (d.type === 'list') {
                    this._traverse_records(d.data);
                    d.aggregateValues = _.defaults(d.aggregateValues, this._computeColumnAggregates(d.data));
                }
            }
        },
        _computeAggregates: function () {
            this._traverse_records(this.state.data);
        },
        /**
         * Open record for edit.
         *
         * @param {vis_ca.DataSet} item
         * @param {function} callback
         * @private
         */
        _onUpdate: function (item, callback) {
            this.trigger_up('open_record', {id: item.id, activeActions: this.activeActions});
        },
        _onMove: function (item, callback) {
            let group = this.gantt.groupsData.get(item.group);
            let oldItem = this.gantt.itemsData.get(item.id);
            let isChangedGroup = item.group !== oldItem.group;
            this.trigger_up('on_move', { item, group, isChangedGroup });
        },
        _onSelect: function ({ items, event }) {
            this.removeHighlight();
            this.$('.vis-gantt-item').popover('dispose');
            let selectedIds = items;
            let _items = this.gantt.itemsData.get(items)
            if (_items.length) {
                if (this.highlightField) {
                    let field = this.state.fields[this.highlightField];
                    let value = _items[0].record.data[this.highlightField];
                    if (value) {
                        if (field.type === 'many2one') value = value.data.id
                        let ids = _.chain(this.gantt.itemsData.get()).filter(i => {
                            let v = i.record.data[this.highlightField];
                            if (v && field.type === 'many2one') {
                                v = v.data.id
                            }
                            return value === v;
                        }).map(i => i.id).value();
                        selectedIds = selectedIds.concat(ids);
                    }
                } else if (this.dependencyArrow) {
                    let parentIds = _.uniq(this._getHierarchyParentIds(items)),
                        childIds = _.uniq(this._getHierarchyChildIds(items));
                    selectedIds = selectedIds.concat(parentIds).concat(childIds);
                }
                this.selectedIds = selectedIds;
                this.setHighlight();
            }
        },

        //--------------------------------------------------------------------------
        // Handlers
        //--------------------------------------------------------------------------

        /**
         * Expend/collapse group
         *
         * @private
         * @param {MouseEvent} event
         */
        onGroupClick: function (event) {
            event.preventDefault();
            event.stopPropagation();
            let $target = $(event.currentTarget).closest('.o_gantt_ca_group');
            let groupId = $target.data('group-id');
            let controller = this.getController();
            let group = controller.model.get(groupId);
            if (group) {
                this.trigger_up('toggle_group', {
                    group: group,
                    onSuccess: () => {

                    },
                });
            }

        },
        /**
         * @private
         * @param {MouseEvent} event
         */
        onClickOpenGroup: function (event) {
            event.preventDefault();
            event.stopPropagation();
            if (this.groupField) {
                let $target = $(event.currentTarget).closest('.o_gantt_ca_group');
                let groupId = $target.data('group-id');
                this.trigger_up('open_group_record', {
                    id: groupId,
                    modelName: this.groupField.relation,
                    fieldName: this.groupField.name,
                    activeActions: this.activeActions
                });
            }
        },
        /**
         * @private
         * @param {MouseEvent} event
         */
        onClickOpenRecord: function (event) {
            event.preventDefault();
            event.stopPropagation();
            let $target = $(event.currentTarget),
                db_id = $target.data('id');
            this.trigger_up('open_record', {id: db_id, activeActions: this.activeActions});
        }
    });
});
