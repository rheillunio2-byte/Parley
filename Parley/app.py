"""Coordinator web app: serves the dashboard and runs the multi-agent workflow."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json, sys
from client import run_workflow

ROOT = Path(__file__).parent
WEB = ROOT / 'web'
TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.json': 'application/json; charset=utf-8',
}


class App(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def reply(self, body, status=200, ctype='application/json; charset=utf-8'):
        b = body if isinstance(body, bytes) else body.encode()
        self.send_response(status)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(b)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(b)

    def serve_static(self, rel):
        target = (WEB / rel).resolve()
        # Only serve regular files that live inside web/ (blocks ../ traversal).
        if WEB.resolve() not in target.parents or not target.is_file() or target.suffix not in TYPES:
            self.reply(json.dumps({'error': 'Not found'}), 404)
            return
        self.reply(target.read_bytes(), ctype=TYPES[target.suffix])

    def do_GET(self):
        path = self.path.split('?', 1)[0]
        if path in ('/', '/index.html'):
            self.serve_static('index.html')
        elif path == '/health':
            self.reply(json.dumps({'status': 'ok', 'service': 'A2A Demo Coordinator'}))
        elif path.startswith('/static/'):
            self.serve_static(path[len('/static/'):])
        else:
            self.reply(json.dumps({'error': 'Not found'}), 404)

    def read_topic(self):
        data = json.loads(self.rfile.read(int(self.headers.get('Content-Length', '0'))))
        return data.get('topic', '')

    def do_POST(self):
        if self.path == '/api/run':
            try:
                result = run_workflow(self.read_topic())
                self.reply(json.dumps(result, ensure_ascii=False))
            except Exception as e:
                self.reply(json.dumps({'error': str(e)}), 400)
        elif self.path == '/api/run-stream':
            self.run_stream()
        else:
            self.reply(json.dumps({'error': 'Not found'}), 404)

    def run_stream(self):
        """Newline-delimited JSON: one event per agent state change, then a final result."""
        try:
            topic = self.read_topic()
            if not topic or not topic.strip():
                raise ValueError('Please enter a topic or task.')
        except Exception as e:
            self.reply(json.dumps({'error': str(e)}), 400)
            return
        self.send_response(200)
        self.send_header('Content-Type', 'application/x-ndjson; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Connection', 'close')
        self.end_headers()

        def emit(obj):
            self.wfile.write((json.dumps(obj, ensure_ascii=False) + '\n').encode())
            self.wfile.flush()

        try:
            result = run_workflow(topic, progress=lambda ev: emit({'type': 'progress', **ev}))
            emit({'type': 'result', 'data': result})
        except Exception as e:
            emit({'type': 'error', 'message': str(e)})
        self.close_connection = True


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    print(f'Open http://127.0.0.1:{port}', flush=True)
    ThreadingHTTPServer(('127.0.0.1', port), App).serve_forever()


if __name__ == '__main__':
    main()
