#!/usr/bin/env python3
"""
IBKR Options Scanner 服务管理脚本
用法:
    python manage.py start   - 启动前端和后端服务
    python manage.py stop    - 停止所有服务
    python manage.py status  - 查看服务状态
    python manage.py restart - 重启所有服务
"""

import subprocess
import sys
import os
import signal
import time
import socket

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(BASE_DIR, "backend")
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")

BACKEND_PORT = 8000
FRONTEND_PORT = 5173


def is_port_in_use(port: int) -> bool:
    """检查端口是否被占用"""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('localhost', port)) == 0


def get_pid_on_port(port: int) -> list:
    """获取占用指定端口的进程 PID"""
    try:
        result = subprocess.run(
            ["lsof", "-ti", f":{port}"],
            capture_output=True, text=True
        )
        if result.stdout.strip():
            return [int(pid) for pid in result.stdout.strip().split('\n')]
    except Exception:
        pass
    return []


def kill_port(port: int):
    """杀死占用指定端口的进程"""
    pids = get_pid_on_port(port)
    for pid in pids:
        try:
            os.kill(pid, signal.SIGTERM)
            print(f"  已终止进程 PID {pid} (端口 {port})")
        except ProcessLookupError:
            pass
        except Exception as e:
            print(f"  无法终止进程 {pid}: {e}")


def start_backend():
    """启动后端服务"""
    print("启动后端服务...")
    if is_port_in_use(BACKEND_PORT):
        print(f"  端口 {BACKEND_PORT} 已被占用，先停止现有服务...")
        kill_port(BACKEND_PORT)
        time.sleep(1)

    # 使用 nohup 在后台启动
    log_file = os.path.join(BASE_DIR, "backend.log")
    cmd = f"cd {BACKEND_DIR} && nohup python3 -m uvicorn main:app --host 0.0.0.0 --port {BACKEND_PORT} > {log_file} 2>&1 &"
    subprocess.run(cmd, shell=True)

    # 等待服务启动
    for i in range(10):
        time.sleep(0.5)
        if is_port_in_use(BACKEND_PORT):
            print(f"  ✓ 后端已启动: http://localhost:{BACKEND_PORT}")
            return True

    print(f"  ✗ 后端启动失败，请查看日志: {log_file}")
    return False


def start_frontend():
    """启动前端服务"""
    print("启动前端服务...")
    if is_port_in_use(FRONTEND_PORT):
        print(f"  端口 {FRONTEND_PORT} 已被占用，先停止现有服务...")
        kill_port(FRONTEND_PORT)
        time.sleep(1)

    # 使用 nohup 在后台启动
    log_file = os.path.join(BASE_DIR, "frontend.log")
    cmd = f"cd {FRONTEND_DIR} && nohup npm run dev > {log_file} 2>&1 &"
    subprocess.run(cmd, shell=True)

    # 等待服务启动
    for i in range(10):
        time.sleep(0.5)
        if is_port_in_use(FRONTEND_PORT):
            print(f"  ✓ 前端已启动: http://localhost:{FRONTEND_PORT}")
            return True

    print(f"  ✗ 前端启动失败，请查看日志: {log_file}")
    return False


def stop_backend():
    """停止后端服务"""
    print("停止后端服务...")
    if is_port_in_use(BACKEND_PORT):
        kill_port(BACKEND_PORT)
        time.sleep(0.5)
        if not is_port_in_use(BACKEND_PORT):
            print("  ✓ 后端已停止")
            return True
        else:
            # 强制杀死
            for pid in get_pid_on_port(BACKEND_PORT):
                try:
                    os.kill(pid, signal.SIGKILL)
                except:
                    pass
            print("  ✓ 后端已强制停止")
            return True
    else:
        print("  后端未运行")
        return True


def stop_frontend():
    """停止前端服务"""
    print("停止前端服务...")
    if is_port_in_use(FRONTEND_PORT):
        kill_port(FRONTEND_PORT)
        time.sleep(0.5)
        # 同时杀死 vite 相关进程
        subprocess.run("pkill -f 'vite' 2>/dev/null", shell=True)
        if not is_port_in_use(FRONTEND_PORT):
            print("  ✓ 前端已停止")
            return True
        else:
            print("  ✗ 前端停止失败")
            return False
    else:
        print("  前端未运行")
        return True


def status():
    """显示服务状态"""
    print("服务状态:")
    print(f"  后端 (:{BACKEND_PORT}): {'✓ 运行中' if is_port_in_use(BACKEND_PORT) else '✗ 未运行'}")
    print(f"  前端 (:{FRONTEND_PORT}): {'✓ 运行中' if is_port_in_use(FRONTEND_PORT) else '✗ 未运行'}")


def start():
    """启动所有服务"""
    print("=" * 40)
    print("IBKR Options Scanner 启动服务")
    print("=" * 40)
    start_backend()
    start_frontend()
    print("=" * 40)
    status()
    print("=" * 40)


def stop():
    """停止所有服务"""
    print("=" * 40)
    print("IBKR Options Scanner 停止服务")
    print("=" * 40)
    stop_backend()
    stop_frontend()
    print("=" * 40)


def restart():
    """重启所有服务"""
    stop()
    print()
    start()


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    command = sys.argv[1].lower()

    if command == "start":
        start()
    elif command == "stop":
        stop()
    elif command == "status":
        status()
    elif command == "restart":
        restart()
    else:
        print(f"未知命令: {command}")
        print(__doc__)
        sys.exit(1)


if __name__ == "__main__":
    main()
