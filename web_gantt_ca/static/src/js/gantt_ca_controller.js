/**
 * Copyright 2020 Chintan Ambaliya <chintanambaliya007@gmail.com>
 * License LGPL-3.0 or later (http://www.gnu.org/licenses/lgpl.html).
 */
/** @odoo-module **/

/** @odoo-module **/

/** @odoo-module **/

import { Component, useState, useRef, useDispatch, onWillStart } from '@odoo/owl';
import { qweb, _t } from 'web.core';
import { FormViewDialog } from 'web.view_dialogs';
import { useListener } from 'web.custom_hooks';
import moment from 'moment';

export class GanttCAController extends Component {
    static template = 'GanttCAView.buttons';

    constructor() {
        super(...arguments);

        // Initialize constants
        this.SCALES = {
            day: { string: _t('Day') },
            week: { string: _t('Week') },
            month: { string: _t('Month') },
            quarter: { string: _t('Quarter') },
            halfYear: { string: _t('Half Year') },
            year: { string: _t('Year') },
        };
        this.allScales = ['day', 'week', 'month', 'quarter', 'halfYear', 'year'];

        // Initialize reactive state
        this.state = useState({
            scale: this.props.currentScale || 'month',
            period: this.props.period || 1,
        });

        // Props
        this.model = this.props.model;
        this.renderer = this.props.renderer;
        this.eventOpenPopup = this.props.eventOpenPopup;

        // Listeners
        useListener('click', this._onScaleClicked, '.o_gantt_ca_button_scale');
        useListener('click', this._onPrevPeriodClicked, '.o_gantt_ca_button_prev');
        useListener('click', this._onNextPeriodClicked, '.o_gantt_ca_button_next');
        useListener('click', this._onTodayClicked, '.o_gantt_ca_button_today');
        useListener('click', this._onPeriodClicked, '.o_period_item');
        useListener('click', this._onToggleGroup, '.o_toggle_group');
        useListener('click', this._onOpenGroupRecord, '.o_open_group_record');
        useListener('on_move', this._onMoved);

        // Initial Rendering
        onWillStart(() => this.update());
    }

    // Render buttons using OWL's template
    renderButtons() {
        return qweb.render(this.template, {
            widget: this,
            SCALES: this.SCALES,
            currentScale: this.state.scale,
            allScales: this.allScales,
            periods: Array.from({ length: 12 }, (_, idx) => ++idx),
        });
    }

    // Event Handlers

    _onScaleClicked(ev) {
        ev.preventDefault();
        const $button = ev.currentTarget;
        this.state.scale = $button.getAttribute('data-value');
        this.update();
    }

    _onPrevPeriodClicked(ev) {
        ev.preventDefault();
        let { scale, date } = this.model.ganttCAData;
        const unit = scale === 'halfYear' ? 6 : 1;
        scale = scale === 'halfYear' ? 'month' : scale;
        this.update({ date: moment(date).subtract(unit, scale) });
    }

    _onNextPeriodClicked(ev) {
        ev.preventDefault();
        let { scale, date } = this.model.ganttCAData;
        const unit = scale === 'halfYear' ? 6 : 1;
        scale = scale === 'halfYear' ? 'month' : scale;
        this.update({ date: moment(date).add(unit, scale) });
    }

    _onTodayClicked() {
        this.update({ date: moment() });
    }

    _onPeriodClicked(ev) {
        ev.preventDefault();
        const value = parseInt(ev.currentTarget.getAttribute('value'), 10);
        this.state.period = Math.min(Math.max(value, 1), 12);
        this.update();
    }

    _onToggleGroup(ev) {
        ev.stopPropagation();
        const groupId = ev.data.group.id;
        this.model.toggleGroup(groupId).then(() => {
            this.update({ keepSelection: true, reload: false });
        });
    }

    _onMoved(ev) {
        ev.stopPropagation();
        const { item, group, isChangedGroup } = ev.data;
        const data = {
            [this.model.ganttCAData.dateStartField]: moment(item.start),
            [this.model.ganttCAData.dateStopField]: moment(item.end),
        };
        if (isChangedGroup) Object.assign(data, group.groupData);
        this.model.reschedule(item.res_id, data).then(() => {
            this.update();
        }).catch(() => {
            this.update();
        });
    }

    _onOpenGroupRecord(ev) {
        ev.stopPropagation();
        const group = this.model.get(ev.data.id, { raw: true });
        const activeActions = ev.data.activeActions || {};
        if (group && group.res_id) {
            new FormViewDialog(this, {
                res_id: group.res_id,
                res_model: group.model,
                title: _t("Open: ") + (group.value || ''),
                readonly: !(activeActions.edit),
            }).open();
        }
    }

    // Helper method for dialog rendering
    _openFormDialog(res_id, modelName, title, actions) {
        new FormViewDialog(this, {
            res_id,
            res_model: modelName,
            title,
            on_saved: () => this.update(),
            readonly: !actions.edit,
        }).open();
    }

    // Update state and re-render as needed
    update(newState = {}) {
        Object.assign(this.state, newState);
        this.renderButtons();
    }
}

return GanttCAController;
