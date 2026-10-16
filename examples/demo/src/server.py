"""A tiny orders API, for the Doctree demo."""
import json
from http.server import BaseHTTPRequestHandler, HTTPServer

ORDERS = [{"id": 1001, "paid": True}, {"id": 1002, "paid": False}]


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        body = json.dumps(ORDERS).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    HTTPServer(("127.0.0.1", 8000), Handler).serve_forever()
