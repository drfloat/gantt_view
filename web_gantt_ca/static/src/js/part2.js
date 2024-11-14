from odoo import models, fields, api
from odoo.exceptions import UserError
import moment

class GanttChart(models.Model):
    _name = 'gantt.chart'
    _description = 'Custom Gantt Chart'

    def _get_item_content(self, record_state):
        """ Generate HTML content for the item """
        qweb_context = {
            'context': self.env.context,
            'record': self._transform_record(record_state),
            'user_context': self.env.user.context,
            'widget': self,
        }
        template = self.env['ir.ui.view'].render_template('gantt_ca_item', qweb_context)
        template = self._process_fields(template, record_state)
        template = self._attach_tooltip(template)
        template = f'<div class="o_open_record vis-gantt-item" data-id="{record_state.id}">{template}</div>'
        return template

    def _get_tooltip_content(self, record_state):
        """ Generate HTML content for the tooltip """
        qweb_context = {
            'context': self.env.context,
            'record': self._transform_record(record_state),
            'user_context': self.env.user.context,
            'widget': self,
        }
        template = self.env['ir.ui.view'].render_template('gantt_ca_item_tooltip', qweb_context)
        return self._process_fields(template, record_state)

    def _create_groups(self, data, groups, level, group, group_data):
        """ Create groups for the Gantt chart """
        groups = groups or []
        group_data = group_data or {}
        for record in data:
            group_data.update({group.grouped_by[0]: record['res_id']})
            grp = {
                'id': record['id'],
                'content': self._get_group_content(record),
                'record': group_data,
                'nestedGroups': record['type'] == 'list' and [d['id'] for d in record['data']] or [],
                'type': record['type'],
                'treeLevel': level,
            }
            groups.append(grp)
            if record.get('isOpen') is False:
                continue
            if record.get('data'):
                self._create_groups(record['data'], groups, level + 1, record, group_data)

    def _create_items(self, data, items, group):
        """ Create items for the Gantt chart """
        items = items or []
        for record in data:
            if record.get('isOpen') is False:
                continue
            if record.get('data') and record['type'] == 'list':
                self._create_items(record['data'], items, record)
            if record['type'] == 'record' and record['data'].get(self.date_start) and record['data'].get(self.date_stop):
                items.append({
                    'id': record['id'],
                    'group': record['id'],
                    'start': record['data'][self.date_start],
                    'end': record['data'][self.date_stop] or record['data'][self.date_start],
                    'record': record,
                    'res_id': record['res_id'],
                    'title': self._get_tooltip_content(record),
                    'content': self._get_item_content(record),
                })
        if items and group:
            items.append({
                'group': group.id,
                'start': min([item['start'] for item in items]),
                'end': max([item['end'] for item in items]),
                'content': self.env['ir.ui.view'].render_template('OverallLine', {'group': group}),
                'title': self.env['ir.ui.view'].render_template('OverallLine-Tooltip', {'group': group}),
                'editable': False,
                'style': 'background-color: transparent; border-color: transparent; height: 15px',
            })

    def _render_title(self):
        """ Render the title for the Gantt view """
        if not self.gantt:
            return
        if not self.top_title:
            self.top_title = '<div class="vis-panel vis-top-title" style="left: 0; top: 0;">' + self._get_group_title_content() + '</div>'
            self.gantt_dom_root.append(self.top_title)
        self.top_title.style['height'] = f"{self.gantt.body.dom_props['top']['height']}px"
        self.top_title.style['width'] = self.gantt.dom.top.style['left']

    def _init_gantt_ca(self):
        """ Initialize the Gantt chart CA view """
        self.options = {**self.options, **{
            'editable': {
                'add': False,
                'updateTime': self.active_actions['edit'],
                'updateGroup': self.active_actions['edit'],
                'remove': False,
            },
            'margin': {},
            'onInitialDrawComplete': lambda: self._on_initial_draw_complete(),
            'itemsAlwaysDraggable': {'item': True},
            'onUpdate': self._on_update,
            'onMove': self._on_move,
            'onMoving': self._on_moving,
            'showTooltips': False,
            'tooltip': {'delay': 100, 'followMouse': True, 'overflowMethod': 'cap'},
            'snap': lambda date, scale, step: round(date / (60 * 60 * 1000)) * (60 * 60 * 1000),
            'verticalScroll': True,
            'horizontalScroll': True,
            'orientation': {'axis': 'top'},
            'zoomKey': 'ctrlKey',
        }}
        self.qweb = self.env['ir.qweb'].get_template_manager()
        if self.arch.children:
            tmpl = self.env['ir.ui.view'].render_template('templates', {'children': self.arch.children})
            self.qweb.add_template(tmpl)
        self.gantt = vis_ca.Timeline(self.$el.find('.o_gantt_ca_view_container').get(0), [], [], self.options)

    def _on_initial_draw_complete(self):
        """ Handle the initial draw complete event """
        self.gantt.setGroups(groups)
        self.gantt.setItems(items)
        self.$el.removeClass('loading')
        self.resize_group()
        self._render_title()

    # Other methods can be converted in a similar manner, ensuring to keep the Odoo-specific functions intact and restructuring JavaScript to Python conventions.
