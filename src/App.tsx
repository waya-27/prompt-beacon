import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import Database from "@tauri-apps/plugin-sql";

// ── Types ────────────────────────────────────────────────────
interface Log {
  id: number;
  timestamp: string;
  intent: string;
  app_tag: string;
  hashtags: string; // JSON string of string[]
  result_note: string;
  status: "in-progress" | "done" | "failed";
}

// ── DB Singleton ─────────────────────────────────────────────
let _db: Database | null = null;

async function getDb(): Promise<Database> {
  if (!_db) {
    _db = await Database.load("sqlite:prompt_beacon.db");
    await _db.execute(`
      CREATE TABLE IF NOT EXISTS logs (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp    TEXT    NOT NULL,
        intent       TEXT    NOT NULL,
        app_tag      TEXT    NOT NULL DEFAULT '',
        hashtags     TEXT    NOT NULL DEFAULT '[]',
        result_note  TEXT    NOT NULL DEFAULT '',
        status       TEXT    NOT NULL DEFAULT 'in-progress'
      )
    `);
  }
  return _db;
}

// ── App Tag Colors ────────────────────────────────────────────
const TAG_COLORS: Record<string, string> = {
  // IDEs
  "VS Code":    "#3b82f6",
  "Cursor":     "#a855f7",
  "Windsurf":   "#0ea5e9",
  // AI Assistants
  "ChatGPT":    "#10a37f",
  "Claude":     "#e06b42",
  "Gemini":     "#4285f4",
  "Copilot":    "#8b5cf6",
  "Perplexity": "#20c997",
  "Grok":       "#c8c8c8",
  "Mistral":    "#ff7043",
  "DeepSeek":   "#4b7bec",
  "Meta AI":    "#0082fb",
  // AI Dev Tools
  "Bolt":       "#f59e0b",
  "v0":         "#e2e8f0",
  "Replit":     "#f26207",
  "Lovable":    "#ec4899",
  // Productivity
  "Notion":     "#94a3b8",
  "GitHub":     "#6e40c9",
  "Linear":     "#5e6ad2",
  "Figma":      "#a259ff",
  "Slack":      "#e01e5a",
};

function getTagColor(tag: string): string {
  return TAG_COLORS[tag] ?? "#64748b";
}

// ── Theme Config ─────────────────────────────────────────────
const THEMES = {
  light:  { name: "ホワイト", accent: "#f97316", light: "#fb923c", rgb: "249, 115, 22",
             bg: "rgba(255,252,248,0.97)",  panelBg: "rgba(255,251,245,0.99)",
             surface: "rgba(0,0,0,0.04)",   border: "rgba(0,0,0,0.09)",
             text: "#1a1008",               subtext: "#78716c",
             inputBg: "rgba(0,0,0,0.03)",   inputText: "#1a1008",
             isDark: false },
  dark:   { name: "ダーク",  accent: "#f97316", light: "#fb923c", rgb: "249, 115, 22",
             bg: "rgba(11,9,6,0.95)",       panelBg: "rgba(10,8,5,0.97)",
             surface: "rgba(255,255,255,0.05)", border: "rgba(255,255,255,0.08)",
             text: "#e8ddd4",               subtext: "#6b5e52",
             inputBg: "rgba(255,255,255,0.04)", inputText: "#e8ddd4",
             isDark: true  },
  brown:  { name: "ブラウン", accent: "#f5f0eb", light: "#ffffff", rgb: "245,240,235",
             bg: "rgba(42,28,18,0.96)",     panelBg: "rgba(38,25,15,0.98)",
             surface: "rgba(255,255,255,0.06)", border: "rgba(255,255,255,0.1)",
             text: "#f5f0eb",               subtext: "#7a6455",
             inputBg: "rgba(255,255,255,0.06)", inputText: "#f5f0eb",
             isDark: true  },
} as const;
type ThemeKey = keyof typeof THEMES;

// ── Log limit ─────────────────────────────────────────────────
const LOG_LIMIT = 100;

// ── i18n ─────────────────────────────────────────────────────
const I18N = {
  en: {
    placeholder:      "What are you going to do? #tag",
    historyLogs:      (n: number) => `${n} logs`,
    settingsTitle:    "Settings",
    appearance:       "Appearance",
    dataSection:      "Data",
    savedLogs:        "Saved logs",
    exportCsv:        "↓ Export CSV",
    deleteAll:        "Delete all logs",
    deleteConfirm:    "Are you sure?",
    deleteBtn:        "Delete",
    backBtn:          "Back",
    shortcuts:        "Shortcuts",
    openApp:          "Open app",
    openHistory:      "Open history",
    closeHide:        "Close / Hide",
    support:          "Support",
    supportText:      "Prompt Beacon is completely free. If you find it useful, consider buying me a coffee ☕",
    bmcBtn:           "☕ Buy Me a Coffee",
    about:            "About",
    aboutDesc:        "A developer-focused AI prompt log tool",
    builtWith:        "Built with Tauri · React · Rust",
    terms:            "Terms",
    privacy:          "Privacy Policy",
    feedback:         "Feedback",
    allFilter:        "All",
    noLogs:           "No logs yet",
    noLogsHint:       "Press Alt + Space to start logging",
    resultPlaceholder:"↳ Add a note...",
    save:             "Save",
    cancel:           "Cancel",
    langLabel:        "Language",
    langEn:           "English",
    langJa:           "日本語",
    statusInProgress: "In Progress",
    statusDone:       "Done",
    statusFailed:     "Failed",
    today:            "Today",
    yesterday:        "Yesterday",
    backToHistory:    "← History",
    items:            (n: number, limit: number) => `${n} / ${limit}`,
    privacyTitle:     "Privacy & Security",
    privacyLocal:     "All data is stored locally on your device only.",
    privacyNoCloud:   "No cloud sync. No data ever leaves your computer.",
    privacyNoAccount: "No account or login required.",
    privacyOffline:   "Works 100% offline — no network connection needed.",
  },
  ja: {
    placeholder:      "今から何をしますか？ #tag",
    historyLogs:      (n: number) => `${n} 件`,
    settingsTitle:    "設定",
    appearance:       "外観",
    dataSection:      "データ管理",
    savedLogs:        "保存ログ数",
    exportCsv:        "↓ CSVエクスポート",
    deleteAll:        "全ログを削除",
    deleteConfirm:    "本当に全削除？",
    deleteBtn:        "削除",
    backBtn:          "戻る",
    shortcuts:        "ショートカット",
    openApp:          "アプリを開く",
    openHistory:      "履歴を開く",
    closeHide:        "閉じる / 隠す",
    support:          "サポート",
    supportText:      "Prompt Beacon は完全無料です。気に入ってもらえたら、開発を応援してください ☕",
    bmcBtn:           "☕ Buy Me a Coffee",
    about:            "このアプリについて",
    aboutDesc:        "AIへの指示を手元に残す、開発者専用ログツール",
    builtWith:        "Built with Tauri · React · Rust",
    terms:            "利用規約",
    privacy:          "プライバシーポリシー",
    feedback:         "フィードバック",
    allFilter:        "すべて",
    noLogs:           "ログはまだありません",
    noLogsHint:       "Alt + Space で記録を始めましょう",
    resultPlaceholder:"↳ 結果を追記...",
    save:             "保存",
    cancel:           "キャンセル",
    langLabel:        "言語",
    langEn:           "English",
    langJa:           "日本語",
    statusInProgress: "進行中",
    statusDone:       "完了",
    statusFailed:     "失敗",
    today:            "今日",
    yesterday:        "昨日",
    backToHistory:    "← 履歴",
    items:            (n: number, limit: number) => `${n} / ${limit} 件`,
    privacyTitle:     "プライバシー・セキュリティ",
    privacyLocal:     "データはすべてデバイス内に保存。外部に送信しません。",
    privacyNoCloud:   "クラウド同戴なし。データがネットワークに出ることは一切ありません。",
    privacyNoAccount: "アカウント・ログイン不要。",
    privacyOffline:   "完全オフライン動作。インターネット接続は一切不要。",
  },
} as const;
type Lang = keyof typeof I18N;

// ── Status Config ─────────────────────────────────────────────
const STATUS = {
  "in-progress": { label: "進行中", color: "#f59e0b" },
  "done":        { label: "完了",   color: "#34d399" },
  "failed":      { label: "失敗",   color: "#f87171" },
} as const;

// ── Helpers ───────────────────────────────────────────────────
function extractHashtags(text: string): string[] {
  return [...text.matchAll(/#[\w\u3040-\u9FFF-]+/g)].map((m) => m[0]);
}

function formatDateTime(iso: string, lang: Lang): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const locale = lang === "ja" ? "ja-JP" : "en-US";
  let prefix: string;
  if (d.toDateString() === today.toDateString()) {
    prefix = I18N[lang].today;
  } else if (d.toDateString() === yesterday.toDateString()) {
    prefix = I18N[lang].yesterday;
  } else {
    prefix = d.toLocaleDateString(locale, { month: "short", day: "numeric" });
  }
  const time = d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  return `${prefix} ${time}`;
}

// ── Window sizes ──────────────────────────────────────────────
const BAR_H   = 64;
const PANEL_H = 540;
const WIN_W   = 640;

// ── Main Component ────────────────────────────────────────────
export default function App() {
  const [mode, setMode] = useState<"bar" | "history" | "settings">("bar");
  const [input, setInput]     = useState("");
  const [appTag, setAppTag]   = useState("Unknown");
  const [logs, setLogs]       = useState<Log[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [hashtagFilter, setHashtagFilter] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editNote, setEditNote]   = useState("");
  const [saved, setSaved]     = useState(false);
  const [themeKey, setThemeKey] = useState<ThemeKey>("light");
  const [launchAtLogin, setLaunchAtLogin] = useState(
    () => localStorage.getItem("launchAtLogin") === "true"
  );
  const [confirmClear, setConfirmClear] = useState(false);
  const [lang, setLang] = useState<Lang>(
    () => (localStorage.getItem("lang") ?? "en") as Lang
  );

  const t = I18N[lang];

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const transitioningRef = useRef(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const [isListening, setIsListening] = useState(false);

  // ── Drag handler ──────────────────────────────────────────
  const handleDrag = async (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (
      e.button !== 0 ||
      target.closest("input, button, select, textarea, a")
    ) return;
    try {
      await getCurrentWindow().startDragging();
    } catch (_) {}
  };

  // ── Apply theme ─────────────────────────────────────────
  const applyTheme = useCallback((key: ThemeKey) => {
    const t = THEMES[key];
    const r = document.documentElement;
    r.style.setProperty("--accent",     t.accent);
    r.style.setProperty("--accent-light", t.light);
    r.style.setProperty("--accent-rgb", t.rgb);
    r.style.setProperty("--bg",         t.bg);
    r.style.setProperty("--panel-bg",   t.panelBg);
    r.style.setProperty("--surface",    t.surface);
    r.style.setProperty("--border",     t.border);
    r.style.setProperty("--text",       t.text);
    r.style.setProperty("--subtext",    t.subtext);
    r.style.setProperty("--input-bg",   t.inputBg);
    r.style.setProperty("--input-text", t.inputText);
    setThemeKey(key);
    localStorage.setItem("themeKey", key);
  }, []);

  // ── Theme init ──────────────────────────────────────────
  useEffect(() => {
    const raw = localStorage.getItem("themeKey") ?? "light";
    const saved = (raw in THEMES ? raw : "light") as ThemeKey;
    applyTheme(saved);
  }, [applyTheme]);

  // ── Load logs ──────────────────────────────────────────────
  const loadLogs = useCallback(async () => {
    const db = await getDb();
    const rows = await db.select<Log[]>(
      `SELECT * FROM logs ORDER BY timestamp DESC`
    );
    setLogs(rows);
  }, []);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  // ── On window focus/blur ───────────────────────────────
  useEffect(() => {
    const win = getCurrentWindow();
    let unlisten: (() => void) | undefined;

    win
      .onFocusChanged(async ({ payload: focused }) => {
        if (focused) {
          try {
            const title = await invoke<string>("get_last_active_window");
            if (title) {
              const tag = await invoke<string>("detect_app_tag", { title });
              setAppTag(tag || "Unknown");
            }
          } catch (_) {}
          setTimeout(() => inputRef.current?.focus(), 80);
        } else {
          // フォーカスを失ったら隐す（モード切り替え中は除く）
          if (!transitioningRef.current) {
            await win.hide();
          }
        }
      })
      .then((fn) => {
        unlisten = fn;
      });

    setTimeout(() => inputRef.current?.focus(), 150);

    return () => {
      unlisten?.();
    };
  }, []);

  // ── Keyboard shortcuts ─────────────────────────────────────
  useEffect(() => {
    const handler = async (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (mode === "history" || mode === "settings") {
          await switchMode("bar");
        } else {
          setInput("");
          await getCurrentWindow().hide();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [mode]);

  // ── Alt+Space: always go to bar mode ──────────────────────
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<void>("focus-bar", () => {
      switchMode("bar");
    }).then((fn) => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, []);

  // ── Switch bar ↔ history ───────────────────────────────────
  const switchMode = async (next: "bar" | "history" | "settings") => {
    transitioningRef.current = true;
    try {
      const win = getCurrentWindow();
      await win.setSize(new LogicalSize(WIN_W, next === "bar" ? BAR_H : PANEL_H));
      setMode(next);
      if (next === "history") await loadLogs();
      else if (next === "bar") setTimeout(() => inputRef.current?.focus(), 100);
    } catch (err) {
      console.error("switchMode error:", err);
    } finally {
      setTimeout(() => { transitioningRef.current = false; }, 300);
    }
  };

  // ── Save new log ───────────────────────────────────────────
  const handleSubmit = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    const hashtags = extractHashtags(trimmed);
    const db = await getDb();
    await db.execute(
      "INSERT INTO logs (timestamp, intent, app_tag, hashtags, status) VALUES (?, ?, ?, ?, ?)",
      [new Date().toISOString(), trimmed, appTag, JSON.stringify(hashtags), "in-progress"]
    );

    // 100件を超えた古いログを自動削除
    await db.execute(
      `DELETE FROM logs WHERE id NOT IN (SELECT id FROM logs ORDER BY timestamp DESC LIMIT ${LOG_LIMIT})`
    );

    setInput("");

    // DBに保存後、元のアプリにフォーカスを戻してCtrl+Vで貼り付け
    // （ウィンドウを隠す処理もRust側で行う）
    try {
      await invoke("paste_and_restore", { text: trimmed });
    } catch (e) {
      console.error("paste_and_restore failed:", e);
      // 貼り付け失敗時はウィンドウをそのまま残す
    }
  };

  // ── Update result note ──────────────────────────────────
  const handleSaveNote = async (id: number) => {
    const db = await getDb();
    await db.execute(
      "UPDATE logs SET result_note = ? WHERE id = ?",
      [editNote, id]
    );
    setEditingId(null);
    await loadLogs();
  };

  // ── Voice input ─────────────────────────────────────────
  const toggleVoice = () => {
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) return;

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      return;
    }

    const rec: SpeechRecognition = new SR();
    rec.lang = lang === "ja" ? "ja-JP" : "en-US";
    rec.interimResults = false;
    rec.continuous = false;

    rec.onresult = (e: SpeechRecognitionEvent) => {
      const transcript = e.results[0][0].transcript;
      setInput((prev) => prev + (prev ? " " : "") + transcript);
    };
    rec.onstart  = () => setIsListening(true);
    rec.onend    = () => setIsListening(false);
    rec.onerror  = () => setIsListening(false);

    recognitionRef.current = rec;
    rec.start();
  };

  // ── Export CSV ─────────────────────────────────────────
  const exportCsv = async () => {
    const db = await getDb();
    const rows = await db.select<Log[]>("SELECT * FROM logs ORDER BY timestamp DESC");
    const header = "id,timestamp,intent,app_tag,hashtags,result_note\n";
    const body = rows.map((r) =>
      `${r.id},"${r.timestamp}","${r.intent.replace(/"/g, '""')}","${r.app_tag}","${r.hashtags.replace(/"/g, '""')}","${r.result_note.replace(/"/g, '""')}"`
    ).join("\n");
    const blob = new Blob([header + body], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `prompt_beacon_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Clear all logs ──────────────────────────────────────
  const clearAllLogs = async () => {
    const db = await getDb();
    await db.execute("DELETE FROM logs");
    setLogs([]);
    setConfirmClear(false);
  };

  // ── Compute unique app_tags and hashtags across all logs ────
  const allCategories = Array.from(
    new Set(logs.map((l) => l.app_tag).filter((t) => t && t !== "Unknown"))
  );

  const allHashtags = Array.from(
    new Set(
      logs.flatMap((l) => {
        try { return JSON.parse(l.hashtags) as string[]; }
        catch { return []; }
      })
    )
  );

  const filteredLogs = logs.filter((l) => {
    if (categoryFilter && l.app_tag !== categoryFilter) return false;
    if (hashtagFilter) {
      try {
        const tags: string[] = JSON.parse(l.hashtags);
        if (!tags.includes(hashtagFilter)) return false;
      } catch { return false; }
    }
    return true;
  });

  // ─────────────────────────────────────────────────────────
  // BAR MODE
  // ─────────────────────────────────────────────────────────
  if (mode === "bar") {
    const tagColor = getTagColor(appTag);
    const hasSpeech = !!(window as any).SpeechRecognition || !!(window as any).webkitSpeechRecognition;
    return (
      <div className="bar-root" onMouseDown={handleDrag}>
        <span className="bar-icon" style={{ cursor: "move" }}>◈</span>

        <textarea
          ref={inputRef}
          className="bar-input"
          value={input}
          rows={1}
          onChange={(e) => {
            setInput(e.target.value);
            // auto-resize
            e.target.style.height = "auto";
            e.target.style.height = e.target.scrollHeight + "px";
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
            // Shift+Enter = newline (default behavior)
          }}
          placeholder={t.placeholder}
          spellCheck={false}
          autoComplete="off"
          style={{ resize: "none", overflow: "hidden" }}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          {saved && <span className="saved-indicator">✓</span>}

          {hasSpeech && (
            <button
              className={`icon-btn${isListening ? " listening" : ""}`}
              onClick={toggleVoice}
              title={isListening ? "Stop" : "Voice input"}
            >
              {isListening ? "⏹" : "🎙"}
            </button>
          )}

          {appTag !== "Unknown" && (
            <span
              className="bar-tag-badge"
              style={{
                backgroundColor: tagColor + "22",
                color: tagColor,
                borderColor: tagColor + "55",
              }}
            >
              {appTag}
            </span>
          )}

          <button
            className="icon-btn"
            onClick={() => switchMode("history")}
            title={t.openHistory}
          >
            ≡
          </button>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────
  // SETTINGS MODE
  // ─────────────────────────────────────────────────────────
  if (mode === "settings") {
    return (
      <div className="panel-root">
        <div className="panel-header" onMouseDown={handleDrag}>
          <div className="panel-title">
            <span className="panel-title-icon">◈</span>
            {t.settingsTitle}
          </div>
          <div style={{ display: "flex", gap: 2 }}>
            <button className="icon-btn" onClick={() => switchMode("history")} title={t.backToHistory}>←</button>
            <button className="icon-btn danger" onClick={() => getCurrentWindow().hide()}>×</button>
          </div>
        </div>

        <div className="settings-body">

          {/* 外観 */}
          <div className="settings-section">
            <div className="settings-section-title">{t.appearance}</div>
            <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
              {(Object.keys(THEMES) as ThemeKey[]).map((key) => {
                const th = THEMES[key];
                const isSelected = themeKey === key;
                return (
                  <button
                    key={key}
                    onClick={() => applyTheme(key)}
                    className={`theme-card${isSelected ? " selected" : ""}`}
                    title={th.name}
                    style={{
                      background: th.bg,
                      borderColor: isSelected ? th.accent : th.border,
                    }}
                  >
                    <span className="theme-card-preview" style={{ color: th.text }}>Aa</span>
                    <span className="theme-card-label" style={{ color: th.subtext }}>{th.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* データ管理 */}
          <div className="settings-section">
            <div className="settings-section-title">{t.dataSection}</div>
            <div className="settings-row" style={{ marginBottom: 10 }}>
              <span className="settings-row-label">{t.savedLogs}</span>
              <span style={{ fontSize: 12, color: "var(--subtext)", fontVariantNumeric: "tabular-nums" }}>
                {t.items(logs.length, LOG_LIMIT)}
              </span>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn-settings-action" onClick={exportCsv}>
                {t.exportCsv}
              </button>
              {confirmClear ? (
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: "var(--accent)" }}>{t.deleteConfirm}</span>
                  <button className="btn-settings-action danger" onClick={clearAllLogs}>{t.deleteBtn}</button>
                  <button className="btn-settings-action" onClick={() => setConfirmClear(false)}>{t.backBtn}</button>
                </div>
              ) : (
                <button className="btn-settings-action danger" onClick={() => setConfirmClear(true)}>
                  {t.deleteAll}
                </button>
              )}
            </div>
          </div>

          {/* ショートカット */}
          <div className="settings-section">
            <div className="settings-section-title">{t.shortcuts}</div>
            {[
              { label: t.openApp,    keys: ["Alt", "Space"] },
              { label: t.openHistory, keys: ["≡"] },
              { label: t.closeHide,  keys: ["Esc"] },
            ].map(({ label, keys }) => (
              <div className="settings-row" key={label} style={{ marginBottom: 6 }}>
                <span className="settings-row-label">{label}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                  {keys.map((k, i) => (
                    <span key={k}>
                      {i > 0 && <span style={{ color: "var(--subtext)", fontSize: 10, margin: "0 2px" }}>+</span>}
                      <kbd className="kbd">{k}</kbd>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* サポート */}
          <div className="settings-section">
            <div className="settings-section-title">{t.support}</div>
            <p style={{ fontSize: 12, color: "var(--subtext)", lineHeight: 1.65, marginBottom: 10 }}>
              {t.supportText}
            </p>
            <a
              className="btn-bmc"
              href="https://buymeacoffee.com/hovvy"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t.bmcBtn}
            </a>
          </div>

          {/* Language */}
          <div className="settings-section">
            <div className="settings-section-title">{t.langLabel}</div>
            <div style={{ display: "flex", gap: 8 }}>
              {(["en", "ja"] as Lang[]).map((l) => (
                <button
                  key={l}
                  className={`btn-settings-action${lang === l ? " active" : ""}`}
                  style={lang === l ? { borderColor: "var(--accent)", color: "var(--accent)" } : {}}
                  onClick={() => { setLang(l); localStorage.setItem("lang", l); }}
                >
                  {l === "en" ? t.langEn : t.langJa}
                </button>
              ))}
            </div>
          </div>

          {/* Privacy & Security */}
          <div className="settings-section">
            <div className="settings-section-title">{t.privacyTitle}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {[t.privacyLocal, t.privacyNoCloud, t.privacyNoAccount, t.privacyOffline].map((item) => (
                <div key={item} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, color: "var(--subtext)", lineHeight: 1.5 }}>
                  <span style={{ color: "var(--accent)", flexShrink: 0, marginTop: 1 }}>✓</span>
                  {item}
                </div>
              ))}
            </div>
          </div>

          {/* About */}
          <div className="settings-section">
            <div className="settings-section-title">{t.about}</div>
            <div className="settings-about-text">
              Prompt Beacon v0.1.0<br />
              {t.aboutDesc}<br />
              {t.builtWith}
            </div>
            <div style={{ marginTop: 10, display: "flex", gap: 0, flexWrap: "wrap" }}>
              <a className="settings-link" href="#">{t.terms}</a>
              <span style={{ color: "var(--subtext)", margin: "0 8px", opacity: 0.4 }}>·</span>
              <a className="settings-link" href="#">{t.privacy}</a>
              <span style={{ color: "var(--subtext)", margin: "0 8px", opacity: 0.4 }}>·</span>
              <a className="settings-link" href="#">{t.feedback}</a>
            </div>
          </div>

        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────
  // HISTORY MODE
  // ─────────────────────────────────────────────────────────
  return (
    <div className="panel-root">
      {/* Header */}
      <div className="panel-header" onMouseDown={handleDrag}>
        <div className="panel-title">
          <span className="panel-title-icon">◈</span>
          Prompt Beacon
          <span style={{ fontSize: 10, color: "var(--subtext)", fontWeight: 400, marginLeft: 4 }}>
            {t.historyLogs(logs.length)}
          </span>
        </div>
        <div style={{ display: "flex", gap: 2 }}>
          <button className="icon-btn" onClick={() => switchMode("settings")} title={t.settingsTitle}>⚙</button>
          <button className="icon-btn" onClick={() => switchMode("bar")} title={t.closeHide}>↑</button>
          <button className="icon-btn danger" onClick={() => getCurrentWindow().hide()} title="隠す">×</button>
        </div>
      </div>

      {/* Category filter (app_tag) */}
      {allCategories.length > 0 && (
        <div className="filter-bar" style={{ borderBottom: "none", paddingBottom: 4 }}>
          <span style={{ fontSize: 10, color: "var(--subtext)", flexShrink: 0, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600 }}>App</span>
          <button
            className={`filter-chip${categoryFilter === null ? " active" : ""}`}
            onClick={() => setCategoryFilter(null)}
          >
            {t.allFilter}
          </button>
          {allCategories.map((cat) => {
            const c = getTagColor(cat);
            return (
              <button
                key={cat}
                className={`filter-chip${categoryFilter === cat ? " active" : ""}`}
                style={categoryFilter === cat ? { color: c, borderColor: c + "55", backgroundColor: c + "18" } : {}}
                onClick={() => setCategoryFilter(categoryFilter === cat ? null : cat)}
              >
                {cat}
              </button>
            );
          })}
        </div>
      )}

      {/* Hashtag filter */}
      {allHashtags.length > 0 && (
        <div className="filter-bar">
          <span style={{ fontSize: 10, color: "var(--subtext)", flexShrink: 0, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600 }}>#</span>
          {allHashtags.map((tag) => (
            <button
              key={tag}
              className={`filter-chip${hashtagFilter === tag ? " active" : ""}`}
              onClick={() => setHashtagFilter(hashtagFilter === tag ? null : tag)}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {/* Log list */}
      <div className="log-list">
        {filteredLogs.length === 0 ? (
          <div className="empty-state">
            <p>{t.noLogs}</p>
            <p>{t.noLogsHint}</p>
          </div>
        ) : (
          filteredLogs.map((log) => {
            let tags: string[] = [];
            try {
              tags = JSON.parse(log.hashtags);
            } catch {}

            const tagColor = getTagColor(log.app_tag);
            const isEditing = editingId === log.id;

            return (
              <div key={log.id} className="log-card">
                {/* Meta row */}
                <div className="log-card-meta">
                  <div className="log-meta-left">
                    <span className="log-time">{formatDateTime(log.timestamp, lang)}</span>
                    {log.app_tag && log.app_tag !== "Unknown" && (
                      <span
                        className="app-tag"
                        style={{ backgroundColor: tagColor + "22", color: tagColor }}
                      >
                        {log.app_tag}
                      </span>
                    )}
                  </div>
                </div>

                {/* Intent */}
                <p className="log-intent">{log.intent}</p>

                {/* Hashtags */}
                {tags.length > 0 && (
                  <div
                    style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 5 }}
                  >
                    {tags.map((t) => (
                      <span
                        key={t}
                        className="hashtag"
                        onClick={() =>
                          setHashtagFilter(hashtagFilter === t ? null : t)
                        }
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}

                {/* Result note */}
                {isEditing ? (
                  <div className="edit-area">
                    <textarea
                      className="note-textarea"
                      value={editNote}
                      onChange={(e) => setEditNote(e.target.value)}
                      placeholder={t.resultPlaceholder}
                      rows={2}
                      autoFocus
                    />
                    <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                      <button className="btn-save" onClick={() => handleSaveNote(log.id)}>{t.save}</button>
                      <button className="btn-cancel" onClick={() => setEditingId(null)}>{t.cancel}</button>
                    </div>
                  </div>
                ) : (
                  <div
                    className="result-area"
                    onClick={() => {
                      setEditingId(log.id);
                      setEditNote(log.result_note);
                    }}
                  >
                    {log.result_note ? (
                      <span className="result-text">↳ {log.result_note}</span>
                    ) : (
                      <span className="result-placeholder">{t.resultPlaceholder}</span>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
