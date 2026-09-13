// Prevents additional console window on Windows in release, remove in debug
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(target_os = "windows")]
mod desktop_layer {
    use windows::core::s;
    use windows::Win32::Foundation::{COLORREF, HWND, LPARAM, WPARAM};
    use windows::Win32::UI::WindowsAndMessaging::*;

    /// 把窗口嵌入桌面层（Progman 的子窗口）：
    /// 壁纸之上、桌面图标之上（占据区域）、所有应用窗口之下。
    /// 作为 Progman 的子窗口，Win+D 不会最小化它（非顶层窗口）。
    ///
    /// 兼容两种桌面模式：
    /// - Win11 raised desktop（Progman 带 WS_EX_NOREDIRECTIONBITMAP）：挂 Progman + 子层级置顶
    /// - 经典模式：挂 0x052C 生成的 WorkerW
    pub fn stick_to_desktop(hwnd: HWND) {
        unsafe {
            let progman = match FindWindowA(s!("Progman"), None) {
                Ok(h) if !h.0.is_null() => h,
                _ => return,
            };
            // 触发 WorkerW 生成（经典模式需要；raised 模式下无害）
            let _ = SendMessageTimeoutA(
                progman,
                0x052C,
                WPARAM(0xD),
                LPARAM(0x1),
                SMTO_NORMAL,
                1000,
                None,
            );

            // 通用：转成子窗口（清 WS_POPUP，加 WS_CHILD | WS_VISIBLE）
            let style = GetWindowLongPtrW(hwnd, GWL_STYLE);
            SetWindowLongPtrW(
                hwnd,
                GWL_STYLE,
                (style & !(WS_POPUP.0 as isize)) | WS_CHILD.0 as isize | WS_VISIBLE.0 as isize,
            );

            let prog_ex = GetWindowLongPtrW(progman, GWL_EXSTYLE) as u32;
            let raised = prog_ex & 0x0020_0000 != 0; // WS_EX_NOREDIRECTIONBITMAP

            if raised {
                // Win11 raised desktop：挂 Progman，子层级置顶（图标之上、应用之下）
                let ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
                SetWindowLongPtrW(
                    hwnd,
                    GWL_EXSTYLE,
                    ex | WS_EX_LAYERED.0 as isize | WS_EX_NOACTIVATE.0 as isize,
                );
                let _ = SetLayeredWindowAttributes(hwnd, COLORREF(0), 255, LWA_ALPHA);
                let _ = SetParent(hwnd, Some(progman));
                let _ = SetWindowPos(
                    hwnd,
                    Some(HWND_TOP),
                    0,
                    0,
                    0,
                    0,
                    SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW | SWP_FRAMECHANGED,
                );
            } else {
                // 经典模式：找到 0x052C 生成的 WorkerW（不含 SHELLDLL_DefView 的那个）
                let mut target = HWND::default();
                let _ = EnumWindows(
                    Some(enum_callback),
                    LPARAM(&mut target as *mut HWND as isize),
                );
                if !target.0.is_null() {
                    let _ = SetParent(hwnd, Some(target));
                    let _ = SetWindowPos(
                        hwnd,
                        Some(HWND_TOP),
                        0,
                        0,
                        0,
                        0,
                        SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW | SWP_FRAMECHANGED,
                    );
                }
            }
        }
    }

    unsafe extern "system" fn enum_callback(hwnd: HWND, lparam: LPARAM) -> windows::core::BOOL {
        if let Ok(defview) = FindWindowExA(Some(hwnd), None, s!("SHELLDLL_DefView"), None) {
            if !defview.0.is_null() {
                if let Ok(workerw) = GetWindow(hwnd, GW_HWNDNEXT) {
                    let out = &mut *(lparam.0 as *mut HWND);
                    *out = workerw;
                    return windows::core::BOOL(0); // 停止枚举
                }
            }
        }
        windows::core::BOOL(1)
    }
}

#[cfg(target_os = "macos")]
mod desktop_layer {
    use objc::{msg_send, sel, sel_impl};

    /// macOS：把窗口压到桌面层 —— 桌面壁纸与 Finder 桌面图标之上、所有应用窗口之下，
    /// 效果对齐 Windows 的 stick_to_desktop。同时加入所有 Space 且
    /// 在调度中心（Mission Control）里保持不动、不参与 Cmd+Tab 窗口循环。
    pub fn stick_to_desktop(window: &tauri::WebviewWindow) {
        use objc::runtime::Object;
        // CGWindowLevelForKey(kCGDesktopWindowLevelKey) = INT32_MIN + 20；+2 压过桌面图标层
        const K_CG_DESKTOP_WINDOW_LEVEL: i64 = i32::MIN as i64 + 20;
        const NS_WINDOW_CAN_JOIN_ALL_SPACES: u64 = 1 << 0;
        const NS_WINDOW_STATIONARY: u64 = 1 << 4;
        const NS_WINDOW_IGNORES_CYCLE: u64 = 1 << 6;
        if let Ok(ns_window) = window.ns_window() {
            unsafe {
                let ns_window = ns_window as *mut Object;
                let _: () = msg_send![ns_window, setLevel: K_CG_DESKTOP_WINDOW_LEVEL + 2];
                let _: () = msg_send![ns_window, setCollectionBehavior:
                    NS_WINDOW_CAN_JOIN_ALL_SPACES | NS_WINDOW_STATIONARY | NS_WINDOW_IGNORES_CYCLE];
            }
        }
    }
}

/// 读取剪贴板富文本（Windows CF_HTML → HTML 字符串）。
/// 微信/浏览器复制的图文都带 HTML 格式；纯文本剪贴板返回 None。
/// CF_HTML 可能带 <!--StartFragment--> 标记，只截取 fragment 部分（取不到标记就给全文）。
#[tauri::command]
fn read_clipboard_html() -> Option<String> {
    use clipboard_rs::{Clipboard, ClipboardContext};
    let raw = ClipboardContext::new().ok()?.get_html().ok()?;
    let html = match (raw.find("<!--StartFragment-->"), raw.find("<!--EndFragment-->")) {
        (Some(s), Some(e)) if e > s => raw[s + "<!--StartFragment-->".len()..e].to_string(),
        _ => raw,
    };
    if html.trim().is_empty() {
        None
    } else {
        Some(html)
    }
}

/// 唤出主窗口；已被红色叉号销毁（macOS 关窗不退出）则原地重建。
/// 单实例回调与 macOS 程序坞点击（RunEvent::Reopen）共用。
fn open_or_rebuild_main(app: &tauri::AppHandle) {
    use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
    match app.get_webview_window("main") {
        Some(w) => {
            let _ = w.unminimize();
            let _ = w.show();
            let _ = w.set_focus();
        }
        None => {
            let _ = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("/".into()))
                .title("Remainder")
                .inner_size(1200.0, 800.0)
                .min_inner_size(900.0, 600.0)
                .build();
        }
    }
}

fn main() {
    let shortcut_plugin = tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, shortcut, event| {
            use tauri::Manager;
            use tauri_plugin_global_shortcut::{Code, Modifiers, ShortcutState};
            if event.state() != ShortcutState::Pressed {
                return;
            }
            if shortcut.matches(Modifiers::CONTROL | Modifiers::ALT, Code::Space) {
                if let Some(w) = app.get_webview_window("capture") {
                    // 热键切换：可见则隐藏，隐藏则显示并聚焦
                    if w.is_visible().unwrap_or(false) {
                        let _ = w.hide();
                    } else {
                        let _ = w.show();
                        let _ = w.set_focus();
                    }
                }
            }
        })
        .with_shortcut("ctrl+alt+space")
        .expect("failed to register global shortcut")
        .build();

    tauri::Builder::default()
        // 单实例：再次启动（双击桌面图标/exe）时把主窗口唤到前台；
        // 若主窗口已被用户关闭（窗口对象已销毁），则原地重建
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            open_or_rebuild_main(app);
        }))
        .invoke_handler(tauri::generate_handler![read_clipboard_html])
        .plugin(shortcut_plugin)
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            #[cfg(target_os = "windows")]
            {
                use tauri::Manager;
                if let Some(widget) = app.get_webview_window("widget") {
                    // 组件位置按主屏尺寸动态计算：右边缘内侧 40px，避免小屏/缩放下飞出屏幕
                    if let Ok(Some(monitor)) = widget.current_monitor() {
                        let scale = monitor.scale_factor();
                        let logical_w = monitor.size().width as f64 / scale;
                        let x = (logical_w - 300.0 - 40.0).max(0.0);
                        let _ = widget.set_position(tauri::Position::Logical(
                            tauri::LogicalPosition::new(x, 100.0),
                        ));
                    }
                    if let Ok(hwnd) = widget.hwnd() {
                        desktop_layer::stick_to_desktop(hwnd);
                    }
                }
                // 桌宠：定位到屏幕右下角（任务栏上方），保持置顶悬浮
                if let Some(pet) = app.get_webview_window("pet") {
                    if let Ok(Some(monitor)) = pet.current_monitor() {
                        let scale = monitor.scale_factor();
                        let lw = monitor.size().width as f64 / scale;
                        let lh = monitor.size().height as f64 / scale;
                        let _ = pet.set_position(tauri::Position::Logical(
                            tauri::LogicalPosition::new(lw - 140.0 - 30.0, lh - 200.0 - 60.0),
                        ));
                    }
                }
            }
            #[cfg(target_os = "macos")]
            {
                use tauri::Manager;
                // macOS：嵌入桌面层（NSWindow level），不再置顶悬浮
                if let Some(widget) = app.get_webview_window("widget") {
                    desktop_layer::stick_to_desktop(&widget);
                    // 组件位置按主屏尺寸动态计算：右边缘内侧 40px，避免小屏/缩放下飞出屏幕
                    if let Ok(Some(monitor)) = widget.current_monitor() {
                        let scale = monitor.scale_factor();
                        let logical_w = monitor.size().width as f64 / scale;
                        let x = (logical_w - 300.0 - 40.0).max(0.0);
                        let _ = widget.set_position(tauri::Position::Logical(
                            tauri::LogicalPosition::new(x, 100.0),
                        ));
                    }
                }
                // 桌宠：定位到屏幕右下角（程序坞上方），保持置顶悬浮
                if let Some(pet) = app.get_webview_window("pet") {
                    if let Ok(Some(monitor)) = pet.current_monitor() {
                        let scale = monitor.scale_factor();
                        let lw = monitor.size().width as f64 / scale;
                        let lh = monitor.size().height as f64 / scale;
                        let _ = pet.set_position(tauri::Position::Logical(
                            tauri::LogicalPosition::new(lw - 140.0 - 30.0, lh - 200.0 - 60.0),
                        ));
                    }
                }
            }
            #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
            {
                use tauri::Manager;
                // Linux 等：无可用桌面层 API，降级为置顶悬浮窗
                if let Some(widget) = app.get_webview_window("widget") {
                    let _ = widget.set_always_on_top(true);
                    if let Ok(Some(monitor)) = widget.current_monitor() {
                        let scale = monitor.scale_factor();
                        let logical_w = monitor.size().width as f64 / scale;
                        let x = (logical_w - 300.0 - 40.0).max(0.0);
                        let _ = widget.set_position(tauri::Position::Logical(
                            tauri::LogicalPosition::new(x, 100.0),
                        ));
                    }
                }
                if let Some(pet) = app.get_webview_window("pet") {
                    if let Ok(Some(monitor)) = pet.current_monitor() {
                        let scale = monitor.scale_factor();
                        let lw = monitor.size().width as f64 / scale;
                        let lh = monitor.size().height as f64 / scale;
                        let _ = pet.set_position(tauri::Position::Logical(
                            tauri::LogicalPosition::new(lw - 140.0 - 30.0, lh - 200.0 - 60.0),
                        ));
                    }
                }
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // macOS：红色叉号只关窗不退出，点程序坞图标系统发 Reopen——唤出/重建主窗口
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = event {
                open_or_rebuild_main(app);
            }
            #[cfg(not(target_os = "macos"))]
            let _ = (app, event);
        });
}
