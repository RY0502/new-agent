import { LitElement, css, html } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";

/**
 * Ultimate A2UI JSON Parser
 */
function safeParseJSON(text: string) {
  if (!text) return null;

  let unescaped = text;
  try {
    const doc = new DOMParser().parseFromString(text, 'text/html');
    unescaped = doc.documentElement.textContent || text;
  } catch (e) { }

  let cleaned = unescaped.replace(/[\u200b-\u200d\ufeff]/g, '').trim();

  // Sniff for JSON block
  const firstBrace = cleaned.indexOf("{");
  const firstBracket = cleaned.indexOf("[");
  const start = (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) ? firstBrace : firstBracket;
  const lastBrace = cleaned.lastIndexOf("}");
  const lastBracket = cleaned.lastIndexOf("]");
  const end = (lastBrace !== -1 && (lastBracket === -1 || lastBrace > lastBracket)) ? lastBrace : lastBracket;

  if (start !== -1 && end !== -1 && end > start) {
    const jsonStr = cleaned.substring(start, end + 1);
    try { return JSON.parse(jsonStr); } catch (e) { }
  }

  try { return JSON.parse(cleaned); } catch (e) { return null; }
}

/**
 * Base class with MutationObserver for streaming reactivity.
 */
class A2uiBase extends LitElement {
  private _observer?: MutationObserver;
  connectedCallback() {
    super.connectedCallback();
    this._observer = new MutationObserver(() => this.requestUpdate());
    this._observer.observe(this, { childList: true, characterData: true, subtree: true });
  }
  disconnectedCallback() {
    this._observer?.disconnect();
    super.disconnectedCallback();
  }
}

class A2uiStatus extends A2uiBase {
  static properties = { text: { type: String }, isOpen: { type: Boolean } };
  static styles = css`
    :host { display: block; margin-bottom: 20px; }
    .container {
      background: rgba(255, 255, 255, 0.4); backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.3); border-radius: 20px; overflow: hidden;
      transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @media (prefers-color-scheme: dark) { .container { background: rgba(255, 255, 255, 0.05); border-color: rgba(255, 255, 255, 0.08); } }
    
    .header {
      padding: 12px 20px; display: flex; align-items: center; justify-content: space-between;
      cursor: pointer; user-select: none; transition: background 0.3s ease;
    }
    .header:hover { background: rgba(79, 70, 229, 0.05); }
    .label { font-size: 11px; font-weight: 800; text-transform: uppercase; color: #4f46e5; letter-spacing: 0.1em; display: flex; align-items: center; gap: 8px; }
    .label::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: #4f46e5; box-shadow: 0 0 10px #4f46e5; }
    @media (prefers-color-scheme: dark) { .label { color: #a5b4fc; } .label::before { background: #a5b4fc; box-shadow: 0 0 10px #a5b4fc; } }

    .chevron {
      width: 14px; height: 14px; color: #64748b;
      transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .container.open .chevron { transform: rotate(180deg); }

    .content {
      max-height: 0; overflow: hidden; transition: max-height 0.4s cubic-bezier(0.16, 1, 0.3, 1);
      display: flex; flex-wrap: wrap; gap: 8px; padding: 0 20px;
    }
    .container.open .content { max-height: 500px; padding: 0 20px 20px 20px; }

    .badge {
      display: inline-flex; align-items: center; border-radius: 12px;
      padding: 6px 14px; font-size: 10px; font-weight: 700;
      background: rgba(255, 255, 255, 0.5); color: #475569;
      border: 1px solid rgba(0, 0, 0, 0.05); box-shadow: 0 2px 5px rgba(0,0,0,0.02);
    }
    @media (prefers-color-scheme: dark) { .badge { background: rgba(255, 255, 255, 0.03); color: #94a3b8; border-color: rgba(255, 255, 255, 0.05); } }
  `;
  declare text: string;
  declare isOpen: boolean;
  constructor() { super(); this.isOpen = false; }
  render() {
    const raw = this.text || (this.textContent || "");
    const parts = raw.split(/\r?\n+/).map((p) => p.trim()).filter(Boolean);
    if (parts.length === 0) return html``;
    return html`
      <div class="container ${this.isOpen ? "open" : ""}">
        <div class="header" @click=${() => this.isOpen = !this.isOpen}>
          <span class="label">Thinking</span>
          <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </div>
        <div class="content">
          ${parts.map((p) => html`<span class="badge">${p}</span>`)}
        </div>
      </div>
    `;
  }
}

class A2uiSection extends A2uiBase {
  static styles = css`
    :host { display: block; margin: 32px 0 20px; }
    .container { display: flex; align-items: center; gap: 16px; }
    .dot {
      flex-shrink: 0; width: 10px; height: 10px; border-radius: 9999px;
      background: linear-gradient(135deg, #4f46e5, #9333ea);
      box-shadow: 0 0 20px rgba(79, 70, 229, 0.7);
    }
    .title {
      font-size: 21px; font-weight: 900; letter-spacing: -0.03em;
      background: linear-gradient(135deg, #0f172a, #334155);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    }
    @media (prefers-color-scheme: dark) { .title { background: linear-gradient(135deg, #f8fafc, #cbd5e1); -webkit-background-clip: text; } }
  `;
  render() { return html`<div class="container"><span class="dot"></span><span class="title"><slot></slot></span></div>`; }
}

class A2uiResult extends A2uiBase {
  static styles = css`
    :host { display: block; margin: 20px 0; }
    .card {
      position: relative; border-radius: 32px; padding: 32px 36px;
      background: rgba(255, 255, 255, 0.65); backdrop-filter: blur(40px);
      border: 1px solid rgba(255, 255, 255, 0.5);
      box-shadow: 0 20px 50px -12px rgba(0, 0, 0, 0.06), 0 8px 20px -6px rgba(0, 0, 0, 0.04);
      transition: all 0.6s cubic-bezier(0.16, 1, 0.3, 1); overflow: hidden;
    }
    .card::before { content: ""; position: absolute; top: 0; left: 0; right: 0; height: 5px; background: linear-gradient(90deg, #4f46e5, #9333ea, #ec4899); opacity: 0.8; }
    .content { color: #1e293b; font-size: 17px; line-height: 1.85; }
    @media (prefers-color-scheme: dark) { .card { background: rgba(15, 23, 42, 0.6); border-color: rgba(255, 255, 255, 0.08); } .content { color: #f1f5f9; } }
  `;
  render() { return html`<div class="card"><div class="content"><slot></slot></div></div>`; }
}

class A2uiTable extends A2uiBase {
  static properties = { data: { type: String } };
  static styles = css`
    :host { display: block; margin: 28px 0; overflow-x: auto; }
    .outer-wrap {
      border-radius: 28px; border: 1px solid rgba(255, 255, 255, 0.4);
      background: rgba(255, 255, 255, 0.6); backdrop-filter: blur(32px);
      overflow: hidden; box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.1);
    }
    table { width: 100%; border-collapse: collapse; font-size: 15px; }
    thead th { background: rgba(255, 255, 255, 0.4); color: #0f172a; font-weight: 800; text-align: left; padding: 20px 24px; border-bottom: 2px solid rgba(0, 0, 0, 0.03); white-space: nowrap; }
    tbody td { padding: 20px 24px; color: #334155; border-bottom: 1px solid rgba(0, 0, 0, 0.03); }
    tbody tr:nth-child(even) { background: rgba(255, 255, 255, 0.2); }
    tbody tr:hover { background: rgba(79, 70, 229, 0.08); }
    @media (prefers-color-scheme: dark) {
      .outer-wrap { background: rgba(15, 23, 42, 0.5); border-color: rgba(255, 255, 255, 0.07); }
      thead th { background: rgba(30, 41, 59, 0.6); color: #f8fafc; border-bottom-color: rgba(255, 255, 255, 0.08); }
      tbody td { color: #cbd5e1; border-bottom-color: rgba(255, 255, 255, 0.04); }
      tbody tr:nth-child(even) { background: rgba(255, 255, 255, 0.02); }
      tbody tr:hover { background: rgba(79, 70, 229, 0.12); }
    }
  `;
  declare data: string | undefined;

  normalizeData(parsed: any) {
    if (!parsed) return null;
    if (parsed.columns && parsed.rows && Array.isArray(parsed.columns) && Array.isArray(parsed.rows)) return { columns: parsed.columns, rows: parsed.rows };
    let list = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.items) ? parsed.items : (Array.isArray(parsed.data) ? parsed.data : null));
    if (!list || list.length === 0) return null;
    const columns = Object.keys(list[0]);
    const rows = list.map((item: any) => columns.map(k => item[k]));
    return { columns, rows };
  }

  render() {
    const src = (this.data || this.textContent || "").trim();
    const parsed = safeParseJSON(src);
    const tbl = this.normalizeData(parsed);
    if (tbl) {
      return html`<div class="outer-wrap"><table>
        <thead><tr>${tbl.columns.map((c: string) => html`<th>${c}</th>`)}</tr></thead>
        <tbody>${tbl.rows.map((r: any[]) => html`<tr>${(Array.isArray(r) ? r : []).map((c) => html`<td>${c}</td>`)}</tr>`)}</tbody>
      </table></div>`;
    }
    return html`<div class="outer-wrap" style="padding:24px"><slot></slot></div>`;
  }
}

class A2uiTabs extends A2uiBase {
  static properties = { data: { type: String }, active: { type: Number } };
  static styles = css`
    :host { display: block; margin: 28px 0; }
    .bar { display: flex; gap: 8px; padding: 8px; background: rgba(255, 255, 255, 0.35); border-radius: 22px; margin-bottom: 28px; backdrop-filter: blur(24px); border: 1px solid rgba(255, 255, 255, 0.3); }
    .tab { flex: 1; padding: 12px 20px; border-radius: 16px; border: none; background: transparent; color: #64748b; font-size: 14px; font-weight: 800; cursor: pointer; transition: all 0.5s ease; }
    .tab.active { background: white; color: #4f46e5; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1); }
    .content-area { padding: 40px; background: rgba(255, 255, 255, 0.55); border-radius: 36px; border: 1px solid rgba(255, 255, 255, 0.4); font-size: 16.5px; line-height: 1.9; color: #334155; min-height: 180px; backdrop-filter: blur(32px); }
    @media (prefers-color-scheme: dark) { .bar { background: rgba(255, 255, 255, 0.06); border-color: rgba(255, 255, 255, 0.08); } .tab.active { background: rgba(255, 255, 255, 0.12); color: #a5b4fc; } .content-area { background: rgba(15, 23, 42, 0.45); border-color: rgba(255, 255, 255, 0.06); color: #e2e8f0; } }
  `;
  declare data: string | undefined;
  declare active: number;
  constructor() { super(); this.active = 0; }
  render() {
    const src = (this.data || this.textContent || "").trim();
    const parsed = safeParseJSON(src);
    const items: { title: string; content: string }[] = Array.isArray(parsed?.tabItems)
      ? parsed.tabItems.map((it: any) => ({ title: String(it?.title || "Tab"), content: String(it?.content || it?.child || "") }))
      : (Array.isArray(parsed) ? (typeof parsed[0] === 'object' ? Object.keys(parsed[0]).map(k => ({ title: k, content: String(parsed[0][k]) })) : []) : []);
    if (items.length === 0) return html`<div class="content-area"><slot></slot></div>`;
    const idx = Math.max(0, Math.min(items.length - 1, this.active));
    return html`
      <div class="bar">${items.map((it, i) => html`<button class="tab ${i === idx ? "active" : ""}" @click=${() => { this.active = i; this.requestUpdate(); }}>${it.title}</button>`)}</div>
      <div class="content-area">${items[idx]?.content}</div>
    `;
  }
}

class A2uiCode extends A2uiBase {
  static properties = { language: { type: String } };
  static styles = css`
    :host { display: block; margin: 28px 0; border-radius: 28px; overflow: hidden; box-shadow: 0 20px 50px -12px rgba(0, 0, 0, 0.15); transition: transform 0.3s ease; }
    :host(:hover) { transform: translateY(-2px); }
    .header { 
      background: rgba(248, 250, 252, 0.8); backdrop-filter: blur(12px);
      color: #64748b; padding: 14px 28px; font-size: 10px; font-weight: 800;
      text-transform: uppercase; letter-spacing: 0.1em;
      border-bottom: 1px solid rgba(0,0,0,0.05); display: flex; 
      justify-content: space-between; align-items: center; 
    }
    .lang-badge { padding: 5px 12px; border-radius: 8px; background: rgba(79, 70, 229, 0.1); color: #4f46e5; }
    pre { background: rgba(255, 255, 255, 0.6); backdrop-filter: blur(40px); padding: 28px; margin: 0; overflow: auto; font-size: 14px; line-height: 1.7; border: 1px solid rgba(255, 255, 255, 0.4); border-top: none; }
    code { font-family: "JetBrains Mono", ui-monospace, monospace; color: #1e293b; }
    @media (prefers-color-scheme: dark) {
      .header { background: rgba(15, 23, 42, 0.8); color: #94a3b8; border-bottom-color: rgba(255,255,255,0.06); }
      .lang-badge { background: rgba(165, 180, 252, 0.1); color: #a5b4fc; }
      pre { background: rgba(15, 23, 42, 0.6); border-color: rgba(255, 255, 255, 0.08); }
      code { color: #e2e8f0; }
    }
  `;
  declare language: string | undefined;
  render() {
    return html`
      <div class="header">
        <span class="lang-badge">${this.language || "source"}</span>
        <span style="opacity:0.6">${(this.textContent || "").length} bytes</span>
      </div>
      <pre><code>${(this.textContent || "").trim()}</code></pre>
    `;
  }
}

class A2uiList extends A2uiBase {
  static properties = { items: { type: Array }, data: { type: String } };
  static styles = css`
    :host { display: block; margin: 20px 0; }
    ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 16px; }
    li { display: flex; align-items: flex-start; gap: 20px; padding: 22px 30px; background: rgba(255, 255, 255, 0.5); border-radius: 28px; border: 1px solid rgba(255, 255, 255, 0.4); font-size: 16px; color: #334155; backdrop-filter: blur(24px); transition: all 0.5s ease; }
    li:hover { background: rgba(255, 255, 255, 0.85); transform: translateX(12px); }
    @media (prefers-color-scheme: dark) { li { background: rgba(255, 255, 255, 0.05); border-color: rgba(255, 255, 255, 0.08); color: #cbd5e1; } }
  `;
  declare items: any[] | undefined;
  declare data: string | undefined;
  render() {
    const src = (this.data || this.textContent || "").trim();
    const parsed = safeParseJSON(src);
    const resolvedItems = Array.isArray(this.items) ? this.items : (Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.items) ? parsed.items : null));
    if (resolvedItems && resolvedItems.length > 0) return html`<ul>${resolvedItems.map((it: any) => html`<li><span style="color:#4f46e5">✦</span> <span>${String(it)}</span></li>`)}</ul>`;
    return html`<ul><slot></slot></ul>`;
  }
}

class A2uiProgress extends A2uiBase {
  static properties = { value: { type: Number }, data: { type: String } };
  static styles = css`
    :host { display: block; margin: 28px 0; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
    .label { font-size: 16px; font-weight: 800; color: #0f172a; }
    .pct { font-size: 12px; font-weight: 900; color: #4f46e5; background: rgba(255, 255, 255, 0.8); padding: 5px 12px; border-radius: 9999px; }
    .track { height: 16px; width: 100%; border-radius: 9999px; background: rgba(0, 0, 0, 0.05); overflow: hidden; position: relative; }
    .fill { height: 100%; border-radius: 9999px; background: linear-gradient(90deg, #4f46e5, #9333ea, #ec4899); transition: width 1.5s ease; }
    @media (prefers-color-scheme: dark) { .label { color: #f1f5f9; } .track { background: rgba(255, 255, 255, 0.1); } .pct { background: rgba(255, 255, 255, 0.1); color: #a5b4fc; } }
  `;
  declare value: number | undefined;
  declare data: string | undefined;
  render() {
    let v = typeof this.value === "number" ? this.value : -1;
    if (v === -1 && (this.data || this.textContent)) {
      const src = (this.data || this.textContent || "").trim();
      const num = parseFloat(src);
      if (!isNaN(num)) v = num;
    }
    if (v === -1) v = 0.33;
    const width = `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`;
    return html`<div class="header"><span class="label"><slot></slot></span><span class="pct">${width}</span></div><div class="track"><div class="fill" style=${`width:${width}`}></div></div>`;
  }
}

// Subclasses for aliases to avoid "constructor already used" error
class A2uiStatusLegacy extends A2uiStatus { }
class A2uiSectionLegacy extends A2uiSection { }
class A2uiResultLegacy extends A2uiResult { }
class A2uiTableLegacy extends A2uiTable { }
class A2uiTabsLegacy extends A2uiTabs { }
class A2uiCodeLegacy extends A2uiCode { }
class A2uiListLegacy extends A2uiList { }
class A2uiProgressLegacy extends A2uiProgress { }

const mapping = {
  "a2-status": A2uiStatus, "a2ui-status": A2uiStatusLegacy,
  "a2-section": A2uiSection, "a2ui-section": A2uiSectionLegacy,
  "a2-result": A2uiResult, "a2ui-result": A2uiResultLegacy,
  "a2-table": A2uiTable, "a2ui-table": A2uiTableLegacy,
  "a2-tabs": A2uiTabs, "a2ui-tabs": A2uiTabsLegacy,
  "a2-code": A2uiCode, "a2ui-code": A2uiCodeLegacy,
  "a2-list": A2uiList, "a2ui-list": A2uiListLegacy,
  "a2-progress": A2uiProgress, "a2ui-progress": A2uiProgressLegacy
};

Object.entries(mapping).forEach(([tag, klass]) => {
  if (typeof window !== "undefined" && !customElements.get(tag)) {
    try {
      customElements.define(tag, klass as any);
    } catch (e) {
      console.warn(`Failed to register ${tag}:`, e);
    }
  }
});
