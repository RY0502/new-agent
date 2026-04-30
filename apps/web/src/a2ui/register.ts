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
    .wrap {
      background: linear-gradient(135deg, rgba(99, 102, 241, 0.04), rgba(168, 85, 247, 0.03));
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 22px; padding: 20px;
      backdrop-filter: blur(24px);
      box-shadow: 0 10px 30px -12px rgba(0, 0, 0, 0.25);
    }
    .header { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
    .title { font-size: 15px; font-weight: 800; color: #f8fafc; letter-spacing: -0.01em; }
    .subtitle { font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.1em; }
    .axes { display: grid; grid-template-columns: repeat(var(--count), minmax(0, 1fr)); gap: 10px; align-items: end; height: 220px; }
    .bar-col { display: flex; flex-direction: column; align-items: center; gap: 8px; height: 100%; justify-content: flex-end; }
    .bar {
      width: 100%; border-radius: 10px 10px 6px 6px;
      background: linear-gradient(180deg, #818cf8, #6366f1 50%, #4f46e5);
      min-height: 2px;
      box-shadow: 0 4px 12px -4px rgba(99, 102, 241, 0.5);
      transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
      position: relative;
    }
    .bar-col:hover .bar { background: linear-gradient(180deg, #a5b4fc, #818cf8 50%, #6366f1); transform: translateY(-2px); }
    .label { font-size: 11px; color: #cbd5e1; text-align: center; word-break: break-word; line-height: 1.3; }
    .value { font-size: 10px; color: #a5b4fc; font-weight: 700; }

    /* Line / area */
    .plot-wrap { position: relative; height: 220px; }
    svg { width: 100%; height: 100%; overflow: visible; }
    .grid-line { stroke: rgba(148, 163, 184, 0.15); stroke-width: 1; stroke-dasharray: 3 3; }
    .line-path { fill: none; stroke: url(#lineGradient); stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; filter: drop-shadow(0 4px 12px rgba(34, 211, 238, 0.4)); }
    .area-path { fill: url(#areaGradient); stroke: none; opacity: 0.85; }
    .data-point { fill: #22d3ee; stroke: white; stroke-width: 1.5; transition: r 0.2s ease; }
    .data-point:hover { r: 6; }
    .xlabels { display: grid; grid-template-columns: repeat(var(--count), minmax(0, 1fr)); gap: 10px; margin-top: 12px; }

    /* Pie / donut */
    .pie-wrap { display: flex; align-items: center; gap: 24px; flex-wrap: wrap; }
    .pie-svg { width: 200px; height: 200px; flex-shrink: 0; filter: drop-shadow(0 8px 24px rgba(0, 0, 0, 0.3)); }
    .pie-legend { display: flex; flex-direction: column; gap: 8px; flex: 1; min-width: 140px; }
    .legend-item { display: flex; align-items: center; gap: 10px; padding: 6px 10px; border-radius: 10px; transition: background 0.2s ease; }
    .legend-item:hover { background: rgba(255, 255, 255, 0.04); }
    .legend-swatch { width: 12px; height: 12px; border-radius: 4px; flex-shrink: 0; }
    .legend-text { display: flex; justify-content: space-between; flex: 1; gap: 12px; align-items: baseline; min-width: 0; }
    .legend-label { font-size: 12px; color: #e2e8f0; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .legend-value { font-size: 11px; color: #94a3b8; font-weight: 700; flex-shrink: 0; }
    .center-text { fill: #f8fafc; font-weight: 900; font-size: 28px; text-anchor: middle; dominant-baseline: central; }
    .center-sub { fill: #94a3b8; font-size: 10px; text-anchor: middle; dominant-baseline: central; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; }
    .pie-slice { transition: transform 0.3s ease; transform-origin: 100px 100px; }
    .pie-slice:hover { transform: scale(1.04); }

    @media (max-width: 768px) {
      .wrap { padding: 16px; border-radius: 18px; }
      .axes { height: 180px; gap: 6px; }
      .plot-wrap { height: 180px; }
      .pie-wrap { gap: 16px; flex-direction: column; align-items: stretch; }
      .pie-svg { width: 100%; max-width: 220px; height: auto; aspect-ratio: 1; align-self: center; }
      .label { font-size: 10px; }
    }
  `;
  declare data: string | undefined;

  /**
   * Render bar chart
   */
  private renderBar(points: any[], maxValue: number, count: string, title: string, subtitle: string) {
    return html`
      <div class="wrap" style=${`--count:${count}`}>
        <div class="header"><div class="title">${title}</div>${subtitle ? html`<div class="subtitle">${subtitle}</div>` : ""}</div>
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

  /**
   * Render line OR area (worm/sparkline) chart. SVG with optional fill.
   */
  private renderLineOrArea(points: any[], maxValue: number, count: string, title: string, subtitle: string, area: boolean) {
    const width = 1000;
    const height = 220;
    const padTop = 10, padBottom = 10;
    const innerH = height - padTop - padBottom;
    const xStep = points.length > 1 ? width / (points.length - 1) : width;
    const xy = points.map((p: any, idx: number) => {
      const x = points.length > 1 ? idx * xStep : width / 2;
      const y = padTop + (innerH - (coerceToNumber(p?.value) / maxValue) * innerH);
      return { x, y, v: coerceToNumber(p?.value), label: String(p?.label || "") };
    });
    const linePoints = xy.map(p => `${p.x},${p.y}`).join(" ");
    const areaPath = `M ${xy[0].x},${height} L ${xy.map(p => `${p.x},${p.y}`).join(" L ")} L ${xy[xy.length - 1].x},${height} Z`;

    return html`
      <div class="wrap" style=${`--count:${count}`}>
        <div class="header"><div class="title">${title}</div>${subtitle ? html`<div class="subtitle">${subtitle}</div>` : ""}</div>
        <div class="plot-wrap">
          <svg viewBox="0 0 1000 220" preserveAspectRatio="none">
            <defs>
              <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stop-color="#818cf8" />
                <stop offset="50%" stop-color="#22d3ee" />
                <stop offset="100%" stop-color="#a855f7" />
              </linearGradient>
              <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#22d3ee" stop-opacity="0.5" />
                <stop offset="100%" stop-color="#6366f1" stop-opacity="0.05" />
              </linearGradient>
            </defs>
            <line class="grid-line" x1="0" y1="${padTop}" x2="1000" y2="${padTop}"></line>
            <line class="grid-line" x1="0" y1="${padTop + innerH / 2}" x2="1000" y2="${padTop + innerH / 2}"></line>
            <line class="grid-line" x1="0" y1="${height - padBottom}" x2="1000" y2="${height - padBottom}"></line>
            ${area ? html`<path class="area-path" d="${areaPath}"></path>` : ""}
            <polyline class="line-path" points="${linePoints}"></polyline>
            ${xy.map(p => html`<circle class="data-point" cx="${p.x}" cy="${p.y}" r="4"><title>${p.label}: ${p.v}</title></circle>`)}
          </svg>
        </div>
        <div class="xlabels">
          ${points.map((p: any) => html`<div class="label">${String(p?.label || "")}</div>`)}
        </div>
      </div>
    `;
  }

  /**
   * Render pie OR donut chart.
   */
  private renderPieOrDonut(points: any[], title: string, subtitle: string, donut: boolean) {
    const palette = ["#6366f1", "#22d3ee", "#a855f7", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#84cc16", "#f43f5e", "#8b5cf6"];
    const total = points.reduce((sum, p) => sum + coerceToNumber(p?.value), 0) || 1;

    const cx = 100, cy = 100, r = 90, innerR = 56;
    let cursor = -Math.PI / 2; // start at top

    const slices = points.map((p: any, idx: number) => {
      const v = coerceToNumber(p?.value);
      const fraction = v / total;
      const angle = fraction * Math.PI * 2;
      const start = cursor;
      const end = cursor + angle;
      cursor = end;

      const x1 = cx + Math.cos(start) * r;
      const y1 = cy + Math.sin(start) * r;
      const x2 = cx + Math.cos(end) * r;
      const y2 = cy + Math.sin(end) * r;
      const largeArc = angle > Math.PI ? 1 : 0;
      const color = palette[idx % palette.length];

      let pathD: string;
      if (donut) {
        const ix1 = cx + Math.cos(end) * innerR;
        const iy1 = cy + Math.sin(end) * innerR;
        const ix2 = cx + Math.cos(start) * innerR;
        const iy2 = cy + Math.sin(start) * innerR;
        pathD = `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix2} ${iy2} Z`;
      } else {
        pathD = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
      }

      return { pathD, color, label: String(p?.label || ""), value: v, pct: Math.round(fraction * 100) };
    });

    return html`
      <div class="wrap">
        <div class="header"><div class="title">${title}</div>${subtitle ? html`<div class="subtitle">${subtitle}</div>` : ""}</div>
        <div class="pie-wrap">
          <svg class="pie-svg" viewBox="0 0 200 200">
            ${slices.map(s => html`<path class="pie-slice" d="${s.pathD}" fill="${s.color}" stroke="rgba(15, 23, 42, 0.6)" stroke-width="1.5"><title>${s.label}: ${s.value} (${s.pct}%)</title></path>`)}
            ${donut ? html`
              <text class="center-text" x="100" y="92">${total}</text>
              <text class="center-sub" x="100" y="115">Total</text>
            ` : ""}
          </svg>
          <div class="pie-legend">
            ${slices.map(s => html`
              <div class="legend-item">
                <div class="legend-swatch" style=${`background:${s.color}`}></div>
                <div class="legend-text">
                  <span class="legend-label">${s.label}</span>
                  <span class="legend-value">${s.value} · ${s.pct}%</span>
                </div>
              </div>
            `)}
          </div>
        </div>
      </div>
    `;
  }

  render() {
    const src = (this.data || this.textContent || "").trim();
    const parsed = safeParseJSON(src);
    const chart = parsed?.component?.Chart || parsed?.Chart || parsed;
    const rawType = String(chart?.type || "bar").toLowerCase();
    const allowed = new Set(["bar", "line", "area", "worm", "pie", "donut"]);
    const chartType = allowed.has(rawType) ? rawType : "bar";
    const title = chart?.title || "Chart";
    const subtitle = chart?.subtitle || "";
    const points = Array.isArray(chart?.data) ? chart.data : [];

    if (!points.length) {
      return html`<div class="wrap"><div class="title">${title}</div><div class="label">No chart data available</div></div>`;
    }

    const values = points.map((p: any) => coerceToNumber(p?.value));
    const maxValue = Math.max(...values, 1);
    const count = String(points.length);

    if (chartType === "pie") return this.renderPieOrDonut(points, title, subtitle, false);
    if (chartType === "donut") return this.renderPieOrDonut(points, title, subtitle, true);
    if (chartType === "area" || chartType === "worm") return this.renderLineOrArea(points, maxValue, count, title, subtitle, true);
    if (chartType === "line") return this.renderLineOrArea(points, maxValue, count, title, subtitle, false);
    return this.renderBar(points, maxValue, count, title, subtitle);
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

/* ──────────────────────────────────────────────────────────────────────
 * NEW COMPONENTS — Stat / Timeline / Callout / Steps / Badges
 * Each component reads JSON from its `data` attribute (or text content) and
 * renders a polished, mobile-friendly visualization.
 * ─────────────────────────────────────────────────────────────────────*/

class A2uiStat extends A2uiBase {
  static properties = { data: { type: String } };
  static styles = css`
    :host { display: block; margin: 20px 0; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 14px;
    }
    .card {
      position: relative;
      padding: 20px 22px;
      border-radius: 22px;
      background: linear-gradient(135deg, rgba(99, 102, 241, 0.08), rgba(168, 85, 247, 0.05));
      border: 1px solid rgba(255, 255, 255, 0.08);
      backdrop-filter: blur(24px);
      box-shadow: 0 10px 30px -12px rgba(0, 0, 0, 0.25);
      overflow: hidden;
      transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.3s ease;
    }
    .card::before {
      content: ""; position: absolute; top: 0; left: 0; right: 0; height: 3px;
      background: linear-gradient(90deg, var(--c1, #6366f1), var(--c2, #ec4899));
    }
    .card:hover { transform: translateY(-3px); border-color: rgba(165, 180, 252, 0.25); }
    .label { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.12em; color: #94a3b8; margin-bottom: 8px; display: flex; align-items: center; gap: 6px; }
    .icon { font-size: 14px; }
    .value { font-size: 30px; font-weight: 900; color: #f8fafc; letter-spacing: -0.02em; line-height: 1.1; }
    .row { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; margin-top: 6px; }
    .delta { font-size: 12px; font-weight: 800; padding: 3px 10px; border-radius: 999px; display: inline-flex; align-items: center; gap: 4px; }
    .delta.up { background: rgba(34, 197, 94, 0.15); color: #4ade80; }
    .delta.down { background: rgba(244, 63, 94, 0.15); color: #fb7185; }
    .delta.flat { background: rgba(148, 163, 184, 0.15); color: #cbd5e1; }
    .sub { font-size: 12px; color: #94a3b8; }
    @media (max-width: 768px) {
      .grid { grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; }
      .card { padding: 16px 18px; border-radius: 18px; }
      .value { font-size: 24px; }
    }
  `;
  declare data: string | undefined;
  render() {
    const src = (this.data || this.textContent || "").trim();
    const parsed = safeParseJSON(src);
    const items: any[] = Array.isArray(parsed) ? parsed
      : Array.isArray(parsed?.items) ? parsed.items
      : Array.isArray(parsed?.stats) ? parsed.stats
      : parsed && typeof parsed === "object" ? [parsed] : [];
    if (!items.length) return html`<div class="card"><div class="label">No data</div></div>`;
    const palette = [
      ["#6366f1", "#a855f7"], ["#06b6d4", "#3b82f6"],
      ["#10b981", "#22d3ee"], ["#f59e0b", "#ec4899"],
      ["#8b5cf6", "#ec4899"], ["#22c55e", "#84cc16"],
    ];
    return html`
      <div class="grid">
        ${items.map((it: any, idx: number) => {
          const [c1, c2] = palette[idx % palette.length];
          const trend = String(it?.trend || "").toLowerCase();
          const cls = trend === "up" || trend === "positive" ? "up"
            : trend === "down" || trend === "negative" ? "down" : "flat";
          const arrow = cls === "up" ? "▲" : cls === "down" ? "▼" : "→";
          return html`
            <div class="card" style=${`--c1:${c1};--c2:${c2}`}>
              <div class="label">${it?.icon ? html`<span class="icon">${it.icon}</span>` : ""}${String(it?.label || "Stat")}</div>
              <div class="row">
                <div class="value">${String(it?.value ?? "—")}</div>
                ${it?.delta != null ? html`<span class="delta ${cls}">${arrow} ${String(it.delta)}</span>` : ""}
              </div>
              ${it?.sub ? html`<div class="sub">${String(it.sub)}</div>` : ""}
            </div>
          `;
        })}
      </div>
    `;
  }
}

class A2uiTimeline extends A2uiBase {
  static properties = { data: { type: String } };
  static styles = css`
    :host { display: block; margin: 24px 0; }
    .wrap { position: relative; padding-left: 28px; }
    .wrap::before {
      content: ""; position: absolute; top: 6px; bottom: 6px; left: 10px; width: 2px;
      background: linear-gradient(180deg, #6366f1, #a855f7, transparent);
      border-radius: 1px;
    }
    .item { position: relative; padding: 0 0 20px 0; }
    .item:last-child { padding-bottom: 0; }
    .dot {
      position: absolute; left: -22px; top: 6px; width: 14px; height: 14px;
      border-radius: 50%; background: linear-gradient(135deg, #6366f1, #a855f7);
      box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.15), 0 0 12px rgba(99, 102, 241, 0.5);
    }
    .item.done .dot { background: linear-gradient(135deg, #22c55e, #10b981); box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.15); }
    .item.warn .dot { background: linear-gradient(135deg, #f59e0b, #ef4444); box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.15); }
    .time { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.12em; color: #a5b4fc; margin-bottom: 4px; }
    .title { font-size: 15px; font-weight: 700; color: #f8fafc; margin-bottom: 4px; }
    .desc { font-size: 13px; color: #cbd5e1; line-height: 1.6; }
    @media (max-width: 768px) {
      .wrap { padding-left: 24px; }
      .wrap::before { left: 8px; }
      .dot { left: -20px; width: 12px; height: 12px; }
      .title { font-size: 14px; }
      .desc { font-size: 12px; }
    }
  `;
  declare data: string | undefined;
  render() {
    const src = (this.data || this.textContent || "").trim();
    const parsed = safeParseJSON(src);
    const items: any[] = Array.isArray(parsed) ? parsed
      : Array.isArray(parsed?.events) ? parsed.events
      : Array.isArray(parsed?.items) ? parsed.items : [];
    if (!items.length) return html`<div style="color:#94a3b8;font-size:13px">No timeline data</div>`;
    return html`
      <div class="wrap">
        ${items.map((it: any) => {
          const status = String(it?.status || "").toLowerCase();
          const cls = status === "done" || status === "complete" || status === "completed" ? "done"
            : status === "warn" || status === "warning" || status === "error" ? "warn" : "";
          return html`
            <div class="item ${cls}">
              <div class="dot"></div>
              ${it?.time ? html`<div class="time">${String(it.time)}</div>` : ""}
              <div class="title">${String(it?.title || "")}</div>
              ${it?.desc ? html`<div class="desc">${String(it.desc)}</div>` : ""}
            </div>
          `;
        })}
      </div>
    `;
  }
}

class A2uiCallout extends A2uiBase {
  static properties = { variant: { type: String }, heading: { type: String } };
  static styles = css`
    :host { display: block; margin: 20px 0; }
    .box {
      position: relative;
      border-radius: 18px;
      padding: 16px 20px 16px 56px;
      background: rgba(99, 102, 241, 0.06);
      border: 1px solid rgba(99, 102, 241, 0.18);
      backdrop-filter: blur(20px);
      color: #e2e8f0;
      line-height: 1.7;
      font-size: 14px;
    }
    .icon-wrap {
      position: absolute; left: 16px; top: 16px; width: 28px; height: 28px;
      border-radius: 8px; display: flex; align-items: center; justify-content: center;
      font-size: 16px; font-weight: 900;
      background: rgba(99, 102, 241, 0.18); color: #a5b4fc;
    }
    .title { font-weight: 800; color: #f8fafc; margin-bottom: 4px; font-size: 14px; letter-spacing: -0.01em; }
    :host([variant="info"]) .box { background: rgba(59, 130, 246, 0.06); border-color: rgba(59, 130, 246, 0.2); }
    :host([variant="info"]) .icon-wrap { background: rgba(59, 130, 246, 0.18); color: #93c5fd; }
    :host([variant="success"]) .box { background: rgba(34, 197, 94, 0.07); border-color: rgba(34, 197, 94, 0.22); }
    :host([variant="success"]) .icon-wrap { background: rgba(34, 197, 94, 0.18); color: #86efac; }
    :host([variant="warning"]) .box { background: rgba(245, 158, 11, 0.07); border-color: rgba(245, 158, 11, 0.22); }
    :host([variant="warning"]) .icon-wrap { background: rgba(245, 158, 11, 0.18); color: #fcd34d; }
    :host([variant="error"]) .box { background: rgba(244, 63, 94, 0.07); border-color: rgba(244, 63, 94, 0.22); }
    :host([variant="error"]) .icon-wrap { background: rgba(244, 63, 94, 0.18); color: #fda4af; }
    :host([variant="quote"]) .box { background: rgba(168, 85, 247, 0.06); border-color: rgba(168, 85, 247, 0.2); padding-left: 20px; border-left: 4px solid #a855f7; font-style: italic; }
    :host([variant="quote"]) .icon-wrap { display: none; }
    @media (max-width: 768px) {
      .box { font-size: 13px; padding: 14px 16px 14px 48px; border-radius: 14px; }
    }
  `;
  declare variant: string | undefined;
  declare heading: string | undefined;
  render() {
    const v = (this.variant || "info").toLowerCase();
    const icon = v === "success" ? "✓" : v === "warning" ? "!" : v === "error" ? "✕" : v === "quote" ? "“" : "i";
    return html`
      <div class="box">
        <div class="icon-wrap">${icon}</div>
        ${this.heading ? html`<div class="title">${this.heading}</div>` : ""}
        <slot></slot>
      </div>
    `;
  }
}

class A2uiSteps extends A2uiBase {
  static properties = { data: { type: String }, current: { type: Number } };
  static styles = css`
    :host { display: block; margin: 24px 0; }
    .list { display: flex; flex-direction: column; gap: 12px; }
    .item {
      display: grid; grid-template-columns: 36px 1fr; gap: 14px; align-items: start;
      padding: 14px 16px; border-radius: 16px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.08);
      transition: all 0.3s ease;
    }
    .item:hover { background: rgba(255, 255, 255, 0.07); transform: translateX(3px); }
    .num {
      width: 36px; height: 36px; border-radius: 12px;
      display: flex; align-items: center; justify-content: center;
      font-size: 14px; font-weight: 900;
      background: rgba(99, 102, 241, 0.15); color: #a5b4fc;
      border: 1px solid rgba(99, 102, 241, 0.3);
    }
    .item.done .num { background: linear-gradient(135deg, #22c55e, #10b981); color: white; border-color: rgba(34, 197, 94, 0.4); }
    .item.active { border-color: rgba(99, 102, 241, 0.5); box-shadow: 0 0 0 1px rgba(99, 102, 241, 0.2), 0 8px 24px -8px rgba(99, 102, 241, 0.4); }
    .item.active .num { background: linear-gradient(135deg, #6366f1, #a855f7); color: white; border-color: rgba(165, 180, 252, 0.6); }
    .title { font-size: 15px; font-weight: 700; color: #f8fafc; margin-bottom: 2px; }
    .desc { font-size: 13px; color: #cbd5e1; line-height: 1.6; }
    @media (max-width: 768px) {
      .item { padding: 12px 14px; border-radius: 14px; gap: 10px; grid-template-columns: 32px 1fr; }
      .num { width: 32px; height: 32px; font-size: 13px; border-radius: 10px; }
      .title { font-size: 14px; }
      .desc { font-size: 12px; }
    }
  `;
  declare data: string | undefined;
  declare current: number | undefined;
  render() {
    const src = (this.data || this.textContent || "").trim();
    const parsed = safeParseJSON(src);
    const items: any[] = Array.isArray(parsed) ? parsed
      : Array.isArray(parsed?.steps) ? parsed.steps
      : Array.isArray(parsed?.items) ? parsed.items : [];
    const cur = typeof this.current === "number" ? this.current : Number(parsed?.current ?? -1);
    if (!items.length) return html`<div style="color:#94a3b8;font-size:13px">No steps</div>`;
    return html`
      <div class="list">
        ${items.map((it: any, idx: number) => {
          const status = String(it?.status || "").toLowerCase();
          const isDone = status === "done" || status === "complete" || status === "completed" || (cur > -1 && idx < cur);
          const isActive = status === "active" || status === "current" || idx === cur;
          const cls = isDone ? "done" : isActive ? "active" : "";
          return html`
            <div class="item ${cls}">
              <div class="num">${isDone ? "✓" : idx + 1}</div>
              <div>
                <div class="title">${String(it?.title || `Step ${idx + 1}`)}</div>
                ${it?.desc ? html`<div class="desc">${String(it.desc)}</div>` : ""}
              </div>
            </div>
          `;
        })}
      </div>
    `;
  }
}

class A2uiBadges extends A2uiBase {
  static properties = { data: { type: String } };
  static styles = css`
    :host { display: block; margin: 14px 0; }
    .row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .chip {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 6px 12px; border-radius: 999px;
      font-size: 12px; font-weight: 700; letter-spacing: -0.01em;
      background: rgba(99, 102, 241, 0.12);
      color: #c7d2fe;
      border: 1px solid rgba(99, 102, 241, 0.25);
      transition: all 0.2s ease;
    }
    .chip:hover { transform: translateY(-1px); border-color: rgba(165, 180, 252, 0.5); }
    .chip.success { background: rgba(34, 197, 94, 0.12); color: #86efac; border-color: rgba(34, 197, 94, 0.25); }
    .chip.warning { background: rgba(245, 158, 11, 0.12); color: #fcd34d; border-color: rgba(245, 158, 11, 0.25); }
    .chip.error { background: rgba(244, 63, 94, 0.12); color: #fda4af; border-color: rgba(244, 63, 94, 0.25); }
    .chip.info { background: rgba(59, 130, 246, 0.12); color: #93c5fd; border-color: rgba(59, 130, 246, 0.25); }
    .chip.muted { background: rgba(148, 163, 184, 0.12); color: #cbd5e1; border-color: rgba(148, 163, 184, 0.25); }
    .dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
  `;
  declare data: string | undefined;
  render() {
    const src = (this.data || this.textContent || "").trim();
    const parsed = safeParseJSON(src);
    const items: any[] = Array.isArray(parsed) ? parsed
      : Array.isArray(parsed?.items) ? parsed.items
      : Array.isArray(parsed?.badges) ? parsed.badges : [];
    if (!items.length) return html`<div class="row"><slot></slot></div>`;
    return html`
      <div class="row">
        ${items.map((it: any) => {
          const isObj = typeof it === "object" && it !== null;
          const label = isObj ? String(it.label || it.text || "") : String(it);
          const variant = isObj ? String(it.variant || it.color || "default").toLowerCase() : "default";
          return html`<span class="chip ${variant}"><span class="dot"></span>${label}</span>`;
        })}
      </div>
    `;
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
  "a2-video": A2uiVideo,
  "a2-stat": A2uiStat,
  "a2-timeline": A2uiTimeline,
  "a2-callout": A2uiCallout,
  "a2-steps": A2uiSteps,
  "a2-badges": A2uiBadges
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
