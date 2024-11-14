# -*- coding: utf-8 -*-
from odoo import _, api, models
from lxml.builder import E
from odoo.exceptions import UserError


class Base(models.AbstractModel):
    _inherit = 'base'

    def get_gantt_ca_default_options(self):
        return {}
