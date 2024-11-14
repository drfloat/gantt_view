# -*- coding: utf-8 -*-
# Copyright 2020 Chintan Ambaliya <chintanambaliya007@gmail.com>
# License LGPL-3.0 or later (http://www.gnu.org/licenses/lgpl.html).

from odoo import fields, models

GANTT_CA_VIEW = ("gantt_ca", "Gantt CA")


class IrUIView(models.Model):
    _inherit = "ir.ui.view"

    type = fields.Selection(selection_add=[GANTT_CA_VIEW])
