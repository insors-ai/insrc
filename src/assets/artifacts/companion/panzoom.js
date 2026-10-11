/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/*
 * Companion page pan/zoom (LLD-d9f85b3c S001/t2).
 *
 * A dependency-free, transform-based pan/zoom for the companion page's view
 * panel. It moves one "stage" element inside a clipping "viewport" with a CSS
 * transform, so it works the same for any child: a Mermaid SVG or an HTML UX
 * mock. The page inlines this file verbatim, so it must stay self-contained (no
 * imports, no network) and plain ES5 so any browser that opens the page runs it.
 *
 * Usage, from the page:
 *   var pz = window.insrcPanZoom.init({
 *     viewport: 'vp', stage: 'stage', zoomLabel: 'zl',
 *     zoomIn: 'zin', zoomOut: 'zout', fit: 'zfit', reset: 'z100',
 *     fitOnLoad: true,
 *   });
 *   pz.fit();   // e.g. again once Mermaid has drawn the diagram
 *
 * Every id but viewport and stage is optional; a missing control is skipped.
 */
(function () {
	'use strict';

	var MIN_SCALE = 0.2;
	var MAX_SCALE = 8;
	var MAX_FIT_SCALE = 2;      // Fit never enlarges a small visual past 200%.
	var FIT_MARGIN = 0.92;      // Fit leaves a little room around the visual.
	var WHEEL_STEP = 1.12;
	var BUTTON_STEP = 1.25;
	var DBLCLICK_STEP = 1.5;
	var RESET_OFFSET = 20;      // 1:1 places the visual just inside the top-left.

	function byId(id) {
		return id ? document.getElementById(id) : null;
	}

	function init(opts) {
		var vp = byId(opts && opts.viewport);
		var st = byId(opts && opts.stage);
		if (!vp || !st) {
			return { fit: function () {}, reset: function () {} };
		}
		var label = byId(opts.zoomLabel);
		var s = 1, x = 0, y = 0;

		st.style.transformOrigin = '0 0';

		function apply() {
			st.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + s + ')';
			if (label) { label.textContent = Math.round(s * 100) + '%'; }
		}

		// Zoom by `factor`, keeping the point (cx, cy) of the viewport still.
		function zoomAt(factor, cx, cy) {
			var next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, s * factor));
			x = cx - (cx - x) * (next / s);
			y = cy - (cy - y) * (next / s);
			s = next;
			apply();
		}

		function fit() {
			var w = st.scrollWidth, h = st.scrollHeight;
			var W = vp.clientWidth, H = vp.clientHeight;
			if (!w || !h || !W || !H) { return; }
			s = Math.min(Math.min(W / w, H / h) * FIT_MARGIN, MAX_FIT_SCALE);
			x = (W - w * s) / 2;
			y = (H - h * s) / 2;
			apply();
		}

		function reset() {
			s = 1; x = RESET_OFFSET; y = RESET_OFFSET;
			apply();
		}

		function centre() {
			return [vp.clientWidth / 2, vp.clientHeight / 2];
		}

		function local(ev) {
			var r = vp.getBoundingClientRect();
			return [ev.clientX - r.left, ev.clientY - r.top];
		}

		vp.addEventListener('wheel', function (ev) {
			ev.preventDefault();
			var p = local(ev);
			zoomAt(ev.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP, p[0], p[1]);
		}, { passive: false });

		var drag = null;
		vp.addEventListener('pointerdown', function (ev) {
			drag = { px: ev.clientX, py: ev.clientY, x: x, y: y };
			vp.classList.add('drag');
			if (vp.setPointerCapture) { vp.setPointerCapture(ev.pointerId); }
		});
		vp.addEventListener('pointermove', function (ev) {
			if (!drag) { return; }
			x = drag.x + ev.clientX - drag.px;
			y = drag.y + ev.clientY - drag.py;
			apply();
		});
		function endDrag() {
			drag = null;
			vp.classList.remove('drag');
		}
		vp.addEventListener('pointerup', endDrag);
		vp.addEventListener('pointercancel', endDrag);

		vp.addEventListener('dblclick', function (ev) {
			var p = local(ev);
			zoomAt(DBLCLICK_STEP, p[0], p[1]);
		});

		function bind(id, handler) {
			var el = byId(id);
			if (el) { el.addEventListener('click', handler); }
		}
		bind(opts.zoomIn, function () { var p = centre(); zoomAt(BUTTON_STEP, p[0], p[1]); });
		bind(opts.zoomOut, function () { var p = centre(); zoomAt(1 / BUTTON_STEP, p[0], p[1]); });
		bind(opts.fit, fit);
		bind(opts.reset, reset);

		apply();
		if (opts.fitOnLoad) { setTimeout(fit, 0); }
		return { fit: fit, reset: reset };
	}

	window.insrcPanZoom = { init: init };
})();
