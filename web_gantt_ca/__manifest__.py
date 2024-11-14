# -*- coding: utf-8 -*-
# Copyright 2020 Chintan Ambaliya <chintanambaliya007@gmail.com>
# License LGPL-3.0 or later (http://www.gnu.org/licenses/lgpl.html).

{
    "name": "Web Gantt CA",
    "summary": "Interactive visualization chart to show events in time",
    "version": "14.0.1.0.0",
    "author": "Bista Solutions Pvt. Ltd., Chintan Ambaliya",
    "category": "web",
    "license": "OPL-1",
    'website': 'https://www.bistasolutions.com',
    "depends": ["web"],
    # "qweb": [
    #     "static/src/xml/web_gantt_ca.xml",
    # ],
    # "data": ["views/assets.xml"],
    'assets': {
            # 'web.assets_qweb': [
            #     '/web_gantt_ca/static/src/xml/web_gantt.xml'
            # ],
            'web.assets_qweb': [
                'web_gantt_ca/static/src/xml/**/*',
            ],
            'web.assets_backend': [
                '/web_gantt_ca/static/src/scss/widget.scss',
                '/web_gantt_ca/static/src/scss/web_gantt_ca.scss',
                '/web_gantt_ca/static/src/js/basic_fields.js',
                '/web_gantt_ca/static/src/js/gantt_ca_canvas.js',
                '/web_gantt_ca/static/src/js/gantt_ca_view.js',
                '/web_gantt_ca/static/src/js/gantt_ca_renderer.js',
                '/web_gantt_ca/static/src/js/gantt_ca_controller.js',
                '/web_gantt_ca/static/src/js/gantt_ca_model.js',
            ]
    },
    "maintainers": ["Bista Solutions Pvt. Ltd.", "Chintan Ambaliya"],
    "application": False,
    "installable": True,
}
