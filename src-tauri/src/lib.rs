use std::sync::Mutex;
use tauri::{Emitter, Manager, State};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

// ── State ────────────────────────────────────────────────────
struct PrevWindow {
    title: Mutex<String>,
    hwnd:  Mutex<isize>,
}

// ── Windows API ───────────────────────────────────────────────
#[cfg(windows)]
fn capture_foreground() -> (String, isize) {
    use windows_sys::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowTextW};
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd == 0 { return (String::new(), 0); }
        let mut buf = [0u16; 512];
        let len = GetWindowTextW(hwnd, buf.as_mut_ptr(), buf.len() as i32);
        let title = if len > 0 {
            String::from_utf16_lossy(&buf[..len as usize])
        } else {
            String::new()
        };
        (title, hwnd as isize)
    }
}

#[cfg(not(windows))]
fn capture_foreground() -> (String, isize) { (String::new(), 0) }

// ── Commands ──────────────────────────────────────────────────
#[tauri::command]
fn get_last_active_window(state: State<PrevWindow>) -> String {
    state.title.lock().unwrap().clone()
}

#[tauri::command]
fn detect_app_tag(title: String) -> String {
    let lower = title.to_lowercase();

    // ── IDEs / Code Editors ───────────────────────────────────
    if lower.contains("visual studio code") || lower.ends_with(" - code") || lower.contains("code - insiders") {
        return "VS Code".to_string();
    }
    if lower.contains("cursor") { return "Cursor".to_string(); }
    if lower.contains("windsurf") { return "Windsurf".to_string(); }

    // ── AI Assistants ─────────────────────────────────────────
    if lower.contains("chatgpt") || lower.contains("chat.openai") {
        return "ChatGPT".to_string();
    }
    if lower.contains("claude") { return "Claude".to_string(); }
    if lower.contains("gemini") { return "Gemini".to_string(); }
    if lower.contains("copilot") { return "Copilot".to_string(); }
    if lower.contains("perplexity") { return "Perplexity".to_string(); }
    if lower.contains("grok") { return "Grok".to_string(); }
    if lower.contains("mistral") || lower.contains("le chat") {
        return "Mistral".to_string();
    }
    if lower.contains("deepseek") { return "DeepSeek".to_string(); }
    if lower.contains("meta ai") || lower.contains("llama") {
        return "Meta AI".to_string();
    }

    // ── AI Dev Tools ──────────────────────────────────────────
    if lower.contains("bolt.new") || lower.contains("bolt ") {
        return "Bolt".to_string();
    }
    if lower.contains("v0.dev") || lower.starts_with("v0 ") || lower.contains("v0 by vercel") {
        return "v0".to_string();
    }
    if lower.contains("replit") { return "Replit".to_string(); }
    if lower.contains("lovable") { return "Lovable".to_string(); }

    // ── Productivity ──────────────────────────────────────────
    if lower.contains("notion") { return "Notion".to_string(); }
    if lower.contains("github") { return "GitHub".to_string(); }
    if lower.contains("linear") { return "Linear".to_string(); }
    if lower.contains("figma") { return "Figma".to_string(); }
    if lower.contains("slack") { return "Slack".to_string(); }

    let parts: Vec<&str> = title.split(" - ").collect();
    parts.last().unwrap_or(&"Unknown").trim().to_string()
}

/// Enter押下時に呼ぶ:
/// 1. クリップボードにテキストをセット
/// 2. Prompt Beacon を隠す
/// 3. 元のウィンドウにフォーカスを戻す
/// 4. Ctrl+V で自動貼り付け
#[tauri::command]
fn paste_and_restore(
    app: tauri::AppHandle,
    text: String,
    state: State<PrevWindow>,
) -> Result<(), String> {
    let hwnd = *state.hwnd.lock().unwrap();

    // 1. クリップボードにセット
    arboard::Clipboard::new()
        .and_then(|mut c| c.set_text(&text))
        .map_err(|e| e.to_string())?;

    // 2. Prompt Beacon を隠す
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.hide();
    }

    // 3 & 4. フォーカス復元 + Ctrl+V（Windows のみ）
    #[cfg(windows)]
    if hwnd != 0 {
        use windows_sys::Win32::UI::WindowsAndMessaging::SetForegroundWindow;
        use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
            SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT,
            KEYEVENTF_KEYUP, VK_CONTROL, VK_V,
        };
        unsafe {
            std::thread::sleep(std::time::Duration::from_millis(150));
            SetForegroundWindow(hwnd as _);
            std::thread::sleep(std::time::Duration::from_millis(100));

            let inputs: [INPUT; 4] = [
                INPUT { r#type: INPUT_KEYBOARD, Anonymous: INPUT_0 { ki: KEYBDINPUT { wVk: VK_CONTROL, wScan: 0, dwFlags: 0,               time: 0, dwExtraInfo: 0 } } },
                INPUT { r#type: INPUT_KEYBOARD, Anonymous: INPUT_0 { ki: KEYBDINPUT { wVk: VK_V,       wScan: 0, dwFlags: 0,               time: 0, dwExtraInfo: 0 } } },
                INPUT { r#type: INPUT_KEYBOARD, Anonymous: INPUT_0 { ki: KEYBDINPUT { wVk: VK_V,       wScan: 0, dwFlags: KEYEVENTF_KEYUP, time: 0, dwExtraInfo: 0 } } },
                INPUT { r#type: INPUT_KEYBOARD, Anonymous: INPUT_0 { ki: KEYBDINPUT { wVk: VK_CONTROL, wScan: 0, dwFlags: KEYEVENTF_KEYUP, time: 0, dwExtraInfo: 0 } } },
            ];
            SendInput(4, inputs.as_ptr(), std::mem::size_of::<INPUT>() as i32);
        }
    }

    Ok(())
}

// ── Entry Point ───────────────────────────────────────────────
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(PrevWindow {
            title: Mutex::new(String::new()),
            hwnd:  Mutex::new(0),
        })
        .setup(|app| {
            app.global_shortcut().on_shortcut(
                Shortcut::new(Some(Modifiers::ALT), Code::Space),
                |app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        // ウィンドウを表示する前にアクティブウィンドウを記録
                        let (title, hwnd) = capture_foreground();
                        let state = app.state::<PrevWindow>();
                        *state.title.lock().unwrap() = title;
                        *state.hwnd.lock().unwrap()  = hwnd;

                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                            // フロントエンドにバーモードへ戻るよう通知
                            let _ = window.emit("focus-bar", ());
                        }
                    }
                },
            )?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_last_active_window,
            detect_app_tag,
            paste_and_restore,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
