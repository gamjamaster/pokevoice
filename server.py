"""
PokéScan Server
Serves static files + proxies /api/identify to Gemini Vision API.
API key is kept server-side only — never exposed to the browser.

Local dev:  python server.py
Production: Deployed on Render (HTTPS provided by platform).
"""
import http.server
import ssl
import os
import sys
import subprocess
import json
from urllib.request import Request, urlopen
from urllib.error import HTTPError

# ===== Configuration ==============================================
PORT = int(os.environ.get('PORT', 8443))
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', '')
GEMINI_MODEL = os.environ.get('GEMINI_MODEL', 'gemini-2.5-flash')
IS_PRODUCTION = os.environ.get('RENDER', '') != ''  # Render sets this automatically
# ==================================================================

if not GEMINI_API_KEY:
    print("ERROR: GEMINI_API_KEY environment variable is not set.")
    print("  Local:  set GEMINI_API_KEY=your_key_here  (then run python server.py)")
    print("  Render: Add it in Dashboard → Environment Variables")
    sys.exit(1)

CERT_FILE = 'cert.pem'
KEY_FILE = 'key.pem'

os.chdir(os.path.dirname(os.path.abspath(__file__)))


def generate_cert():
    """Generate a self-signed certificate using the cryptography library."""
    try:
        from cryptography import x509
        from cryptography.x509.oid import NameOID
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import rsa
        import datetime
        import ipaddress
    except ImportError:
        print("[*] Installing cryptography package...")
        subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'cryptography', '-q'])
        from cryptography import x509
        from cryptography.x509.oid import NameOID
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import rsa
        import datetime
        import ipaddress

    print("[*] Generating self-signed certificate...")
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "PokeScan")])
    cert = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(datetime.datetime.utcnow())
        .not_valid_after(datetime.datetime.utcnow() + datetime.timedelta(days=365))
        .add_extension(
            x509.SubjectAlternativeName([
                x509.DNSName("localhost"),
                x509.IPAddress(ipaddress.ip_address("0.0.0.0")),
            ]),
            critical=False,
        )
        .sign(key, hashes.SHA256())
    )

    with open(KEY_FILE, "wb") as f:
        f.write(key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.TraditionalOpenSSL,
            serialization.NoEncryption(),
        ))
    with open(CERT_FILE, "wb") as f:
        f.write(cert.public_bytes(serialization.Encoding.PEM))
    print("[+] Certificate created!")


# Generate cert only for local development (Render provides HTTPS)
if not IS_PRODUCTION and (not os.path.exists(CERT_FILE) or not os.path.exists(KEY_FILE)):
    generate_cert()

# Start HTTPS server with proxy handler
class PokeScanHandler(http.server.SimpleHTTPRequestHandler):
    """Serves static files + proxies /api/identify to Gemini."""

    # Force HTTP/1.1 — Python http.server doesn't support HTTP/2.
    protocol_version = 'HTTP/1.1'

    def do_GET(self):
        """Serve static files (HTML, JS, CSS, etc.)."""
        super().do_GET()

    def do_PRI(self):
        """Reject HTTP/2 connection preface (PRI * HTTP/2.0).
        Browsers may attempt HTTP/2 over HTTPS; this server only supports HTTP/1.1."""
        self.send_error(505, 'HTTP Version Not Supported')

    def do_POST(self):
        if self.path == '/api/identify':
            self.proxy_gemini()
        else:
            self.send_error(404)

    def proxy_gemini(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length)

            url = (
                f'https://generativelanguage.googleapis.com/v1beta/'
                f'models/{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}'
            )
            req = Request(url, data=body, headers={'Content-Type': 'application/json'}, method='POST')
            resp = urlopen(req)
            result = resp.read()

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Length', str(len(result)))
            self.end_headers()
            self.wfile.write(result)

        except HTTPError as e:
            error_body = e.read().decode('utf-8', errors='replace')
            error_bytes = error_body.encode()
            self.send_response(e.code)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Length', str(len(error_bytes)))
            self.end_headers()
            self.wfile.write(error_bytes)

        except Exception as e:
            error_bytes = json.dumps({'error': str(e)}).encode()
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Length', str(len(error_bytes)))
            self.end_headers()
            self.wfile.write(error_bytes)

    def do_OPTIONS(self):
        """Handle CORS preflight."""
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

httpd = http.server.HTTPServer(('0.0.0.0', PORT), PokeScanHandler)

if IS_PRODUCTION:
    # Render provides HTTPS via reverse proxy — run plain HTTP
    print(f"\n{'=' * 50}")
    print(f"  HTTP server running on port {PORT} (production)")
    print(f"  Render provides HTTPS automatically.")
    print(f"{'=' * 50}\n")
else:
    # Local dev — use self-signed cert for HTTPS
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(CERT_FILE, KEY_FILE)
    context.set_alpn_protocols(['http/1.1'])
    httpd.socket = context.wrap_socket(httpd.socket, server_side=True)

    print(f"\n{'=' * 50}")
    print(f"  HTTPS server running on port {PORT}")
    print(f"  Local:  https://localhost:{PORT}/scan.html")
    print(f"  Phone:  https://YOUR_IP:{PORT}/scan.html")
    print(f"{'=' * 50}")
    print(f"  Your phone will show a security warning.")
    print(f"  Tap 'Advanced' -> 'Proceed' to continue.")
    print(f"{'=' * 50}\n")

httpd.serve_forever()
