/**
 * Copyright 2020 Chintan Ambaliya <chintanambaliya007@gmail.com>
 * License LGPL-3.0 or later (http://www.gnu.org/licenses/lgpl.html).
 */
odoo.define("web.GanttCAModel", function (require) {
    "use strict";

    const BasicModel = require('web.BasicModel');
    const session = require('web.session');
    const concurrency = require('web.concurrency');

    const AGGREGATABLE_TYPES = ['float', 'integer', 'monetary'];

    return BasicModel.extend({

        /**
         * @override
         * @param {Object} params.groupbys
         */
        init: function (parent, params) {
            this._super.apply(this, arguments);
            this.groupbys = params.groupbys;
            this.mutex = new concurrency.Mutex();
        },

        //--------------------------------------------------------------------------
        // Public
        //--------------------------------------------------------------------------

        /**
         * overridden to add `groupData` when performing get on list datapoints.
         *
         * @override
         * @see _readGroupExtraFields
         */
        get: function () {
            let result = this._super.apply(this, arguments);
            let dp = result && this.localData[result.id];
            if (dp && dp.groupData) {
                result.groupData = this.get(dp.groupData);
            }
            return result;
        },
        getState: function () {
            return this.ganttCAData;
        },
        updateContext: function (dataPointId) {
            let list = this.localData[dataPointId];
            if (list) {
                Object.assign(list.context, this.ganttCAData, {
                    viewType: 'gantt_ca',
                    startDate: this.convertToServerTime(this.ganttCAData.startDate),
                    stopDate: this.convertToServerTime(this.ganttCAData.stopDate),
                });
            }
        },

        /**
         * Convert date to server timezone
         *
         * @param {Moment} date
         * @returns {string} date in server format
         */
        convertToServerTime: function (date) {
            let result = date.clone();
            if (!result.isUTC()) {
                result.subtract(session.getTZOffset(date), 'minutes');
            }
            return result.locale('en').format('YYYY-MM-DD HH:mm:ss');
        },
        rescheduleData: function (itemDate) {
            for (let fieldName in itemDate) {
                if (itemDate[fieldName]
                    && (this.fields[fieldName].type === 'datetime'
                        || this.fields[fieldName].type === 'date')) {
                    itemDate[fieldName] = this.convertToServerTime(itemDate[fieldName]);
                }
            }
            return itemDate;
        },

        reschedule: function (ids, itemData) {
            if (!_.isArray(ids)) ids = [ids];
            const data = this.rescheduleData(itemData);
            return this.mutex.exec(() => {
                return this._rpc({
                    model: this.modelName,
                    method: 'write',
                    args: [ids, data],
                    context: this.context,
                });
            });
        },

        //--------------------------------------------------------------------------
        // Private
        //--------------------------------------------------------------------------

        /**
         * Set date range to render gantt CA
         *
         * @private
         * @param {Moment} date current activated date
         * @param {string} scale current activated scale
         */
        _setRange: function (date, scale, period) {
            this.ganttCAData.scale = scale;
            this.ganttCAData.date = date;
            this.ganttCAData.period = period;
            let endDate;
            switch (scale) {
                case 'day':
                case 'week':
                case 'month':
                case 'quarter':
                case 'year':
                    this.ganttCAData.startDate = date.clone().startOf(scale);
                    endDate = this.ganttCAData.startDate.clone();
                    endDate.add(this.ganttCAData.period, scale).subtract(1, 's')
                    this.ganttCAData.stopDate = endDate;
                    break;
                case 'halfYear':
                    let startDate = date.clone();
                    startDate.date(1)
                    startDate.month(startDate.month() > 5 ? 6 : 0);
                    startDate.hours(0);
                    startDate.minutes(0);
                    startDate.seconds(0);
                    endDate = startDate.clone();
                    endDate.add(this.ganttCAData.period * 6, 'month').subtract(1, 's')
                    this.ganttCAData.startDate = startDate;
                    this.ganttCAData.stopDate = endDate;
                    break;
            }
        },

        _getGanttCADomain: function () {
            let domain = [
                [this.ganttCAData.dateStartField, '<=', this.convertToServerTime(this.ganttCAData.stopDate)],
                [this.ganttCAData.dateStopField, '>=', this.convertToServerTime(this.ganttCAData.startDate)],
            ];
            return this.domain.concat(domain);
        },

        __get: function (id, options) {
            let res = this._super(...arguments);
            if (res) res.getState = this.getState.bind(this);
            return res;
        },

        __load: async function (params) {
            this.fields = params.fields;
            this.context = params.context;
            this.domain = params.domain || [];
            this.modelName = params.modelName;
            this.defaultGroupBy = params.defaultGroupBy;
            this.ganttCAData = {
                dateStartField: params.dateStartField,
                dateStopField: params.dateStopField,
            }
            let scale = 'week'
            if (this.context && this.context.default_scale){
                scale = this.context.default_scale;
                this.context.startDate = this.context.default_startDate;
                this.context.stopDate = this.context.default_stopDate;
            }
            this._setRange(moment(new Date()), scale, 1);
            return this._super(...arguments);
        },

        _load: function (dataPoint, options) {
            this.updateContext(dataPoint.id);
            if (this.context && this.context.default_scale){
                this.context.scale = this.context.default_scale;
                this.context.startDate = this.context.default_startDate;
                this.context.stopDate = this.context.default_stopDate;
            }
            return this._super(dataPoint, options);
        },

        __reload: function (handle, params) {
            if ('scale' in params) {
                this._setRange(this.ganttCAData.date, params.scale, this.ganttCAData.period);
            }
            if ('date' in params) {
                this._setRange(params.date, this.ganttCAData.scale, this.ganttCAData.period);
            }
            if ('period' in params) {
                this._setRange(this.ganttCAData.date, this.ganttCAData.scale, params.period);
            }
            if ('domain' in params) {
                this.domain = params.domain;
            }
            if ('groupBy' in params && !params.groupBy.length) {
                params.groupBy = this.defaultGroupBy;
            }
            this.updateContext(handle);
            return  this._super(...arguments);
        },

        _generateRows: function (params) {
            let self = this;
            let options = params.options;
            let groups = params.groups;
            let records = params.records;
            let groupedBy = params.groupedBy;
            let list = params.list;
            let defs = params.defs || [];
            let groupedByField = list.groupedBy[0];
            let rawGroupBy = groupedByField.split(':')[0];
            let fields = _.uniq(list.getFieldNames().concat(rawGroupBy));
            let openGroupCount = 0;
            let openGroupsLimit = list.groupsLimit || self.OPEN_GROUP_LIMIT;

            list.groupsCount = groups.length;
            list.data = [];
            list.count = 0;

            var previousGroups = _.map(list.data, function (groupID) {
                return self.localData[groupID];
            });

            var currentLevelGroups = _.groupBy(groups, groupedByField);
            _.map(currentLevelGroups, (subGroups, key) => {
                let groupRecords = _.filter(records, function (record) {
                    return _.isEqual(record[groupedByField], subGroups[0][groupedByField]);
                });
                let aggregateValues = {};
                if (subGroups[0].aggregate && groupedByField in subGroups[0].aggregate) {
                    _.each(subGroups[0].aggregate[groupedByField], function (value, key) {
                        if (_.contains(fields, key) && key !== groupedByField &&
                            AGGREGATABLE_TYPES.includes(list.fields[key].type)) {
                            aggregateValues[key] = value;
                        }
                    });
                }
                let value;
                if (groupRecords.length) {
                    value = groupRecords[0][groupedByField];
                } else {
                    value = subGroups[0][groupedByField];
                }
                if (list.fields[rawGroupBy].type === "selection") {
                    var choice = _.find(list.fields[rawGroupBy].selection, function (c) {
                        return c[0] === value;
                    });
                    value = choice ? choice[1] : false;
                }
                let newGroup = self._makeDataPoint({
                    modelName: list.model,
                    count: subGroups.length,
                    domain: [],
                    context: list.context,
                    fields: list.fields,
                    fieldsInfo: list.fieldsInfo,
                    value: value,
                    aggregateValues: aggregateValues,
                    groupedBy: list.groupedBy.slice(1),
                    orderedBy: list.orderedBy,
                    orderedResIDs: list.orderedResIDs,
                    limit: list.limit,
                    openGroupByDefault: list.openGroupByDefault,
                    parentID: list.id,
                    type: 'list',
                    viewType: list.viewType,
                });
                let oldGroup = _.find(previousGroups, function (g) {
                    return g.res_id === newGroup.res_id && g.value === newGroup.value;
                });
                if (oldGroup) {
                    delete self.localData[newGroup.id];
                    // restore the internal state of the group
                    var updatedProps = _.pick(oldGroup, 'isOpen', 'offset', 'id');
                    if (options.onlyGroups || oldGroup.isOpen && newGroup.groupedBy.length) {
                        // If the group is opened and contains subgroups,
                        // also keep its data to keep internal state of
                        // sub-groups
                        // Also keep data if we only reload groups' own data
                        updatedProps.data = oldGroup.data;
                        if (options.onlyGroups) {
                            // keep count and res_ids as in this case the group
                            // won't be search_read again. This situation happens
                            // when using kanban quick_create where the record is manually
                            // added to the datapoint before getting here.
                            updatedProps.res_ids = oldGroup.res_ids;
                            updatedProps.count = oldGroup.count;
                        }
                    }
                    _.extend(newGroup, updatedProps);
                    // set the limit such that all previously loaded records
                    // (e.g. if we are coming back to the kanban view from a
                    // form view) are reloaded
                    newGroup.limit = oldGroup.limit + oldGroup.loadMoreOffset;
                    self.localData[newGroup.id] = newGroup;
                } else if (!newGroup.openGroupByDefault || openGroupCount >= openGroupsLimit) {
                    newGroup.isOpen = false;
                } else if ('__fold' in group) {
                    newGroup.isOpen = !group.__fold;
                } else {
                    // open the group iff it is a first level group
                    newGroup.isOpen = !self.localData[newGroup.parentID].parentID;
                }
                list.data.push(newGroup.id);
                list.count += newGroup.count;
                newGroup.isOpen = true;
                openGroupCount++;
                if (groupedBy.length === 1) {
                    if (groupRecords.length) {
                        // bypass the search_read when the group's records have been obtained
                        // by the call to 'web_read_group' (see @_searchReadUngroupedList)
                        newGroup.__data = {
                            records: groupRecords,
                            length: groupRecords.length
                        };
                        options = _.defaults({enableRelationalFetch: false}, options);
                        defs.push(self._load(newGroup, options));
                    }
                }
                if (groupedBy.length > 1) {
                    self._generateRows({
                        list: newGroup,
                        groupedBy: groupedBy.slice(1),
                        groups: subGroups,
                        options: options,
                        records: groupRecords,
                    });
                }
            });
            return defs;
        },

        _fetchData: function (list, options) {

            let groupedByField = list.groupedBy[0];
            let rawGroupBy = groupedByField.split(':');
            let fields = _.uniq(list.getFieldNames().concat(rawGroupBy).concat(list.groupedBy));
            let orderedBy = _.filter(list.orderedBy, function (order) {
                return order.name === rawGroupBy || list.fields[order.name].group_operator !== undefined;
            });
            let domain = this._getGanttCADomain();
            let context = list.context;

            let groupsDef;
            if (list.groupedBy.length) {
                groupsDef = this._rpc({
                    model: this.modelName,
                    method: 'read_group',
                    fields: fields,
                    domain: domain,
                    context: context,
                    groupBy: list.groupedBy,
                    orderBy: orderedBy,
                    lazy: list.groupedBy.length === 1,
                });
            }
            let dataDef = this._rpc({
                route: '/web/dataset/search_read',
                model: this.modelName,
                fields: fields,
                context: context,
                domain: domain,
            });

            return Promise.all([groupsDef, dataDef]).then((results) => {
                let groups = results[0];
                let searchReadResult = results[1];
                return this._generateRows({
                    list: list,
                    groupedBy: list.groupedBy,
                    groups: groups,
                    options: options,
                    records: searchReadResult.records,
                });
            });
        },

        /**
         *
         * @override
         * @private
         */
        _readGroup: function (list, options) {
            var self = this;
            options = options || {};
            options.fetchRecordsWithGroups = true;
            return this._fetchData(list, options)
                .then(function (defs) {
                    return Promise.all(defs).then(function (groups) {
                        if (!options.onlyGroups) {
                            // generate the res_ids of the main list, being the concatenation
                            // of the fetched res_ids in each group
                            list.res_ids = _.flatten(_.map(groups, function (group) {
                                return group ? group.res_ids : [];
                            }));
                        }
                        return list;
                    }).then(function () {
                        return Promise.all([
                            self._fetchX2ManysSingleBatch(list),
                            self._fetchReferencesSingleBatch(list)
                        ]).then(function () {
                            return self._readGroupExtraFields(list).then(() => list);
                        });
                    });
                });
        },
        /**
         * Toggle (open/close) a group in a grouped list
         *
         * @param {string} groupId
         * @returns {Promise<string>} resolves to the group id
         */
        toggleGroup: function (groupId) {
            let group = this.localData[groupId];
            group.isOpen = !group.isOpen;
            return Promise.resolve(groupId);
        },
        /**
         * Fetches group specific fields on the group by relation and stores it
         * in the column datapoint in a special key `groupData`.
         * Data for the groups are fetched in batch for all groups, to avoid
         * doing multiple calls.
         * Note that the option is only for m2o fields.
         *
         * @private
         * @param {Object} list
         * @returns {Promise}
         */
        _readGroupExtraFields: function (list) {
            let self = this;
            let groupByFieldName = list.groupedBy[0].split(':')[0];
            let groupedByField = list.fields[groupByFieldName];
            if (groupedByField.type !== 'many2one' || !this.groupbys[groupByFieldName]) {
                return Promise.resolve();
            }
            let groupIds = _.reduce(list.data, function (groupIds, id) {
                let resId = self.get(id, {raw: true}).res_id;
                if (resId) { // the field might be undefined when grouping
                    groupIds.push(resId);
                }
                return groupIds;
            }, []);
            let groupFields = Object.keys(this.groupbys[groupByFieldName].viewFields);
            let prom;
            if (groupIds.length && groupFields.length) {
                prom = this._rpc({
                    model: groupedByField.relation,
                    method: 'read',
                    args: [groupIds, groupFields],
                    context: list.context,
                });
            }
            return Promise.resolve(prom).then(function (result) {
                let fvg = self.groupbys[groupByFieldName];
                _.each(list.data, function (id) {
                    let dp = self.localData[id];
                    let groupData = result && _.findWhere(result, {
                        id: dp.res_id,
                    });
                    let groupDp = self._makeDataPoint({
                        context: dp.context,
                        data: groupData,
                        fields: fvg.fields,
                        fieldsInfo: fvg.fieldsInfo,
                        modelName: groupedByField.relation,
                        parentID: dp.id,
                        res_id: dp.res_id,
                        viewType: 'groupby',
                    });
                    dp.groupData = groupDp.id;
                });
            });
        },
    });
});
