/*
 * insrc review panel — bundled markdown -> HTML renderer (Story S002 / t4).
 *
 * A small, self-contained, dependency-free markdown renderer shipped as a LOCAL
 * plugin resource (no CDN, no network fetch). The Kotlin content view inlines
 * this script into the JCEF page and calls `window.insrcRenderMarkdown(md)` with
 * the daemon-provided renderedMarkdown string; the artifact's .md remains the
 * single source of truth (this only presents it, read-only — it authors no
 * second copy).
 *
 * It escapes all HTML first (the input is treated as untrusted text), then
 * applies a conservative subset of CommonMark: ATX headings, fenced + inline
 * code, bold/italic, links (http/https/relative only), unordered/ordered lists,
 * blockquotes, horizontal rules, and paragraphs.
 */
(function (global) {
  'use strict';

  function escapeHtml(s) {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Inline spans, applied to already-HTML-escaped text.
  function renderInline(text) {
    // inline code first (so its content is not further formatted)
    var out = text.replace(/`([^`]+)`/g, function (_, code) {
      return '<code>' + code + '</code>';
    });
    // links [label](url) — allow only http(s) or relative (no javascript:, data:)
    out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (m, label, url) {
      if (/^(https?:\/\/|\/|\.\/|#)/.test(url)) {
        return '<a href="' + url + '">' + label + '</a>';
      }
      return m; // leave a suspicious URL as literal text
    });
    // bold then italic
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
    return out;
  }

  // Stable slug for a heading id (Story S003 / t3): lowercase, strip inline
  // markdown markers + any tags, non-alnum -> single hyphen, trimmed. Purely
  // additive — it feeds the id/section-path attributes below and changes no
  // existing output.
  function slugify(text) {
    return String(text == null ? '' : text)
      .toLowerCase()
      .replace(/[`*_~]/g, '')
      .replace(/<[^>]*>/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function renderMarkdown(md) {
    var src = String(md == null ? '' : md).replace(/\r\n?/g, '\n');
    var lines = src.split('\n');
    var html = [];
    var i = 0;
    var listType = null; // 'ul' | 'ol' | null
    var para = [];

    // Heading anchoring state (Story S003 / t3), reset per render call:
    // a stack of open headings gives each heading its breadcrumb section path,
    // and a per-slug counter makes duplicate headings get a stable ordinal id.
    var headingStack = []; // [{ level, title }]
    var slugCounts = {};   // baseSlug -> times seen

    function headingId(title) {
      var base = slugify(title) || 'section';
      var n = slugCounts[base] || 0;
      slugCounts[base] = n + 1;
      return n === 0 ? base : base + '-' + n;
    }
    function sectionPathFor(level, title) {
      while (headingStack.length && headingStack[headingStack.length - 1].level >= level) {
        headingStack.pop();
      }
      headingStack.push({ level: level, title: title });
      return headingStack.map(function (e) { return e.title; }).join(' > ');
    }

    function flushPara() {
      if (para.length) {
        html.push('<p>' + renderInline(escapeHtml(para.join(' '))) + '</p>');
        para = [];
      }
    }
    function closeList() {
      if (listType) { html.push('</' + listType + '>'); listType = null; }
    }

    while (i < lines.length) {
      var line = lines[i];

      // fenced code block
      var fence = /^```(.*)$/.exec(line);
      if (fence) {
        flushPara(); closeList();
        var buf = [];
        i++;
        while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++; }
        i++; // skip closing fence
        html.push('<pre><code>' + escapeHtml(buf.join('\n')) + '</code></pre>');
        continue;
      }

      // blank line
      if (/^\s*$/.test(line)) { flushPara(); closeList(); i++; continue; }

      // horizontal rule
      if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) {
        flushPara(); closeList(); html.push('<hr>'); i++; continue;
      }

      // heading
      var h = /^(#{1,6})\s+(.*)$/.exec(line);
      if (h) {
        flushPara(); closeList();
        var level = h[1].length;
        var title = h[2].trim();
        var id = headingId(title);
        var path = sectionPathFor(level, title);
        html.push(
          '<h' + level + ' id="' + id + '" data-section-path="' + escapeHtml(path) + '">' +
          renderInline(escapeHtml(title)) + '</h' + level + '>'
        );
        i++; continue;
      }

      // blockquote
      if (/^\s*>\s?/.test(line)) {
        flushPara(); closeList();
        var q = [];
        while (i < lines.length && /^\s*>\s?/.test(lines[i])) { q.push(lines[i].replace(/^\s*>\s?/, '')); i++; }
        html.push('<blockquote>' + renderInline(escapeHtml(q.join(' '))) + '</blockquote>');
        continue;
      }

      // unordered list item
      var ul = /^\s*[-*+]\s+(.*)$/.exec(line);
      if (ul) {
        flushPara();
        if (listType !== 'ul') { closeList(); html.push('<ul>'); listType = 'ul'; }
        html.push('<li>' + renderInline(escapeHtml(ul[1])) + '</li>');
        i++; continue;
      }

      // ordered list item
      var ol = /^\s*\d+\.\s+(.*)$/.exec(line);
      if (ol) {
        flushPara();
        if (listType !== 'ol') { closeList(); html.push('<ol>'); listType = 'ol'; }
        html.push('<li>' + renderInline(escapeHtml(ol[1])) + '</li>');
        i++; continue;
      }

      // paragraph text (accumulate)
      closeList();
      para.push(line.trim());
      i++;
    }
    flushPara(); closeList();
    return html.join('\n');
  }

  global.insrcRenderMarkdown = renderMarkdown;
})(this);
