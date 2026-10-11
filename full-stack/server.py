import fastapi
import sqlite3
import os
import time
import uvicorn
import socket

from fastapi import Request

from starlette.responses import HTMLResponse
from starlette.staticfiles import StaticFiles
from starlette.templating import Jinja2Templates

# ============================================================
# 1. 路径推算（多候选，自动兼容不同目录结构）
# ============================================================
current_file_path = os.path.abspath(__file__)
base_dir = os.path.dirname(current_file_path)  # ...\Full-stack
parent_dir = os.path.dirname(base_dir)  # ...\Invoice_Identification


def find_dir(*candidates):
    """返回第一个存在的目录；都不存在返回 None"""
    for c in candidates:
        if os.path.isdir(c):
            return c
    return None


# 依次尝试：
#   a) server.py 同级目录下的 frontend
#   b) 上一级目录下的 frontend
#   c) server.py 所在目录本身（index.html 与 server.py 平级的情况）
frontend_dir = find_dir(
    os.path.join(base_dir, "frontend"),
    os.path.join(parent_dir, "frontend"),
    base_dir,
)

if frontend_dir is None:
    raise FileNotFoundError(
        "❌ 找不到 frontend 目录，已尝试以下位置：\n"
        f"  1) {os.path.join(base_dir, 'frontend')}\n"
        f"  2) {os.path.join(parent_dir, 'frontend')}\n"
        f"  3) {base_dir}\n"
        "请确认 index.html 所在目录，并调整 find_dir 中的候选路径。"
    )

# 在 frontend 下再尝试找 static / node_modules，找不到就退化为 frontend 本身
static_dir = find_dir(
    os.path.join(frontend_dir, "static"),
    os.path.join(base_dir, "static"),
    os.path.join(parent_dir, "static"),
) or os.path.join(frontend_dir, "static")

node_modules_dir = find_dir(
    os.path.join(frontend_dir, "node_modules"),
    os.path.join(base_dir, "node_modules"),
    os.path.join(parent_dir, "node_modules"),
) or os.path.join(frontend_dir, "node_modules")

# 确保目录存在（避免 StaticFiles 报错）
os.makedirs(static_dir, exist_ok=True)
os.makedirs(node_modules_dir, exist_ok=True)

# ===============================
app = fastapi.FastAPI()


# ===============================

# ========== 挂载静态文件（添加容错，避免目录不存在导致启动失败） ==========
def mount_if_exists(url_prefix: str, folder: str, name: str):
    """目录存在才挂载；不存在则创建一个空目录并打印提示，避免 404 一片"""
    if not os.path.isdir(folder):
        print(f"⚠️  跳过挂载 {url_prefix} -> {folder}（目录不存在）")
        return False
    app.mount(url_prefix, StaticFiles(directory=folder), name=name)
    print(f"✅ 挂载 {url_prefix:14s} -> {folder}")
    return True


# 关键：把你 index.html 里实际用到的前缀都挂上
mount_if_exists("/static", os.path.join(frontend_dir, "static"), "static")
mount_if_exists("/node_modules", os.path.join(frontend_dir, "node_modules"), "node_modules")

templates = Jinja2Templates(directory=frontend_dir)

# ========== 接口：根路径 ==========
@app.get("/", response_class=HTMLResponse)
def read_root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


def get_ip():
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        try:
            s.connect(('8.8.8.8', 80))
            return s.getsockname()[0]
        except OSError:
            return '127.0.0.1'


if __name__ == '__main__':
    PORT = int(os.getenv("PORT", 8000))
    print(f"✅ 服务器运行中！局域网下其他设备请访问：http://{get_ip()}:{PORT}")
    time.sleep(1)
    uvicorn.run(
        "server:app",
        host="0.0.0.0",
        port=PORT,
        # reload=True,  # 可以重新开启热重载
    )
