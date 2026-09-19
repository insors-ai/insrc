/*
 * insrc review panel — inline comment layer (Story S003 / t4).
 *
 * A small, self-contained, dependency-free overlay shipped as a LOCAL plugin
 * resource (no CDN, no network fetch). The Kotlin content view inlines this
 * after markdown-renderer.js has populated #insrc-content, and provides:
 *
 *   window.__insrcPostComment(payloadJson)  -- injected Kotlin bridge (S003/t5)
 *   window.__insrcArtifactId                -- the artifact the page is showing
 *
 * This layer is PRESENTATION ONLY (lc1/k1): it captures an anchor + body and
 * posts a { op, comment } payload to Kotlin, which owns ALL validation and the
 * un-submitted CommentBuffer (the source of truth). It never persists, never
 * calls the daemon, and re-renders threads only from the set Kotlin pushes back
 * via window.insrcRenderComments(comments). So an un-submitted comment survives
 * a page re-render: Kotlin re-embeds the snapshot on the next load.
 *
 * The bridge may be absent (native fallback, or JCEF present but the bridge not
 * injected): every affordance degrades to a no-op rather than throwing.
 */
(function (global) {
  'use strict';

  var contentEl = null;
  var threadsEl = null;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Post an op to Kotlin (which validates + folds it into the buffer, then pushes
  // the new set back). A missing bridge is a silent no-op (read-only surface).
  function post(op, comment) {
    var bridge = global.__insrcPostComment;
    if (typeof bridge !== 'function') return;
    try {
      bridge(JSON.stringify({ artifactId: global.__insrcArtifactId || '', op: op, comment: comment }));
    } catch (e) { /* never throw out of an event handler */ }
  }

  // Resolve the section path of the heading nearest above the current selection,
  // using the data-section-path attribute emitted by markdown-renderer.js (t3).
  function sectionPathOf(node) {
    var el = node && node.nodeType === 3 ? node.parentNode : node;
    while (el && el !== contentEl) {
      // walk previous siblings + ancestors looking for a heading with a path
      var probe = el;
      while (probe) {
        if (probe.getAttribute) {
          var p = probe.getAttribute('data-section-path');
          if (p) return p;
        }
        probe = probe.previousElementSibling;
      }
      el = el.parentNode;
    }
    return null;
  }

  function captureSelectionAnchor() {
    var sel = global.getSelection ? global.getSelection() : null;
    if (!sel || sel.rangeCount === 0) return null;
    var text = String(sel.toString() || '').trim();
    var anchorNode = sel.anchorNode;
    if (!anchorNode || !contentEl || !contentEl.contains(anchorNode)) return null;
    var sectionPath = sectionPathOf(anchorNode);
    if (!text && !sectionPath) return null; // an all-null anchor is rejected by Kotlin anyway
    var anchor = {};
    if (sectionPath) anchor.sectionPath = sectionPath;
    if (text) anchor.quote = text.length > 280 ? text.slice(0, 280) : text;
    return anchor;
  }

  // Render the comment threads Kotlin pushes (the buffer snapshot). Total: any
  // shape error degrades to an empty list rather than throwing.
  function renderComments(comments) {
    if (!threadsEl) return;
    var list = [];
    try { list = Array.isArray(comments) ? comments : []; } catch (e) { list = []; }
    if (list.length === 0) {
      threadsEl.innerHTML = '<div class="insrc-empty">No comments yet. Select text and click "Add comment".</div>';
      return;
    }
    var parts = ['<div class="insrc-threads-title">Comments (' + list.length + ')</div>'];
    for (var i = 0; i < list.length; i++) {
      var c = list[i] || {};
      var a = c.anchor || {};
      var where = a.sectionPath ? esc(a.sectionPath) : (a.openQuestionId ? 'open question ' + esc(a.openQuestionId) : 'general');
      parts.push(
        '<div class="insrc-thread" data-id="' + esc(c.id) + '">' +
          '<div class="insrc-thread-where">' + where + '</div>' +
          (a.quote ? '<blockquote class="insrc-thread-quote">' + esc(a.quote) + '</blockquote>' : '') +
          '<div class="insrc-thread-body">' + esc(c.body) + '</div>' +
          '<div class="insrc-thread-actions">' +
            '<a href="#" data-act="edit" data-id="' + esc(c.id) + '">edit</a> ' +
            '<a href="#" data-act="remove" data-id="' + esc(c.id) + '">remove</a>' +
          '</div>' +
        '</div>'
      );
    }
    threadsEl.innerHTML = parts.join('');
  }

  function onAddClick() {
    var anchor = captureSelectionAnchor();
    if (!anchor) {
      // Nothing selected + no resolvable section: guide, don't post.
      flashHint('Select some text in the artifact to anchor a comment.');
      return;
    }
    var body = global.prompt ? global.prompt('Comment:') : null;
    if (body == null) return;             // cancelled
    body = String(body).trim();
    if (!body) return;                    // blank -> Kotlin would reject anyway
    post('add', { anchor: anchor, body: body });
  }

  function onThreadsClick(ev) {
    var t = ev.target;
    if (!t || !t.getAttribute) return;
    var act = t.getAttribute('data-act');
    if (!act) return;
    ev.preventDefault();
    var id = t.getAttribute('data-id');
    if (!id) return;
    if (act === 'remove') {
      post('remove', { id: id });
    } else if (act === 'edit') {
      var body = global.prompt ? global.prompt('Edit comment:') : null;
      if (body == null) return;
      body = String(body).trim();
      if (!body) return;
      post('edit', { id: id, body: body });
    }
  }

  var hintEl = null;
  function flashHint(msg) {
    if (!hintEl) return;
    hintEl.textContent = msg;
    hintEl.style.visibility = 'visible';
    global.setTimeout(function () { if (hintEl) hintEl.style.visibility = 'hidden'; }, 2500);
  }

  // Build the fixed comment affordance (an "Add comment" bar + a threads panel)
  // once, appended after the rendered content. Idempotent.
  function install() {
    contentEl = document.getElementById('insrc-content');
    if (!contentEl || document.getElementById('insrc-comment-bar')) return;

    var bar = document.createElement('div');
    bar.id = 'insrc-comment-bar';
    bar.className = 'insrc-comment-bar';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Add comment';
    btn.addEventListener('click', onAddClick);
    hintEl = document.createElement('span');
    hintEl.className = 'insrc-hint';
    hintEl.style.visibility = 'hidden';
    bar.appendChild(btn);
    bar.appendChild(hintEl);

    threadsEl = document.createElement('div');
    threadsEl.id = 'insrc-threads';
    threadsEl.className = 'insrc-threads';
    threadsEl.addEventListener('click', onThreadsClick);

    document.body.appendChild(bar);
    document.body.appendChild(threadsEl);
    renderComments(global.__insrcInitialComments || []);
  }

  global.insrcRenderComments = renderComments;
  global.insrcInstallCommentLayer = install;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install);
  } else {
    install();
  }
})(this);
