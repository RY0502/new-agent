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

  // Sniff for JSON block by finding first brace/bracket
  const firstBrace = cleaned.indexOf("{");
  const firstBracket = cleaned.indexOf("[");
  const start = (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) ? firstBrace : firstBracket;

  if (start === -1) {
    try { return JSON.parse(cleaned); } catch (e) { return null; }
  }

  // Find the last possible JSON end character
  const lastBrace = cleaned.lastIndexOf("}");
  const lastBracket = cleaned.lastIndexOf("]");
  const end = Math.max(lastBrace, lastBracket);

  if (end > start) {
    // LLM robustness: Try shrinking the string from the end to find the first valid JSON object.
    // This handles accidental trailing characters (like extra braces or prose) thrown in by the model.
    for (let i = end; i >= start; i--) {
      const char = cleaned[i];
      if (char === "}" || char === "]") {
        const candidate = cleaned.substring(start, i + 1);
        try { return JSON.parse(candidate); } catch (e) { }
      }
    }
  }

  try { return JSON.parse(cleaned); } catch (e) { return null; }
}

function coerceToNumber(value: any): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const raw = value.trim().toLowerCase();
    if (!raw) return 0;

    const unitMatch = raw.match(/^(-?[\d,.]+)\s*([kmbt%])?$/i);
    if (unitMatch) {
      const n = parseFloat(unitMatch[1].replace(/,/g, ""));
      if (!Number.isFinite(n)) return 0;
      const u = unitMatch[2];
      if (u === "k") return n * 1e3;
      if (u === "m") return n * 1e6;
      if (u === "b") return n * 1e9;
      if (u === "t") return n * 1e12;
      if (u === "%") return n;
      return n;
    }

    const cleaned = raw.replace(/[^\d.-]/g, "");
    const parsed = parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
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
      min-height: 44px;
    }
    .header:hover { background: rgba(79, 70, 229, 0.05); }
    .label { font-size: 11px; font-weight: 800; text-transform: uppercase; color: #a5b4fc; letter-spacing: 0.1em; display: flex; align-items: center; gap: 8px; }
    .label::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: #a5b4fc; box-shadow: 0 0 10px #a5b4fc; }
    @media (prefers-color-scheme: dark) { .label { color: #a5b4fc; } .label::before { background: #a5b4fc; box-shadow: 0 0 10px #a5b4fc; } }

    .chevron {
      width: 20px; height: 20px; color: #64748b;
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
    
    @media (max-width: 768px) {
      :host { margin-bottom: 16px; }
      .header { padding: 10px 16px; }
      .content { gap: 6px; padding: 0 16px; }
      .container.open .content { padding: 0 16px 16px 16px; }
      .badge { padding: 5px 12px; font-size: 9px; }
    }
    
    @media (max-width: 375px) {
      .header { padding: 8px 12px; }
      .content { gap: 4px; padding: 0 12px; }
      .container.open .content { padding: 0 12px 12px 12px; }
    }
  `;
  declare text: string;
  declare isOpen: boolean;
  constructor() { super(); this.isOpen = false; }
  render() {
    const raw = (this.text || (this.textContent || "")).replace(/\\n/g, "\n");
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
      background: linear-gradient(135deg, #f8fafc, #cbd5e1);
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
      background: rgba(255, 255, 255, 0.05); backdrop-filter: blur(40px);
      border: 1px solid rgba(255, 255, 255, 0.08);
      box-shadow: 0 20px 50px -12px rgba(0, 0, 0, 0.2), 0 8px 20px -6px rgba(0, 0, 0, 0.1);
      transition: all 0.6s cubic-bezier(0.16, 1, 0.3, 1); overflow: hidden;
    }
    .card::before { content: ""; position: absolute; top: 0; left: 0; right: 0; height: 5px; background: linear-gradient(90deg, #4f46e5, #9333ea, #ec4899); opacity: 0.8; }
    .content { color: #f1f5f9; font-size: 17px; line-height: 1.85; }
    @media (prefers-color-scheme: dark) { .card { background: rgba(15, 23, 42, 0.6); border-color: rgba(255, 255, 255, 0.08); } .content { color: #f1f5f9; } }
    
    @media (max-width: 768px) {
      :host { margin: 16px 0; }
      .card { border-radius: 24px; padding: 24px 28px; }
      .content { font-size: 15px; line-height: 1.75; }
    }
    
    @media (max-width: 375px) {
      .card { border-radius: 20px; padding: 20px 24px; }
      .content { font-size: 14px; line-height: 1.7; }
    }
  `;
  render() { return html`<div class="card"><div class="content"><slot></slot></div></div>`; }
}

class A2uiTable extends A2uiBase {
  static properties = { data: { type: String } };
  static styles = css`
    :host { 
      display: block; margin: 28px 0; overflow-x: auto; 
      -webkit-overflow-scrolling: touch;
      scrollbar-width: thin;
      scrollbar-color: rgba(165, 180, 252, 0.3) rgba(255, 255, 255, 0.05);
    }
    :host::-webkit-scrollbar { height: 8px; }
    :host::-webkit-scrollbar-track { background: rgba(255, 255, 255, 0.05); border-radius: 4px; }
    :host::-webkit-scrollbar-thumb { background: rgba(165, 180, 252, 0.3); border-radius: 4px; }
    :host::-webkit-scrollbar-thumb:hover { background: rgba(165, 180, 252, 0.5); }
    
    .outer-wrap {
      border-radius: 28px; border: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(255, 255, 255, 0.04); backdrop-filter: blur(32px);
      overflow: hidden; box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.2);
    }
    table { width: 100%; border-collapse: collapse; font-size: 15px; }
    thead th { background: rgba(255, 255, 255, 0.06); color: #f8fafc; font-weight: 800; text-align: left; padding: 20px 24px; border-bottom: 2px solid rgba(255, 255, 255, 0.05); white-space: nowrap; }
    tbody td { padding: 20px 24px; color: #cbd5e1; border-bottom: 1px solid rgba(255, 255, 255, 0.03); }
    tbody tr:nth-child(even) { background: rgba(255, 255, 255, 0.02); }
    tbody tr:hover { background: rgba(79, 70, 229, 0.08); }
    @media (prefers-color-scheme: dark) {
      .outer-wrap { background: rgba(15, 23, 42, 0.5); border-color: rgba(255, 255, 255, 0.07); }
      thead th { background: rgba(30, 41, 59, 0.6); color: #f8fafc; border-bottom-color: rgba(255, 255, 255, 0.08); }
      tbody td { color: #cbd5e1; border-bottom-color: rgba(255, 255, 255, 0.04); }
      tbody tr:nth-child(even) { background: rgba(255, 255, 255, 0.02); }
      tbody tr:hover { background: rgba(79, 70, 229, 0.12); }
    }
    
    @media (max-width: 768px) {
      :host { margin: 20px 0; }
      .outer-wrap { border-radius: 20px; }
      table { font-size: 13px; }
      thead th { padding: 14px 16px; font-size: 12px; }
      tbody td { padding: 14px 16px; }
    }
    
    @media (max-width: 375px) {
      :host { margin: 16px 0; }
      .outer-wrap { border-radius: 16px; }
      table { font-size: 12px; }
      thead th { padding: 12px 12px; font-size: 11px; }
      tbody td { padding: 12px 12px; }
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
    :host { display: block; margin: 12px 0; }
    .bar { display: flex; gap: 4px; padding: 4px; background: rgba(255, 255, 255, 0.05); border-radius: 12px; margin-bottom: 12px; backdrop-filter: blur(24px); border: 1px solid rgba(255, 255, 255, 0.1); overflow-x: auto; -webkit-overflow-scrolling: touch; }
    .tab { flex: 1; min-width: fit-content; padding: 8px 12px; border-radius: 8px; border: none; background: transparent; color: rgba(255, 255, 255, 0.5); font-size: 13px; font-weight: 800; cursor: pointer; transition: all 0.5s ease; min-height: 44px; display: flex; align-items: center; justify-content: center; }
    .tab:hover { color: #ffffff; background: rgba(255, 255, 255, 0.08); }
    .tab.active { background: rgba(255, 255, 255, 0.12); color: #a5b4fc; box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3); }
    .content-area { padding: 16px 20px; background: rgba(255, 255, 255, 0.05); border-radius: 16px; border: 1px solid rgba(255, 255, 255, 0.08); font-size: 14px; line-height: 1.6; color: #e2e8f0; min-height: 100px; backdrop-filter: blur(32px); white-space: pre-wrap; }
    @media (prefers-color-scheme: dark) { 
      .bar { background: rgba(255, 255, 255, 0.06); border-color: rgba(255, 255, 255, 0.08); } 
      .tab { color: rgba(255, 255, 255, 0.5); } 
      .tab:hover { color: #ffffff; } 
      .tab.active { background: rgba(255, 255, 255, 0.12); color: #a5b4fc; } 
      .content-area { background: rgba(15, 23, 42, 0.45); border-color: rgba(255, 255, 255, 0.06); color: #e2e8f0; } 
    }
    
    @media (max-width: 768px) {
      .bar { flex-wrap: nowrap; }
      .tab { padding: 10px 16px; font-size: 12px; white-space: nowrap; }
      .content-area { padding: 14px 16px; font-size: 13px; }
    }
    
    @media (max-width: 375px) {
      .tab { padding: 8px 12px; font-size: 11px; }
      .content-area { padding: 12px 14px; font-size: 12px; }
    }
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
    
    // Fallback logic if parsing failed or items is empty but we have content
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
      background: rgba(15, 23, 42, 0.8); backdrop-filter: blur(12px);
      color: #94a3b8; padding: 14px 28px; font-size: 10px; font-weight: 800;
      text-transform: uppercase; letter-spacing: 0.1em;
      border-bottom: 1px solid rgba(255,255,255,0.06); display: flex; 
      justify-content: space-between; align-items: center; 
    }
    .lang-badge { padding: 5px 12px; border-radius: 8px; background: rgba(165, 180, 252, 0.1); color: #a5b4fc; }
    pre { 
      background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(40px); padding: 28px; margin: 0; 
      overflow: auto; font-size: 14px; line-height: 1.7; 
      border: 1px solid rgba(255, 255, 255, 0.08); border-top: none;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: thin;
      scrollbar-color: rgba(165, 180, 252, 0.3) rgba(255, 255, 255, 0.05);
    }
    pre::-webkit-scrollbar { height: 8px; width: 8px; }
    pre::-webkit-scrollbar-track { background: rgba(255, 255, 255, 0.05); }
    pre::-webkit-scrollbar-thumb { background: rgba(165, 180, 252, 0.3); border-radius: 4px; }
    pre::-webkit-scrollbar-thumb:hover { background: rgba(165, 180, 252, 0.5); }
    code { font-family: "JetBrains Mono", ui-monospace, monospace; color: #e2e8f0; }
    @media (prefers-color-scheme: dark) {
      .header { background: rgba(15, 23, 42, 0.8); color: #94a3b8; border-bottom-color: rgba(255,255,255,0.06); }
      .lang-badge { background: rgba(165, 180, 252, 0.1); color: #a5b4fc; }
      pre { background: rgba(15, 23, 42, 0.6); border-color: rgba(255, 255, 255, 0.08); }
      code { color: #e2e8f0; }
    }
    
    @media (max-width: 768px) {
      :host { margin: 20px 0; border-radius: 20px; }
      .header { padding: 12px 20px; font-size: 9px; }
      .lang-badge { padding: 4px 10px; font-size: 10px; }
      pre { padding: 20px; font-size: 13px; }
    }
    
    @media (max-width: 375px) {
      :host { margin: 16px 0; border-radius: 16px; }
      .header { padding: 10px 16px; }
      pre { padding: 16px; font-size: 12px; }
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
    :host { display: block; margin: 12px 0; }
    ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
    li { display: flex; align-items: flex-start; gap: 12px; padding: 12px 16px; background: rgba(255, 255, 255, 0.05); border-radius: 16px; border: 1px solid rgba(255, 255, 255, 0.08); font-size: 14px; color: #cbd5e1; backdrop-filter: blur(24px); transition: all 0.5s ease; }
    li:hover { background: rgba(255, 255, 255, 0.12); transform: translateX(8px); }
    @media (prefers-color-scheme: dark) { li { background: rgba(255, 255, 255, 0.05); border-color: rgba(255, 255, 255, 0.08); color: #cbd5e1; } }
    
    @media (max-width: 768px) {
      ul { gap: 6px; }
      li { padding: 10px 14px; font-size: 13px; border-radius: 14px; gap: 10px; }
      li:hover { transform: translateX(4px); }
    }
    
    @media (max-width: 375px) {
      li { padding: 8px 12px; font-size: 12px; border-radius: 12px; }
    }
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

class A2uiImage extends A2uiBase {
  static styles = css`
    :host { display: block; margin: 28px 0; overflow: hidden; border-radius: 28px; box-shadow: 0 20px 50px -12px rgba(0, 0, 0, 0.25); position: relative; }
    .image-container { position: relative; width: 100%; background: rgba(0,0,0,0.05); border: 1px solid rgba(255, 255, 255, 0.08); }
    .image-container.hero { min-height: 400px; }
    .image-container.thumbnail { min-height: 150px; max-height: 200px; }
    .image-container.icon { min-height: 64px; max-height: 100px; }
    .image-container.content { min-height: 200px; max-height: 400px; }
    
    img { width: 100%; height: 100%; display: block; }
    img.cover { object-fit: cover; }
    img.contain { object-fit: contain; }
    img.fill { object-fit: fill; }
    
    .loading { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(15, 23, 42, 0.6); color: white; }
    .error-wrap { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; background: rgba(15, 23, 42, 0.9); color: white; padding: 20px; text-align: center; gap: 12px; }
    .error-icon { font-size: 48px; opacity: 0.5; }
    
    @media (prefers-color-scheme: dark) { 
      .image-container { background: rgba(0,0,0,0.3); border-color: rgba(255, 255, 255, 0.08); } 
    }
    
    @media (max-width: 768px) {
      :host { margin: 20px 0; border-radius: 20px; }
      .image-container.hero { min-height: 250px; }
      .image-container.thumbnail { min-height: 120px; max-height: 150px; }
      .image-container.content { min-height: 150px; max-height: 300px; }
    }
    
    @media (max-width: 375px) {
      :host { margin: 16px 0; border-radius: 16px; }
      .image-container.hero { min-height: 200px; }
      .image-container.thumbnail { min-height: 100px; max-height: 120px; }
    }
  `;
  render() {
    const src = (this.textContent || "").trim();
    console.log('[A2uiImage] Raw source:', src);
    console.log('[A2uiImage] Source length:', src.length);
    const parsed = safeParseJSON(src);
    console.log('[A2uiImage] Parsed JSON:', parsed);
    const imageUrl = parsed?.component?.Image?.url?.literalString;
    console.log('[A2uiImage] Image URL:', imageUrl);
    const fit = parsed?.component?.Image?.fit || "cover";
    const usageHint = parsed?.component?.Image?.usageHint || "content";
    
    if (!imageUrl) {
      console.error('[A2uiImage] No valid image URL found in data');
      return html`<div class="image-container ${usageHint}"><div class="error-wrap"><div class="error-icon">🖼️</div><div>No valid image URL provided</div></div></div>`;
    }
    
    return html`
      <div class="image-container ${usageHint}">
        <img 
          src="${imageUrl}" 
          alt="Image" 
          class="${fit}" 
          loading="lazy" 
          crossorigin="anonymous"
          @load=${() => console.log('[A2uiImage] Image loaded successfully:', imageUrl)}
          @error=${(e: Event) => {
            console.error('[A2uiImage] Failed to load image:', imageUrl, e);
            const target = e.target as HTMLImageElement;
            target.style.display = 'none';
            const container = target.parentElement;
            if (container) {
              container.innerHTML = '<div class="error-wrap"><div class="error-icon">⚠️</div><div>Failed to load image</div></div>';
            }
          }} 
        />
      </div>
    `;
  }
}

class A2uiVideo extends A2uiBase {
  static properties = { data: { type: String } };
  static styles = css`
    :host { display: block; margin: 28px 0; overflow: hidden; border-radius: 28px; box-shadow: 0 20px 50px -12px rgba(0, 0, 0, 0.25); position: relative; }
    .aspect-ratio-wrap { position: relative; width: 100%; padding-top: 56.25%; background: rgba(0,0,0,0.4); }
    iframe { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none; }
    .error-wrap { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(15, 23, 42, 0.9); color: white; padding: 20px; text-align: center; }
  `;
  declare data: string | undefined;
  render() {
    const src = (this.data || this.textContent || "").trim();
    const parsed = safeParseJSON(src);
    const videoUrl = parsed?.component?.Video?.url?.literalString;
    if (!videoUrl) {
      return html`<div class="aspect-ratio-wrap"><div class="error-wrap">No valid video URL provided</div></div>`;
    }
    return html`
      <div class="aspect-ratio-wrap">
        <iframe src="${videoUrl}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
      </div>
    `;
  }
}

class A2uiChart extends A2uiBase {
  static properties = { data: { type: String } };
  static styles = css`
    :host { display: block; margin: 20px 0; }
    .wrap { background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 18px; padding: 16px; }
    .title { font-size: 14px; font-weight: 800; color: #f8fafc; margin-bottom: 12px; }
    .axes { display: grid; grid-template-columns: repeat(var(--count), minmax(0, 1fr)); gap: 10px; align-items: end; height: 220px; }
    .bar-col { display: flex; flex-direction: column; align-items: center; gap: 8px; }
    .bar { width: 100%; border-radius: 10px 10px 6px 6px; background: linear-gradient(180deg, #6366f1, #22d3ee); min-height: 2px; }
    .point { width: 8px; height: 8px; border-radius: 9999px; background: #22d3ee; box-shadow: 0 0 0 2px rgba(34, 211, 238, 0.3); }
    .label { font-size: 11px; color: #cbd5e1; text-align: center; word-break: break-word; }
    .value { font-size: 10px; color: #94a3b8; }
    .line-wrap { position: relative; height: 220px; }
    svg { width: 100%; height: 100%; }
    .line-path { fill: none; stroke: #22d3ee; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
    .line-grid { stroke: rgba(148, 163, 184, 0.2); stroke-width: 1; }
    .xlabels { display: grid; grid-template-columns: repeat(var(--count), minmax(0, 1fr)); gap: 10px; margin-top: 8px; }
  `;
  declare data: string | undefined;
  render() {
    const src = (this.data || this.textContent || "").trim();
    const parsed = safeParseJSON(src);
    const chart = parsed?.component?.Chart || parsed?.Chart || parsed;
    const chartType = chart?.type === "line" ? "line" : "bar";
    const title = chart?.title || "Chart";
    const points = Array.isArray(chart?.data) ? chart.data : [];

    if (!points.length) {
      return html`<div class="wrap"><div class="title">${title}</div><div class="label">No chart data available</div></div>`;
    }

    const values = points.map((p: any) => coerceToNumber(p?.value));
    const maxValue = Math.max(...values, 1);
    const count = String(points.length);

    if (chartType === "line") {
      const width = 1000;
      const height = 220;
      const xStep = points.length > 1 ? width / (points.length - 1) : width;
      const coords = points.map((p: any, idx: number) => {
        const x = points.length > 1 ? idx * xStep : width / 2;
        const y = height - (coerceToNumber(p?.value) / maxValue) * (height - 12) - 6;
        return `${x},${y}`;
      }).join(" ");

      return html`
        <div class="wrap" style=${`--count:${count}`}>
          <div class="title">${title}</div>
          <div class="line-wrap">
            <svg viewBox="0 0 1000 220" preserveAspectRatio="none">
              <line class="line-grid" x1="0" y1="110" x2="1000" y2="110"></line>
              <polyline class="line-path" points="${coords}"></polyline>
            </svg>
          </div>
          <div class="xlabels">
            ${points.map((p: any) => html`<div class="label">${String(p?.label || "")}</div>`)}
          </div>
        </div>
      `;
    }

    return html`
      <div class="wrap" style=${`--count:${count}`}>
        <div class="title">${title}</div>
        <div class="axes">
          ${points.map((p: any) => {
            const v = coerceToNumber(p?.value);
            const h = `${Math.max(2, Math.round((v / maxValue) * 100))}%`;
            return html`
              <div class="bar-col">
                <div class="value">${v}</div>
                <div class="bar" style=${`height:${h}`}></div>
                <div class="label">${String(p?.label || "")}</div>
              </div>
            `;
          })}
        </div>
      </div>
    `;
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
    
    @media (max-width: 768px) {
      :host { margin: 20px 0; }
      .header { margin-bottom: 12px; }
      .label { font-size: 14px; }
      .pct { font-size: 11px; padding: 4px 10px; }
      .track { height: 14px; }
    }
    
    @media (max-width: 375px) {
      :host { margin: 16px 0; }
      .label { font-size: 13px; }
      .track { height: 12px; }
    }
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
class A2uiChartLegacy extends A2uiChart { }

const mapping = {
  "a2-status": A2uiStatus, "a2ui-status": A2uiStatusLegacy,
  "a2-section": A2uiSection, "a2ui-section": A2uiSectionLegacy,
  "a2-result": A2uiResult, "a2ui-result": A2uiResultLegacy,
  "a2-table": A2uiTable, "a2ui-table": A2uiTableLegacy,
  "a2-tabs": A2uiTabs, "a2ui-tabs": A2uiTabsLegacy,
  "a2-code": A2uiCode, "a2ui-code": A2uiCodeLegacy,
  "a2-list": A2uiList, "a2ui-list": A2uiListLegacy,
  "a2-progress": A2uiProgress, "a2ui-progress": A2uiProgressLegacy,
  "a2-chart": A2uiChart, "a2ui-chart": A2uiChartLegacy,
  "a2-image": A2uiImage,
  "a2-video": A2uiVideo
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
