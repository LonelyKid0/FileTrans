"""FileTrans 浏览器端到端测试（Playwright / Chromium）。

覆盖：页面加载、新建文件夹、选择文件上传、拖拽上传、同名冲突、
图片/文本预览、下载校验、重命名、删除、打包下载、筛选、局域网地址展示、
移动端布局，并生成 docs/screenshot.png 与 docs/screenshot-mobile.png。

用法：
    python test/ui_test.py
"""

from __future__ import annotations

import hashlib
import io
import os
import random
import shutil
import socket
import subprocess
import sys
import time
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
PROJECT = ROOT / "src" / "FileTrans" / "FileTrans.csproj"
DLL = ROOT / "src" / "FileTrans" / "bin" / "Release" / "net8.0" / "FileTrans.dll"
TEST_DIR = ROOT / ".test"
SHARE = TEST_DIR / "ui-share"
DOCS = ROOT / "docs"
LOG_OUT = TEST_DIR / "ui-server.out.log"
LOG_ERR = TEST_DIR / "ui-server.err.log"

CHROME_CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
]

passes = 0
failures: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    global passes
    if condition:
        passes += 1
        print(f"  [PASS] {name}")
    else:
        failures.append(f"{name} {detail}".strip())
        print(f"  [FAIL] {name} {detail}")


def free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def wait_health(base: str, timeout: float = 45.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(base + "/api/health", timeout=2) as resp:
                if resp.status == 200:
                    return True
        except Exception:
            time.sleep(0.25)
    return False


def api_put(base: str, relative: str, data: bytes) -> None:
    url = base + "/api/files/content?path=" + urllib.parse.quote(relative, safe="")
    request = urllib.request.Request(
        url, data=data, method="PUT", headers={"Content-Type": "application/octet-stream"}
    )
    with urllib.request.urlopen(request, timeout=60) as resp:
        if resp.status not in (200, 201):
            raise RuntimeError(f"upload failed: {resp.status} {relative}")


def api_delete(base: str, relative: str) -> None:
    url = base + "/api/files/content?path=" + urllib.parse.quote(relative, safe="")
    request = urllib.request.Request(url, method="DELETE")
    with urllib.request.urlopen(request, timeout=30) as resp:
        if resp.status != 200:
            raise RuntimeError(f"delete failed: {resp.status} {relative}")


def make_png(width: int, height: int, color) -> bytes:
    from PIL import Image, ImageDraw

    image = Image.new("RGB", (width, height), color)
    draw = ImageDraw.Draw(image)
    for y in range(height):
        draw.line([(0, y), (width, y)], fill=(color[0], (color[1] + y) % 256, (color[2] + y // 2) % 256))
    draw.ellipse([width // 4, height // 4, width * 3 // 4, height * 3 // 4], outline=(255, 255, 255), width=4)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def make_jpeg(width: int, height: int) -> bytes:
    from PIL import Image, ImageDraw

    image = Image.new("RGB", (width, height), (32, 96, 180))
    draw = ImageDraw.Draw(image)
    draw.rectangle([20, 20, width - 20, height - 20], outline=(255, 210, 90), width=8)
    draw.ellipse([width // 3, height // 3, width * 2 // 3, height * 2 // 3], fill=(255, 150, 60))
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=88)
    return buffer.getvalue()


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> int:
    global passes
    if not DLL.exists():
        print("找不到构建产物，请先执行：dotnet build src\\FileTrans\\FileTrans.csproj -c Release")
        return 1

    TEST_DIR.mkdir(parents=True, exist_ok=True)
    DOCS.mkdir(parents=True, exist_ok=True)
    if SHARE.exists():
        shutil.rmtree(SHARE)
    SHARE.mkdir(parents=True)

    port = free_port()
    base = f"http://127.0.0.1:{port}"
    output = open(LOG_OUT, "w", encoding="utf-8")
    errors_file = open(LOG_ERR, "w", encoding="utf-8")
    server = subprocess.Popen(
        ["dotnet", str(DLL), "--port", str(port), "--data", str(SHARE), "--no-browser"],
        cwd=str(ROOT),
        stdout=output,
        stderr=errors_file,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )

    browser = None
    try:
        if not wait_health(base):
            print("测试服务启动失败，请查看 .test\\ui-server.out.log")
            return 1

        files_dir = TEST_DIR / "ui-files"
        if files_dir.exists():
            shutil.rmtree(files_dir)
        files_dir.mkdir(parents=True)

        text_path = files_dir / "界面上传测试.txt"
        text_content = "通过浏览器界面上传的测试文件。\n第二行：Hello FileTrans!"
        text_path.write_text(text_content, encoding="utf-8")

        binary_path = files_dir / "data-512k.bin"
        binary_bytes = bytes(random.Random(20261119).getrandbits(8) for _ in range(512 * 1024))
        binary_path.write_bytes(binary_bytes)

        image_path = files_dir / "preview.png"
        image_bytes = make_png(640, 400, (60, 90, 220))
        image_path.write_bytes(image_bytes)

        with sync_playwright() as playwright:
            launch_kwargs = {"headless": True, "args": ["--disable-gpu", "--no-first-run"]}
            try:
                browser = playwright.chromium.launch(channel="chrome", **launch_kwargs)
            except Exception:
                executable = next((p for p in CHROME_CANDIDATES if Path(p).exists()), None)
                if not executable:
                    raise RuntimeError("未找到可用的 Chrome / Edge")
                browser = playwright.chromium.launch(executable_path=executable, **launch_kwargs)

            context = browser.new_context(
                viewport={"width": 1440, "height": 900},
                locale="zh-CN",
                color_scheme="light",
                accept_downloads=True,
            )
            page = context.new_page()
            console_errors: list[str] = []
            bad_responses: list[str] = []
            page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
            page.on("pageerror", lambda err: console_errors.append(str(err)))
            page.on(
                "response",
                lambda resp: bad_responses.append(f"{resp.status} {resp.url}")
                if resp.status >= 400 and "/api/" in resp.url
                else None,
            )

            print("==> 页面加载")
            page.goto(base + "/", wait_until="networkidle")
            check("页面标题正确", "局域网文件快传" in page.title(), page.title())
            page.wait_for_selector(".file-row, #emptyState:not([hidden])")
            check("首页无脚本错误", len(console_errors) == 0, str(console_errors))
            check("共享目录为空提示", page.is_visible("#emptyState"))
            check("局域网地址已填充", len(page.input_value("#lanSelect")) > 0, page.input_value("#lanSelect"))
            check("服务器信息已显示", "FileTrans" in page.inner_text("#serverLine"), page.inner_text("#serverLine"))

            print("==> 新建文件夹")
            page.click("#newFolderBtn")
            page.wait_for_selector("#modalOverlay:not([hidden])")
            page.fill("#modalBody input.modal-input", "UI 测试目录")
            page.click("#modalOk")
            page.wait_for_selector(".file-row:has-text('UI 测试目录')", timeout=10000)
            check("新建文件夹后列表出现", page.locator(".file-row", has_text="UI 测试目录").count() == 1)
            check("文件夹图标为 folder", page.locator(".file-row", has_text="UI 测试目录").locator(".file-icon[data-kind='folder']").count() == 1)

            print("==> 选择文件上传")
            page.set_input_files("#fileInput", [str(text_path), str(binary_path), str(image_path)])
            page.wait_for_selector(".file-row:has-text('界面上传测试.txt')", timeout=30000)
            page.wait_for_selector(".file-row:has-text('data-512k.bin')", timeout=30000)
            page.wait_for_selector(".upload-item.done", timeout=30000)
            page.wait_for_timeout(600)
            binary_row = page.locator(".file-row", has_text="data-512k.bin")
            check("二进制文件上传成功", binary_row.count() == 1)
            check("文件大小显示正确", "512 KB" in binary_row.inner_text(), binary_row.inner_text())
            check("上传队列显示完成", "已完成" in page.inner_text("#uploadSummary"), page.inner_text("#uploadSummary"))

            print("==> 拖拽上传")
            page.evaluate(
                """async () => {
                    const dt = new DataTransfer();
                    dt.items.add(new File(['拖拽上传内容'], '拖拽测试.txt', { type: 'text/plain' }));
                    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
                }"""
            )
            page.wait_for_selector(".file-row:has-text('拖拽测试.txt')", timeout=30000)
            check("拖拽文件上传成功", page.locator(".file-row", has_text="拖拽测试.txt").count() == 1)

            print("==> 同名文件冲突")
            page.set_input_files("#fileInput", [str(text_path)])
            page.wait_for_selector("#modalOverlay:not([hidden])", timeout=20000)
            check("冲突时弹出确认框", "存在同名文件" in page.inner_text("#modalTitle"), page.inner_text("#modalTitle"))
            page.click("#modalCancel")
            page.wait_for_selector("#modalOverlay", state="hidden")
            page.wait_for_timeout(400)
            skipped = page.locator(".upload-item.skipped").count()
            check("选择跳过后标记为已跳过", skipped >= 1, f"skipped={skipped}")

            print("==> 图片预览")
            image_row = page.locator(".file-row", has_text="preview.png")
            image_row.locator("button[data-action='preview']").click()
            page.wait_for_selector("#previewOverlay:not([hidden])")
            page.wait_for_function(
                "() => { const img = document.querySelector('#previewBody img'); return img && img.complete && img.naturalWidth > 0; }",
                timeout=15000,
            )
            check("图片预览成功加载", page.evaluate("document.querySelector('#previewBody img').naturalWidth") > 0)
            page.click("#previewCloseBtn")
            page.wait_for_selector("#previewOverlay", state="hidden")

            print("==> 文本预览")
            page.locator(".file-row", has_text="界面上传测试.txt").locator("button[data-action='open']").click()
            page.wait_for_selector("#previewBody pre", timeout=15000)
            page.wait_for_function(
                "() => (document.querySelector('#previewBody pre')?.textContent || '').includes('Hello FileTrans')",
                timeout=15000,
            )
            check("文本预览内容正确", "Hello FileTrans" in page.inner_text("#previewBody pre"))
            page.click("#previewCloseBtn")
            page.wait_for_selector("#previewOverlay", state="hidden")

            print("==> 下载校验")
            with page.expect_download(timeout=30000) as download_info:
                page.locator(".file-row", has_text="data-512k.bin").locator("a[title='下载']").click()
            download = download_info.value
            saved = TEST_DIR / "ui-download.bin"
            download.save_as(saved)
            check("下载文件名正确", download.suggested_filename == "data-512k.bin", download.suggested_filename)
            check("下载内容 SHA256 一致", sha256(saved.read_bytes()) == sha256(binary_bytes))

            print("==> 进入文件夹并上传子文件")
            page.locator(".file-row", has_text="UI 测试目录").locator("button[data-action='open']").click()
            page.wait_for_function("() => decodeURIComponent(location.hash).includes('UI 测试目录')")
            page.wait_for_selector("#emptyState:not([hidden])")
            check("进入文件夹后显示空提示", "空" in page.inner_text("#emptyText"), page.inner_text("#emptyText"))
            nested_path = files_dir / "nested.txt"
            nested_path.write_text("nested content", encoding="utf-8")
            page.set_input_files("#fileInput", [str(nested_path)])
            page.wait_for_selector(".file-row:has-text('nested.txt')", timeout=30000)
            check("子文件夹内上传成功", page.locator(".file-row", has_text="nested.txt").count() == 1)
            page.locator("#breadcrumb .crumb").first.click()
            page.wait_for_selector(".file-row:has-text('UI 测试目录')", timeout=15000)
            check("面包屑返回根目录", page.locator(".file-row", has_text="UI 测试目录").count() == 1)

            print("==> 筛选")
            page.fill("#filterInput", "data-512")
            page.wait_for_timeout(300)
            check("筛选只显示匹配项", page.locator(".file-row").count() == 1, f"rows={page.locator('.file-row').count()}")
            page.fill("#filterInput", "")
            page.wait_for_timeout(300)
            check("清空筛选后恢复列表", page.locator(".file-row").count() >= 5)

            print("==> 重命名")
            row = page.locator(".file-row", has_text="拖拽测试.txt")
            row.locator("button[data-action='rename']").click()
            page.wait_for_selector("#modalOverlay:not([hidden])")
            page.fill("#modalBody input.modal-input", "重命名后的文件.txt")
            page.click("#modalOk")
            page.wait_for_selector(".file-row:has-text('重命名后的文件.txt')", timeout=15000)
            check("重命名成功", page.locator(".file-row", has_text="重命名后的文件.txt").count() == 1)
            check("旧名称已消失", page.locator(".file-row", has_text="拖拽测试.txt").count() == 0)

            print("==> 打包下载")
            with page.expect_download(timeout=60000) as zip_info:
                page.click("#zipBtn")
            zip_download = zip_info.value
            zip_path = TEST_DIR / "ui-archive.zip"
            zip_download.save_as(zip_path)
            with zipfile.ZipFile(zip_path) as archive:
                names = archive.namelist()
            check("ZIP 下载成功", zip_path.stat().st_size > 0)
            check("ZIP 包含根目录文件", "data-512k.bin" in names, str(names))
            check("ZIP 包含子目录文件", any(name.endswith("nested.txt") for name in names), str(names))

            print("==> 删除")
            page.locator(".file-row", has_text="重命名后的文件.txt").locator("button[data-action='delete']").click()
            page.wait_for_selector("#modalOverlay:not([hidden])")
            check("删除前确认", "删除" in page.inner_text("#modalTitle"), page.inner_text("#modalTitle"))
            page.click("#modalOk")
            page.wait_for_selector(".file-row:has-text('重命名后的文件.txt')", state="detached", timeout=15000)
            check("删除成功", page.locator(".file-row", has_text="重命名后的文件.txt").count() == 0)

            print("==> 局域网另一位用户：点对点发送与收件箱")
            page.click("#userChip")
            page.wait_for_selector("#modalOverlay:not([hidden])")
            page.fill("#modalBody input.modal-input", "主用户")
            page.click("#modalOk")
            page.wait_for_function(
                "() => document.getElementById('userNameLabel').textContent === '主用户'"
            )

            second_context = browser.new_context(
                viewport={"width": 1280, "height": 900},
                locale="zh-CN",
                color_scheme="light",
                accept_downloads=True,
            )
            second_page = second_context.new_page()
            second_page.goto(base + "/", wait_until="networkidle")
            second_page.wait_for_selector("#userChip")
            second_page.click("#userChip")
            second_page.wait_for_selector("#modalOverlay:not([hidden])")
            second_page.fill("#modalBody input.modal-input", "第二位用户")
            second_page.click("#modalOk")
            second_page.wait_for_function(
                "() => document.getElementById('userNameLabel').textContent === '第二位用户'"
            )
            check("第二位用户昵称设置成功", second_page.inner_text("#userNameLabel") == "第二位用户")

            page.click("#sendUserBtn")
            page.wait_for_selector("#modalBody .recipient-item", timeout=15000)
            page.evaluate("document.getElementById('toasts').textContent = ''")
            page.screenshot(path=str(DOCS / "screenshot-send.png"))
            check(
                "发送对话框列出在线用户",
                page.locator(".recipient-item", has_text="第二位用户").count() == 1,
                page.inner_text("#modalBody"),
            )
            check("在线人数显示为 2", "在线 2" in page.inner_text("#onlineCount"), page.inner_text("#onlineCount"))
            page.locator(".recipient-item", has_text="第二位用户").click()
            page.click("#modalOk")

            send_path = files_dir / "点对点发送.txt"
            send_content = "这是主用户发送给第二位用户的文件。"
            send_path.write_text(send_content, encoding="utf-8")
            page.set_input_files("#sendFileInput", str(send_path))
            page.wait_for_selector(".upload-item.done", timeout=30000)
            page.wait_for_timeout(600)
            check("上传面板显示发送对象", "发送给 第二位用户" in page.inner_text("#uploadTitle"), page.inner_text("#uploadTitle"))

            second_page.wait_for_selector("#inboxBadge:not([hidden])", timeout=25000)
            check("接收方出现收件角标", second_page.is_visible("#inboxBadge"))
            second_page.wait_for_selector("#inboxBtn")
            second_page.click("#inboxBtn")
            second_page.wait_for_selector(".delivery-card", timeout=15000)
            second_page.evaluate("document.getElementById('toasts').textContent = ''")
            second_page.screenshot(path=str(DOCS / "screenshot-inbox.png"))
            check(
                "收件箱显示发送人",
                second_page.locator(".delivery-card", has_text="来自 主用户").count() == 1,
                second_page.inner_text("#modalBody"),
            )
            check(
                "收件箱显示文件",
                second_page.locator(".delivery-file", has_text="点对点发送.txt").count() == 1,
            )

            with second_page.expect_download(timeout=30000) as delivered_info:
                second_page.locator(".delivery-file", has_text="点对点发送.txt").locator("a[title='下载']").click()
            delivered = delivered_info.value
            delivered_path = TEST_DIR / "ui-delivered.txt"
            delivered.save_as(delivered_path)
            check("接收方下载内容正确", delivered_path.read_text(encoding="utf-8") == send_content)

            check("普通列表不展示投递目录", "用户投递" not in page.inner_text("#fileList"))
            second_page.click("#modalOk")
            second_page.wait_for_selector("#modalOverlay", state="hidden")
            second_context.close()

            print("==> 准备截图")
            # 清理功能测试产生的临时内容，让截图更接近真实使用场景。
            for relative in ("UI 测试目录", "data-512k.bin", "preview.png", "界面上传测试.txt"):
                api_delete(base, relative)
            api_put(base, "照片/风景.jpg", make_jpeg(800, 520))
            api_put(base, "照片/城市夜景.jpg", make_jpeg(640, 420))
            api_put(base, "文档/产品手册.pdf", b"%PDF-1.7 sample")
            api_put(base, "文档/会议记录.docx", b"PK\x03\x04 sample docx")
            api_put(base, "文档/需求说明.md", "# 需求说明\n\n- 局域网互传\n- 浏览器访问\n".encode())
            api_put(base, "安装包/FileTrans-1.0.0.zip", b"PK\x03\x04 sample zip")
            api_put(base, "音乐/示例音频.mp3", b"ID3 sample mp3")
            api_put(base, "产品手册.pdf", b"%PDF-1.7 sample manual")
            api_put(base, "会议记录.docx", b"PK\x03\x04 sample docx")
            api_put(base, "风景.jpg", make_jpeg(960, 600))
            api_put(base, "备份数据.zip", b"PK\x03\x04 sample zip")
            api_put(base, "示例音频.mp3", b"ID3 sample mp3")
            api_put(base, "readme.txt", "FileTrans 局域网文件快传\n".encode())
            page.click("#refreshBtn")
            page.wait_for_selector(".file-row:has-text('照片')", timeout=15000)
            page.wait_for_timeout(800)
            page.evaluate("document.getElementById('uploadPanel').hidden = true")
            DOCS.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=str(DOCS / "screenshot.png"), full_page=True)
            check("桌面截图已生成", (DOCS / "screenshot.png").stat().st_size > 10000)

            print("==> 移动端布局")
            mobile = browser.new_context(
                viewport={"width": 390, "height": 844},
                locale="zh-CN",
                color_scheme="light",
                accept_downloads=True,
                is_mobile=True,
                has_touch=True,
            )
            mobile_page = mobile.new_page()
            mobile_page.goto(base + "/", wait_until="networkidle")
            mobile_page.wait_for_selector(".file-row", timeout=15000)
            overflow = mobile_page.evaluate(
                "() => document.documentElement.scrollWidth - window.innerWidth"
            )
            check("移动端无横向溢出", overflow <= 1, f"overflow={overflow}")
            mobile_page.screenshot(path=str(DOCS / "screenshot-mobile.png"), full_page=True)
            check("移动端截图已生成", (DOCS / "screenshot-mobile.png").stat().st_size > 5000)
            mobile.close()

            print("==> 控制台与网络检查")
            check("全流程无 JS 错误", len(console_errors) == 0, str(console_errors))
            check("全流程无 4xx/5xx 接口响应", len(bad_responses) == 0, str(bad_responses))

            context.close()

        return 0
    finally:
        if browser:
            try:
                browser.close()
            except Exception:
                pass
        if server.poll() is None:
            server.terminate()
            try:
                server.wait(timeout=8)
            except subprocess.TimeoutExpired:
                server.kill()
        output.close()
        errors_file.close()


def report() -> int:
    print()
    print("=" * 56)
    if failures:
        print(f"通过 {passes} 项，失败 {len(failures)} 项：")
        for item in failures:
            print(f"  - {item}")
        return 1
    print(f"全部通过：{passes} 项检查")
    return 0


if __name__ == "__main__":
    try:
        main()
    except Exception:
        import traceback

        traceback.print_exc()
        failures.append("UI 测试执行异常")
    sys.exit(report())
