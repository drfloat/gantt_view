/** @odoo-module **/

import basic_fields from 'web.basic_fields';
import field_registry from 'web.field_registry';
import pyUtils from 'web.py_utils';

class FieldColor extends basic_fields.FieldChar {
    static template = 'FieldColorSelector';
    static jsLibs = ["/web_gantt_ca/static/lib/bootstrap-colorpicker/bootstrap-colorpicker.js"];
    static cssLibs = ["/web_gantt_ca/static/lib/bootstrap-colorpicker/bootstrap-colorpicker.css"];

    /**
     * Check color is light or not.
     *
     * @param {string} color
     * @returns {boolean}
     */
    isLightColor(color) {
        let r, g, b;
        if (color.match(/^rgb/)) {
            const result = color.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d+(?:\.\d+)?))?\)$/);
            r = result[1];
            g = result[2];
            b = result[3];
        } else {
            color = +("0x" + color.slice(1).replace(color.length < 5 && /./g, '$&$&'));
            r = color >> 16;
            g = (color >> 8) & 255;
            b = color & 255;
        }
        const yiq = (r * 299 + g * 587 + b * 114) / 1000;
        return !(yiq < 128);
    }

    /**
     * Generate random color.
     *
     * @returns {string}
     */
    _getRandomColor() {
        const randomColor = Math.floor(Math.random() * 16777215).toString(16);
        return "#" + randomColor;
    }

    /**
     * @override
     */
    _renderReadonly() {
        // Define renderReadonly function based on Odoo 17 updates
    }

    /**
     * @override
     */
    _renderEdit() {
        this.$input = this.el.querySelector('input');
        $(this.$input).colorpicker()
            .on('colorpickerCreate', (event) => {
                const color = event.color.toString();
                $(this.$input).css({
                    'background-color': color,
                    'color': this.isLightColor(color) ? '#000000' : '#ffffff',
                });
            })
            .on('colorpickerChange', (event) => {
                const color = event.color.toString();
                $(this.$input).css({
                    'background-color': color,
                    'color': this.isLightColor(color) ? '#000000' : '#ffffff',
                });
            });
    }
}

field_registry.add('form.color_selector', FieldColor);

export default FieldColor;

