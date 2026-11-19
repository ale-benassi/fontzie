from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        if parse_qs(urlparse(self.path).query).get('csp'):
            self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; font-src 'none'; frame-src 'self'")
        super().end_headers()
    def do_GET(self):
        if self.path == '/': self.path='/playground/'
        super().do_GET()
ThreadingHTTPServer(('127.0.0.1',4318),Handler).serve_forever()
