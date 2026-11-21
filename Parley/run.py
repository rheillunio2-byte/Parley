"""Starts the three remote-agent HTTP services and the browser coordinator."""
import sys, time, threading
from http.server import ThreadingHTTPServer
from agents.server import Handler
from app import App

SERVICES = [
    ("research", 18101),
    ("analysis", 18102),
    ("writer", 18103),
]

def main():
    servers=[]
    try:
        for kind, port in SERVICES:
            handler=type(f"{kind.title()}Handler", (Handler,), {"kind":kind})
            servers.append(ThreadingHTTPServer(("127.0.0.1",port),handler))
        servers.append(ThreadingHTTPServer(("127.0.0.1",18100),App))
        threads=[]
        for server in servers:
            thread=threading.Thread(target=server.serve_forever,daemon=True)
            thread.start(); threads.append(thread)
        print("All four services are running.")
        print("Open http://127.0.0.1:18100 in your browser.")
        print("Agent endpoints: 18101 (research), 18102 (analysis), 18103 (report)")
        print("Press Ctrl+C to stop all services.",flush=True)
        while all(t.is_alive() for t in threads): time.sleep(1)
    except KeyboardInterrupt:
        print("\nStopping services…")
    except OSError as e:
        print(f"Could not start services: {e}\nCheck whether ports 18100–18103 are already in use.")
        raise SystemExit(1)
    finally:
        for server in servers:
            server.shutdown(); server.server_close()

if __name__=="__main__": main()
