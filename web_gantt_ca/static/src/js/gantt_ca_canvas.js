/**
 * Copyright 2024 Pranav Salunkhe
 * License LGPL-3.0 or later (http://www.gnu.org/licenses/lgpl.html).
 */
/** @odoo-module */

import { Component } from "@odoo/owl";
import { useRef } from "@odoo/owl";
import { _ } from "web.core";

export class GanttCACanvas extends Component {
    setup() {
        this.gantt = this.props.gantt;
        this.arrowType = this.props.arrowType;
        this.svg = useRef("svg");
        this.g = useRef("g");
    }

    mounted() {
        this.createSVG();
    }

    /**
     * Create main SVG to draw directional arrows.
     */
    createSVG() {
        this.svg.el.style.position = "absolute";
        this.svg.el.style.top = "0px";
        this.svg.el.style.height = "100%";
        this.svg.el.style.width = "100%";
        this.svg.el.style.display = "block";
        this.svg.el.style.zIndex = "1";
        this.svg.el.style.pointerEvents = "none";
        this.gantt.dom.center.appendChild(this.svg.el);
        this.createArrowDefs();
    }

    /**
     * Creates arrow head definition for parent-child directional lines.
     */
    createArrow(color, id, lineId) {
        const arrowMarker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
        arrowMarker.setAttribute("id", id);
        arrowMarker.setAttribute("lineId", lineId);
        arrowMarker.setAttribute("LineColor", color);
        arrowMarker.setAttribute("viewBox", "-10 -5 10 10");
        arrowMarker.setAttribute("refX", "-7");
        arrowMarker.setAttribute("refY", "0");
        arrowMarker.setAttribute("markerUnits", "strokeWidth");
        arrowMarker.setAttribute("markerWidth", "7");
        arrowMarker.setAttribute("markerHeight", "7");
        arrowMarker.setAttribute("orient", "auto-start-reverse");

        const arrowHeadPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
        arrowHeadPath.setAttribute("d", "M 0 0 L -10 -5 L -7.5 0 L -10 5 z");
        arrowHeadPath.style.fill = color || "#000";

        arrowMarker.appendChild(arrowHeadPath);
        this.arrowDefs.appendChild(arrowMarker);
    }

    createArrowDefs() {
        this.arrowDefs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
        this.svg.el.appendChild(this.arrowDefs);
    }

    getItemPos(item) {
        const left_x = item.left;
        const top_y = item.parent.top + item.parent.height - item.top - item.height;
        return {
            left: isNaN(left_x) ? 0 : left_x,
            top: isNaN(left_x) ? 0 : top_y,
            right: isNaN(left_x) ? 0 : left_x + item.width,
            bottom: isNaN(left_x) ? 0 : top_y + item.height,
            mid_x: isNaN(left_x) ? 0 : left_x + item.width / 2,
            mid_y: isNaN(left_x) ? 0 : top_y + item.height / 2,
            width: isNaN(left_x) ? 0 : item.width,
            height: isNaN(left_x) ? 0 : item.height
        };
    }

    drawArrow(from, to, color, width) {
        return this.drawLine(from, to, color, width, this.arrowType);
    }

    drawLine(from, to, color, width, shape = "straight") {
        const line = document.createElementNS("http://www.w3.org/2000/svg", "path");
        line.setAttribute("id", from.id);
        line.setAttribute("lineColor", color);
        line.setAttribute("d", "M 0 0");
        line.setAttribute("stroke", color || "#000");
        line.setAttribute("stroke-width", width || "3");
        line.setAttribute("fill", "none");

        const id = _.uniqueId("arrow_");
        this.createArrow(color, id, from.id);
        this.g.el.appendChild(line);

        let path;
        const item_i = this.getItemPos(from);
        const item_j = this.getItemPos(to);

        if (shape === "curved") {
            line.setAttribute("marker-end", `url(#${id})`);
            const curveLen = item_i.height * 2;
            path = `M ${item_i.right} ${item_i.mid_y} C ${item_i.right + curveLen} ${item_i.mid_y} ${item_j.left - curveLen} ${item_j.mid_y} ${item_j.left - 5} ${item_j.mid_y}`;
        } else if (shape === "straight") {
            line.setAttribute("marker-end", `url(#${id})`);
            path = `M ${item_i.right} ${item_i.mid_y} L ${item_i.right + 10} ${item_i.mid_y} L ${item_i.right + 10} ${item_j.mid_y}`;
        }

        line.setAttribute("d", path);
        return line;
    }

    clear() {
        this.svg.el.remove();
        this.createSVG();
    }
}
